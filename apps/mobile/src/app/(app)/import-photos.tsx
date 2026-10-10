// 폰 사진 전체 가져오기 (명세서 8.4): 기간·폴더·기본 공유 범위를 고르고, Wi-Fi·충전 중일 때 천천히 올린다.
// 안드로이드는 진행 위치를 저장해 두고 언제든 이어서 할 수 있다. 웹은 파일·폴더를 골라 올린다.
// 같은 파일은 건너뛰고, 사본 후보는 올린 뒤 중복 정리에서 검토한다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidShare } from '@hanjibung/core';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { ShareScope } from '@/components/ShareScope';
import { Button, Card, CheckRow, FieldLabel, IconButton, Note, Screen, Segmented, T, ToggleRow, TopBar } from '@/components/ui';
import { unmetCondition } from '@/lib/photos/conditions';
import { countAssets, ensureLibraryPermission, libraryAvailable, listFolders, nextAssets, type AssetCursor, type AssetRange, type Folder } from '@/lib/photos/library';
import { pickPhotos, releaseLocal } from '@/lib/photos/pick';
import type { LocalPhoto } from '@/lib/photos/types';
import { errorText, uploadBatch } from '@/lib/photos/upload';
import { useSession } from '@/lib/session';
import { fonts, radius, useTheme } from '@/theme';

type Period = 'all' | 'year' | '1y' | '3m';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'year', label: '올해' },
  { value: '1y', label: '최근 1년' },
  { value: '3m', label: '최근 3개월' },
];
const PAGE = 20;
const WAIT_MS = 30_000;

function periodFrom(p: Period): number | null {
  const now = new Date();
  if (p === 'year') return new Date(now.getFullYear(), 0, 1).getTime();
  if (p === '1y') return now.getTime() - 365 * 86_400_000;
  if (p === '3m') return now.getTime() - 92 * 86_400_000;
  return null;
}

interface Job {
  range: AssetRange;
  folderTitle: string;
  spaceIds: string[];
  wifiOnly: boolean;
  chargingOnly: boolean;
  cursor: AssetCursor | null;
  total: number;
  done: number;
  uploaded: number;
  existing: number;
  failed: number;
  finished: boolean;
  updatedAt: number;
}

const jobKey = (uid: string) => `hanjibung.import.job.${uid}`;

