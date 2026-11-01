// 사진 올리기 (시안 '올리기'): 고르기 → 앨범·공유 범위·화질·알림 → 지문 계산 → 같은 파일 확인 → 올리기
import { isValidShare } from '@hanjibung/core';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlbumPicker } from '@/components/photos/AlbumPicker';
import { useTileSize } from '@/components/photos/PhotoGrid';
import { useDialog } from '@/components/photos/Sheet';
import { ShareScope } from '@/components/ShareScope';
import { Button, Card, Icon, Note, Row, T, TextButton, ToggleRow, TopBar } from '@/components/ui';
import { readTakenAt } from '@/lib/photos/analyze';
import { dateRangeLabel, formatBytes } from '@/lib/photos/format';
import { filesToLocal, pickPhotos, releaseLocal } from '@/lib/photos/pick';
import type { LocalPhoto, Quality } from '@/lib/photos/types';
import { addToExisting, analyzeAll, errorText, preparePhotos, runPool, uploadOne, UPLOAD_CONCURRENCY, estimateBytes, type Prepared } from '@/lib/photos/upload';
import { askPushPermissionOnce } from '@/lib/push';
import { useSession } from '@/lib/session';
import { fonts, radius, space, useTheme } from '@/theme';

type Status = 'waiting' | 'analyzing' | 'uploading' | 'done' | 'existing' | 'failed';
type Phase = 'pick' | 'ready' | 'working' | 'done';

const SHOWN = 8;

export default function Upload() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ album?: string }>();
  const { backend, settings, updateSettings, mySpaceIds, personalSpaceId, albums } = useSession();
  const dialog = useDialog();
  const tile = useTileSize(4);

  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [phase, setPhase] = useState<Phase>('pick');
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [albumId, setAlbumId] = useState<string | null>(params.album && albums.some((a) => a.id === params.album) ? params.album : null);
  const [albumOpen, setAlbumOpen] = useState(false);
  const initialShare = settings.lastShareSpaceIds.filter((s) => mySpaceIds.includes(s));
  const [spaceIds, setSpaceIds] = useState<string[]>(isValidShare(initialShare, mySpaceIds, personalSpaceId) ? initialShare : [personalSpaceId]);
  const [quality, setQuality] = useState<Quality>('original');
  const [notify, setNotify] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [progress, setProgress] = useState({ label: '', done: 0, total: 0 });
  const [result, setResult] = useState({ uploaded: 0, existing: 0, failed: 0 });
  const [error, setError] = useState<string | null>(null);
  const retryAnalyze = useRef<LocalPhoto[]>([]);
  const retryUpload = useRef<Prepared[]>([]);
  const stop = useRef(false);
  const autoPicked = useRef(false);

  const onlyMe = spaceIds.length === 1 && spaceIds[0] === personalSpaceId;
  const validShare = isValidShare(spaceIds, mySpaceIds, personalSpaceId);
  const busy = phase === 'working';

  const addPhotos = (list: LocalPhoto[]) => {
    if (!list.length) return;
    setPhotos((prev) => {
      const keys = new Set(prev.map((p) => p.key));
      return [...prev, ...list.filter((l) => !keys.has(l.key))];
    });
    setPhase((p) => (p === 'pick' ? 'ready' : p));
  };

  const pick = async () => {
    try {
      addPhotos(await pickPhotos());
    } catch (e) {
      setError(errorText(e));
    }
  };

  // 안드로이드: 화면을 열면 바로 갤러리를 연다 (웹은 브라우저가 막으므로 버튼으로)
  useEffect(() => {
    if (Platform.OS !== 'web' && !autoPicked.current) {
      autoPicked.current = true;
      void pick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 웹: 화면에 파일을 끌어놓기
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files?.length) addPhotos(filesToLocal(e.dataTransfer.files));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  // 나갈 때 웹 미리보기 주소 정리
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => releaseLocal(photosRef.current), []);

  // 찍은 날짜 범위 (네이티브는 고를 때 받은 EXIF, 웹은 파일에서 바로 읽는다)
  const [taken, setTaken] = useState<Record<string, number | null>>({});
  useEffect(() => {
    const missing = photos.filter((p) => !(p.key in taken));
    if (!missing.length) return;
    let alive = true;
    void Promise.all(missing.map(async (p) => [p.key, await readTakenAt(p)] as const)).then((pairs) => {
      if (alive) setTaken((t) => ({ ...t, ...Object.fromEntries(pairs) }));
    });
    return () => {
      alive = false;
    };
  }, [photos, taken]);
  const takenRange = useMemo(() => dateRangeLabel(photos.map((p) => taken[p.key]).filter((t): t is number => t != null)), [photos, taken]);

  const setOne = (key: string, s: Status) => setStatus((prev) => ({ ...prev, [key]: s }));

  const run = async (locals: LocalPhoto[], pendingUploads: Prepared[]) => {
    setPhase('working');
    setError(null);
    stop.current = false;
    retryAnalyze.current = [];
    retryUpload.current = [];
    const albumIds = albumId ? [albumId] : [];
    let uploaded = 0;
    let existing = 0;
    let failed = 0;
    try {
      // 1) 지문 계산
      locals.forEach((l) => setOne(l.key, 'analyzing'));
      setProgress({ label: '사진 확인 중', done: 0, total: locals.length });
      const seen = new Set<string>();
      const { analyzed, failed: bad } = await analyzeAll(
        locals,
        quality,
        (l, ok) => {
          seen.add(l.key);
          setProgress({ label: '사진 확인 중', done: seen.size, total: locals.length });
          setOne(l.key, ok ? 'waiting' : 'failed');
        },
        () => stop.current,
      );
      // 실패했거나 멈춰서 확인하지 못한 사진은 다시 올리기 목록으로
      const notSeen = locals.filter((l) => !seen.has(l.key));
      notSeen.forEach((l) => setOne(l.key, 'waiting'));
      failed += bad.length + notSeen.length;
      retryAnalyze.current.push(...bad.map((b) => b.local), ...notSeen);

      // 2) 같은 파일 확인
      let prepared: Prepared[] = [];
      if (analyzed.length) {
        try {
          prepared = await preparePhotos(backend, analyzed);
        } catch (e) {
          setError(errorText(e));
          analyzed.forEach((a) => setOne(a.local.key, 'failed'));
          retryAnalyze.current.push(...analyzed.map((a) => a.local));
          failed += analyzed.length;
        }
      }
      const fresh = [...pendingUploads, ...prepared.filter((p) => p.photoId)];
      const same = prepared.filter((p) => !p.photoId);
      same.forEach((p) => setOne(p.photo.local.key, 'existing'));
      existing += same.length;
      const existingIds = [...new Set(same.map((p) => p.existingPhotoId).filter((x): x is string => !!x))];
      let addExisting = false;
      if (existingIds.length) {
        const choice = await dialog.ask<'add' | 'skip'>({
          title: `이미 있는 사진 ${existingIds.length}장 — 공유 범위에 추가할까요?`,
          message: '같은 파일이 이미 올라와 있어서 다시 올리지 않아요. 추가하면 고른 공간과 앨범에서도 보여요.',
          options: [
            { label: '공유 범위에 추가', value: 'add', kind: 'primary' },
            { label: '그냥 건너뛰기', value: 'skip', kind: 'secondary' },
          ],
        });
        addExisting = choice === 'add';
      }

      // 3) 새 사진 올리기 (동시에 2장)
      let sent = 0;
      const startedUploads = new Set<Prepared>();
      setProgress({ label: '올리는 중', done: 0, total: fresh.length });
      await runPool(
        fresh,
        UPLOAD_CONCURRENCY,
        async (p) => {
          startedUploads.add(p);
          setOne(p.photo.local.key, 'uploading');
          try {
            await uploadOne(backend, p.photoId!, p.photo, { spaceIds, albumIds, notify: notify && !onlyMe });
            uploaded++;
            setOne(p.photo.local.key, 'done');
          } catch {
            failed++;
            retryUpload.current.push(p);
            setOne(p.photo.local.key, 'failed');
          }
          sent++;
          setProgress({ label: '올리는 중', done: sent, total: fresh.length });
        },
        () => stop.current,
      );
      // 멈춘 경우 남은 사진은 다시 올리기 목록으로
      const left = fresh.filter((p) => !startedUploads.has(p));
      retryUpload.current.push(...left);
      failed += left.length;

      // 4) 이미 있던 사진에 공유 범위·앨범 더하기
      if (addExisting) await addToExisting(backend, existingIds, spaceIds, albumIds);

      if (uploaded > 0 || addExisting) {
        void updateSettings({ lastShareSpaceIds: spaceIds });
        void askPushPermissionOnce(backend);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      // 다시 올리기면 앞선 결과에 더한다 (실패 수는 이번 결과로 바꾼다)
      setResult((r) => ({ uploaded: r.uploaded + uploaded, existing: r.existing + existing, failed }));
      setPhase('done');
    }
  };

  const start = () => {
    if (!photos.length || !validShare || busy) return;
    setResult({ uploaded: 0, existing: 0, failed: 0 });
    void run(photos, []);
  };

  const retry = () => {
    const a = retryAnalyze.current;
    const u = retryUpload.current;
    if (!a.length && !u.length) return;
    void run(a, u);
  };

  const close = () => {
    if (busy) {
      stop.current = true;
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/album');
  };

  const shown = showAll || photos.length <= SHOWN ? photos : photos.slice(0, SHOWN - 1);
  const more = photos.length - shown.length;
  const album = albums.find((a) => a.id === albumId);
  const origBytes = estimateBytes(photos, 'original');
  const saverBytes = estimateBytes(photos, 'saver');
  const failedCount = retryAnalyze.current.length + retryUpload.current.length;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar
        title={photos.length ? `사진 ${photos.length}장` : '사진 올리기'}
        left={<TextButton label={busy ? '멈추기' : phase === 'done' ? '닫기' : '취소'} onPress={close} />}
        right={
          phase === 'done' ? (
            <TextButton label="완료" strong onPress={close} />
          ) : (
            <TextButton label="올리기" strong onPress={start} disabled={!photos.length || !validShare || busy} />
          )
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: 8, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 18 }}>
          {photos.length === 0 ? (
            <Card padded style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
              <Icon name="image" size={32} color={c.muted} />
              <T v="body" muted center>
                {Platform.OS === 'web' ? '올릴 사진을 고르거나 이 화면에 끌어놓으세요.' : '갤러리에서 올릴 사진을 골라주세요.'}
              </T>
              <Button label="사진 고르기" icon="plus" onPress={pick} style={{ alignSelf: 'stretch' }} />
            </Card>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {shown.map((p, i) => (
                  <LocalThumb key={p.key} photo={p} index={i} status={status[p.key]} size={tile} />
                ))}
                {more > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`그 외 사진 ${more}장 모두 보기`}
                    onPress={() => setShowAll(true)}
                    style={{ width: tile, height: tile, borderRadius: radius.sm, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <T v="label" muted style={{ fontFamily: fonts.semibold }}>
                      +{more}
                    </T>
                  </Pressable>
                ) : null}
              </View>
              {phase === 'ready' ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <TextButton label="사진 더 고르기" onPress={pick} />
                  <TextButton
                    label="모두 빼기"
                    onPress={() => {
                      releaseLocal(photos);
                      setPhotos([]);
                      setPhase('pick');
                    }}
                  />
                </View>
              ) : null}
            </View>
          )}

          {phase === 'working' || phase === 'done' ? (
            <ProgressCard
              phase={phase}
              progress={progress}
              result={result}
              failedCount={failedCount}
              error={error}
              onRetry={retry}
              onDone={close}
            />
          ) : null}

          {phase !== 'done' ? (
            <View style={{ gap: 18, opacity: busy ? 0.5 : 1 }} pointerEvents={busy ? 'none' : 'auto'}>
              <Card>
                <Row first label="앨범" value={album?.name ?? '선택 안 함'} onPress={() => setAlbumOpen(true)} />
                <Row label="찍은 날짜" value={takenRange ? `${takenRange} (자동)` : '사진 정보에서 자동으로'} />
              </Card>

              <ShareScope
                value={spaceIds}
                onChange={setSpaceIds}
                note="사진은 한 번만 저장되고, 고른 공간의 가족이 모두 함께 봐요. 각자 폰에 따로 저장할 필요가 없습니다."
              />

              <View style={{ gap: 8 }}>
                <T v="label" muted style={{ fontFamily: fonts.semibold }}>
                  화질
                </T>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <QualityCard on={quality === 'original'} title="원본 그대로" desc={`약 ${formatBytes(origBytes)} · 화질 손실 없음`} onPress={() => setQuality('original')} />
                  <QualityCard on={quality === 'saver'} title="용량 절약" desc={`약 ${formatBytes(saverBytes)} · 긴 변 2048px`} onPress={() => setQuality('saver')} />
                </View>
              </View>

              <Card>
                <ToggleRow
                  first
                  label="가족에게 알림 보내기"
                  sub={onlyMe ? '나만 보기 사진은 알림을 보내지 않아요' : '볼 수 있는 가족에게 새 사진 알림이 가요'}
                  value={notify && !onlyMe}
                  onChange={(v) => !onlyMe && setNotify(v)}
                />
              </Card>
              {!validShare ? <Note>공유할 공간을 하나 이상 골라주세요.</Note> : null}
              <Button label={photos.length ? `사진 ${photos.length}장 올리기` : '올리기'} onPress={start} disabled={!photos.length || !validShare || busy} />
            </View>
          ) : null}
        </View>
      </ScrollView>
      <AlbumPicker visible={albumOpen} onClose={() => setAlbumOpen(false)} selected={albumId} onSelect={setAlbumId} newAlbumSpaceIds={spaceIds} />
      {dialog.element}
    </SafeAreaView>
  );
}