export default function ImportPhotos() {
  const { c } = useTheme();
  const { backend, uid, personalSpaceId, mySpaceIds } = useSession();
  const [period, setPeriod] = useState<Period>('all');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [spaceIds, setSpaceIds] = useState<string[]>([personalSpaceId]);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [chargingOnly, setChargingOnly] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [webFiles, setWebFiles] = useState<LocalPhoto[]>([]);
  const stopRef = useRef(false);
  const jobRef = useRef<Job | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));
  const validShare = isValidShare(spaceIds, mySpaceIds, personalSpaceId);

  // 저장된 작업과 폴더 목록
  useEffect(() => {
    if (!libraryAvailable) return;
    void (async () => {
      const raw = await AsyncStorage.getItem(jobKey(uid)).catch(() => null);
      if (raw) {
        const saved = JSON.parse(raw) as Job;
        jobRef.current = saved;
        setJob(saved);
      }
      const ok = await ensureLibraryPermission(false);
      setPermission(ok);
      if (ok) setFolders(await listFolders());
    })();
    return () => {
      stopRef.current = true;
    };
  }, [uid]);

  const persist = async (j: Job) => {
    jobRef.current = j;
    setJob(j);
    if (libraryAvailable) await AsyncStorage.setItem(jobKey(uid), JSON.stringify(j)).catch(() => {});
  };

  const askPermission = async () => {
    const ok = await ensureLibraryPermission(true);
    setPermission(ok);
    if (ok) setFolders(await listFolders());
  };

  // ── 안드로이드: 사진첩을 오래된 것부터 PAGE장씩 ──
  const runNative = async (start: Job) => {
    setRunning(true);
    setError(null);
    stopRef.current = false;
    let j = start;
    try {
      while (!stopRef.current) {
        const unmet = await unmetCondition(j);
        if (unmet) {
          setStatus(unmet);
          await new Promise((r) => setTimeout(r, WAIT_MS));
          continue;
        }
        setStatus('올리는 중');
        const page = await nextAssets(j.range, j.cursor, PAGE);
        if (!page.assets.length) {
          j = { ...j, finished: true, cursor: page.cursor, done: Math.max(j.done, j.total), updatedAt: Date.now() };
          await persist(j);
          setStatus('다 가져왔어요');
          break;
        }
        const res = await uploadBatch(backend, page.assets, { spaceIds: j.spaceIds }, () => stopRef.current);
        j = {
          ...j,
          cursor: page.cursor,
          done: j.done + page.assets.length,
          uploaded: j.uploaded + res.uploaded,
          existing: j.existing + res.existing,
          failed: j.failed + res.failed,
          total: Math.max(j.total, j.done + page.assets.length),
          updatedAt: Date.now(),
        };
        await persist(j);
      }
      if (stopRef.current && !j.finished) setStatus('멈췄어요. 언제든 이어서 할 수 있어요.');
    } catch (e) {
      setError(errorText(e));
      setStatus('문제가 생겨 멈췄어요. 이어서 하기를 눌러 다시 시도해 주세요.');
    } finally {
      setRunning(false);
    }
  };

  const startNative = async () => {
    if (!validShare) return;
    const folder = folders.find((f) => f.id === folderId);
    const range: AssetRange = { folderId, from: periodFrom(period), to: null };
    setStatus('사진 수를 세는 중');
    let total = 0;
    try {
      total = await countAssets(range);
    } catch (e) {
      setError(errorText(e));
    }
    const j: Job = {
      range,
      folderTitle: folder ? folder.title : '모든 폴더',
      spaceIds,
      wifiOnly,
      chargingOnly,
      cursor: null,
      total,
      done: 0,
      uploaded: 0,
      existing: 0,
      failed: 0,
      finished: false,
      updatedAt: Date.now(),
    };
    await persist(j);
    void runNative(j);
  };

  const discard = async () => {
    stopRef.current = true;
    jobRef.current = null;
    setJob(null);
    setStatus(null);
    await AsyncStorage.removeItem(jobKey(uid)).catch(() => {});
  };

  // ── 웹: 고른 파일을 10장씩 ──
  const pickWeb = async (directory: boolean) => {
    const list = await pickPhotos({ directory });
    if (!list.length) return;
    setWebFiles(list);
    setJob({ range: { folderId: null, from: null, to: null }, folderTitle: '', spaceIds, wifiOnly: false, chargingOnly: false, cursor: null, total: list.length, done: 0, uploaded: 0, existing: 0, failed: 0, finished: false, updatedAt: Date.now() });
  };

  const runWeb = async () => {
    const start = jobRef.current ?? job;
    if (!start || !validShare) return;
    setRunning(true);
    setError(null);
    stopRef.current = false;
    let j = { ...start, spaceIds };
    try {
      while (!stopRef.current && j.done < webFiles.length) {
        setStatus('올리는 중');
        const part = webFiles.slice(j.done, j.done + 10);
        const res = await uploadBatch(backend, part, { spaceIds: j.spaceIds }, () => stopRef.current);
        j = { ...j, done: j.done + part.length, uploaded: j.uploaded + res.uploaded, existing: j.existing + res.existing, failed: j.failed + res.failed, updatedAt: Date.now() };
        await persist(j);
      }
      if (j.done >= webFiles.length) {
        j = { ...j, finished: true };
        await persist(j);
        setStatus('다 가져왔어요');
        releaseLocal(webFiles);
      } else setStatus('멈췄어요. 이어서 올릴 수 있어요.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRunning(false);
    }
  };

  const progress = job ? (job.total ? Math.min(1, job.done / job.total) : job.finished ? 1 : 0) : 0;
  const isWeb = Platform.OS === 'web';
  const hasJob = !!job;

  return (
    <Screen edges={['top', 'bottom']} header={<TopBar left={<IconButton name="chevron-left" label="뒤로" onPress={back} />} title="폰 사진 전체 가져오기" />} contentStyle={{ paddingTop: 8, gap: 20 }}>
      <Note>
        {isWeb
          ? '컴퓨터에 있는 사진을 한꺼번에 올려요. 같은 파일은 건너뛰고, 비슷한 사본은 올린 뒤 중복 정리에서 검토할 수 있어요.'
          : '폰에 있는 사진을 오래된 것부터 천천히 올려요. 같은 파일은 건너뛰고, 비슷한 사본은 올린 뒤 중복 정리에서 검토할 수 있어요.'}
      </Note>

      {hasJob ? (
        <Card padded style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T v="bodyStrong">{job.finished ? '가져오기 완료' : running ? '가져오는 중' : '이어서 가져올 수 있어요'}</T>
            <T v="label" muted>
              {job.done.toLocaleString()} / {job.total.toLocaleString()}장
            </T>
          </View>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="가져오기 진행률"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
            <View style={{ width: `${progress * 100}%`, height: 8, backgroundColor: c.primary }} />
          </View>
          <T v="caption" color={c.inkSoft}>
            올림 {job.uploaded.toLocaleString()}장 · 같은 파일 건너뜀 {job.existing.toLocaleString()}장 · 실패 {job.failed.toLocaleString()}장
          </T>
          {!isWeb && job.folderTitle ? (
            <T v="caption" muted>
              {job.folderTitle === 'Camera' ? '카메라' : job.folderTitle} · {job.wifiOnly ? 'Wi-Fi' : ''}
              {job.wifiOnly && job.chargingOnly ? ' · ' : ''}
              {job.chargingOnly ? '충전 중' : ''}
              {!job.wifiOnly && !job.chargingOnly ? '조건 없음' : ''}
            </T>
          ) : null}
          {status ? (
            <T v="caption" color={c.primary} style={{ fontFamily: fonts.medium }}>
              {status}
            </T>
          ) : null}
          {error ? (
            <T v="caption" color={c.danger}>
              {error}
            </T>
          ) : null}
          {running ? (
            <Button label="멈추기" kind="secondary" icon="pause" onPress={() => (stopRef.current = true)} />
          ) : job.finished ? (
            <Button label="새로 가져오기" kind="secondary" onPress={discard} />
          ) : (
            <View style={{ gap: 8 }}>
              <Button
                label={job.done === 0 ? `${job.total.toLocaleString()}장 올리기 시작` : '이어서 가져오기'}
                icon={job.done === 0 ? 'upload' : 'play'}
                onPress={() => (isWeb ? runWeb() : runNative(jobRef.current ?? job))}
                disabled={isWeb && !validShare}
              />
              <Button label="처음부터 다시 고르기" kind="ghost" onPress={discard} />
            </View>
          )}
        </Card>
      ) : null}

      {!hasJob && !isWeb && libraryAvailable && permission === false ? (
        <Card padded style={{ gap: 10 }}>
          <T v="bodyStrong">사진 접근 권한이 필요해요</T>
          <T v="caption" muted>
            폰에 있는 사진을 읽으려면 권한을 허용해 주세요.
          </T>
          <Button label="권한 허용하기" onPress={askPermission} />
        </Card>
      ) : null}

      {!hasJob && !isWeb && permission ? (
        <>
          <View style={{ gap: 8 }}>
            <FieldLabel>기간</FieldLabel>
            <Segmented options={PERIODS} value={period} onChange={setPeriod} />
          </View>
          <View style={{ gap: 8 }}>
            <FieldLabel>폴더</FieldLabel>
            <Card>
              <CheckRow first label="모든 폴더" checked={folderId === null} onPress={() => setFolderId(null)} />
              {folders.map((f) => (
                <CheckRow key={f.id} label={f.title === 'Camera' ? '카메라' : f.title} checked={folderId === f.id} onPress={() => setFolderId(f.id)} />
              ))}
            </Card>
          </View>
        </>
      ) : null}

      {(!hasJob || (isWeb && !job.finished && !running)) && (isWeb || permission) ? (
        <ShareScope title="기본 공유 범위" value={spaceIds} onChange={setSpaceIds} note="가져온 사진은 가족에게 알림을 보내지 않아요. 나중에 사진마다 공유 범위를 바꿀 수 있어요." />
      ) : null}

      {!hasJob && !isWeb && permission ? (
        <>
          <View style={{ gap: 8 }}>
            <FieldLabel>올리는 조건</FieldLabel>
            <Card>
              <ToggleRow first label="Wi-Fi에 연결됐을 때만" value={wifiOnly} onChange={setWifiOnly} />
              <ToggleRow label="충전 중일 때만" value={chargingOnly} onChange={setChargingOnly} />
            </Card>
            <Note>조건이 맞지 않으면 기다렸다가 이어서 올려요. 화면을 닫으면 멈추고, 다시 열면 이어서 할 수 있어요.</Note>
          </View>
          <Button label="가져오기 시작" icon="download-cloud" onPress={startNative} disabled={!validShare} />
        </>
      ) : null}

      {!hasJob && isWeb ? (
        <View style={{ gap: 10 }}>
          <View style={{ backgroundColor: c.primaryTint, borderRadius: radius.md, padding: 14, gap: 4 }}>
            <T v="label" color={c.primary} style={{ fontSize: 13 }}>
              폰 사진첩은 안드로이드 앱에서 가져올 수 있어요
            </T>
            <T v="caption" color={c.ink}>
              웹에서는 컴퓨터의 사진 파일이나 폴더를 골라 올려요.
            </T>
          </View>
          <Button label="사진 여러 장 고르기" icon="image" onPress={() => pickWeb(false)} disabled={!validShare} />
          <Button label="폴더 통째로 고르기" icon="folder" kind="secondary" onPress={() => pickWeb(true)} disabled={!validShare} />
        </View>
      ) : null}

    </Screen>
  );
}