function LocalThumb({ photo, index, status, size }: { photo: LocalPhoto; index: number; status?: Status; size: number }) {
  const { c } = useTheme();
  const overlay =
    status === 'analyzing' || status === 'uploading' ? (
      <ActivityIndicator color={c.onPrimary} />
    ) : status === 'done' ? (
      <Icon name="check" size={20} color={c.onPrimary} />
    ) : status === 'existing' ? (
      <T v="tiny" color={c.onPrimary}>
        이미 있음
      </T>
    ) : status === 'failed' ? (
      <Icon name="alert-circle" size={20} color={c.onPrimary} />
    ) : null;
  const label = `선택한 사진 ${index + 1}${status === 'done' ? ', 올림' : status === 'failed' ? ', 실패' : status === 'existing' ? ', 이미 있음' : ''}`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.surfaceAlt }}>
      <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" recyclingKey={photo.key} accessible={false} />
      {overlay ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: status === 'failed' ? c.danger : c.shadow,
            opacity: status === 'failed' ? 0.85 : 1,
          }}>
          {overlay}
        </View>
      ) : null}
    </View>
  );
}

function QualityCard({ on, title, desc, onPress }: { on: boolean; title: string; desc: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={on}
      accessibilityLabel={`${title}, ${desc}`}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 64,
        borderRadius: radius.md + 2,
        borderWidth: on ? 2 : 1,
        borderColor: on ? c.primary : c.border,
        backgroundColor: c.surface,
        paddingHorizontal: 14,
        paddingVertical: on ? 11 : 12,
        gap: 2,
      }}>
      <T v="bodyStrong">{title}</T>
      <T v="caption" muted style={{ fontSize: 12 }}>
        {desc}
      </T>
    </Pressable>
  );
}

function ProgressCard({
  phase,
  progress,
  result,
  failedCount,
  error,
  onRetry,
  onDone,
}: {
  phase: Phase;
  progress: { label: string; done: number; total: number };
  result: { uploaded: number; existing: number; failed: number };
  failedCount: number;
  error: string | null;
  onRetry: () => void;
  onDone: () => void;
}) {
  const { c } = useTheme();
  const ratio = progress.total ? progress.done / progress.total : 0;
  if (phase === 'working') {
    return (
      <Card padded style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T v="label" style={{ fontFamily: fonts.semibold }}>
            {progress.label}
          </T>
          <T v="label" muted>
            {progress.done}/{progress.total}
          </T>
        </View>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={progress.label}
          accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}
          style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
          <View style={{ width: `${ratio * 100}%`, height: 6, backgroundColor: c.primary }} />
        </View>
        <Note>화면을 닫지 말고 잠시 기다려 주세요. 멈추면 남은 사진은 다시 올릴 수 있어요.</Note>
      </Card>
    );
  }
  return (
    <Card padded style={{ gap: 12 }}>
      <T v="heading">{result.failed ? '일부 사진을 올리지 못했어요' : '다 올렸어요'}</T>
      <T v="body" color={c.inkSoft}>
        올림 {result.uploaded}장 · 이미 있던 사진 {result.existing}장 · 실패 {result.failed}장
      </T>
      {error ? (
        <T v="caption" color={c.danger}>
          {error}
        </T>
      ) : null}
      {failedCount > 0 ? <Button label={`실패한 ${failedCount}장 다시 올리기`} kind="secondary" icon="refresh-cw" onPress={onRetry} /> : null}
      <Button label="앨범으로" onPress={onDone} />
    </Card>
  );
}
