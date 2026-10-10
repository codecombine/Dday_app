// 사진 전체 화면 보기: 넘기기·확대, 정보(찍은 날·기기·올린 사람·공유 범위), 원본 다운로드,
// 공유 범위 바꾸기·앨범에 넣기·휴지통(올린 사람만)
import { canTrashPhoto, isValidShare, type Photo } from '@hanjibung/core';
import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StatusBar, useWindowDimensions, View, type ViewToken } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumPicker } from '@/components/photos/AlbumPicker';
import { Sheet, useDialog } from '@/components/photos/Sheet';
import { ZoomableImage } from '@/components/photos/ZoomableImage';
import { ShareScope } from '@/components/ShareScope';
import { Button, Card, Loading, Row, SpaceTag, T } from '@/components/ui';
import { saveOriginal } from '@/lib/photos/download';
import { dayLabel, formatBytes, fullDateTime, personName, photoTime } from '@/lib/photos/format';
import { errorText } from '@/lib/photos/upload';
import { getPhotoUrls, usePhotoUrls } from '@/lib/photos/urls';
import { usePhotos } from '@/lib/photos/use-photos';
import { useSession } from '@/lib/session';
import { ALL, inFilter, myName, tagsFor } from '@/lib/spaces';
import { dark } from '@/theme/colors';
import { fonts, useTheme } from '@/theme';

const SOURCE_LABEL: Record<Photo['source'], string> = { camera: '카메라', kakao: '카카오톡 저장본', screenshot: '화면 캡처', unknown: '알 수 없음' };

export default function PhotoViewer() {
  const params = useLocalSearchParams<{ id: string; filter?: string; album?: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { backend, uid, members, me, spaceById, albums, mySpaceIds, personalSpaceId } = useSession();
  const { photos, loaded } = usePhotos();
  const dialog = useDialog();

  // 앨범 화면에서 왔으면 그 앨범 안에서, 아니면 같은 공간 필터 안에서 넘겨 본다 (격자와 같은 순서)
  const list = useMemo(() => {
    const base = params.album ? photos.filter((p) => p.albumIds.includes(params.album!)) : inFilter(photos, params.filter ?? ALL);
    return [...base].sort((a, b) => photoTime(b) - photoTime(a));
  }, [photos, params.album, params.filter]);

  const [currentId, setCurrentId] = useState(params.id);
  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [sheet, setSheet] = useState<'info' | 'share' | 'album' | null>(null);
  const [shareDraft, setShareDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const listRef = useRef<FlatList<Photo>>(null);

  const index = Math.max(0, list.findIndex((p) => p.id === currentId));
  const photo = list.find((p) => p.id === currentId) ?? list[0] ?? null;
  const initialIndex = useRef<number | null>(null);
  if (initialIndex.current === null && list.length) initialIndex.current = Math.max(0, list.findIndex((p) => p.id === params.id));

  // 화면에 가까운 사진만 미리보기 주소를 받는다
  const nearIds = list.slice(Math.max(0, index - 2), index + 3).map((p) => p.id);
  const urls = usePhotoUrls(nearIds, 'preview');

  const viewable = useRef(({ viewableItems }: { viewableItems: ViewToken<Photo>[] }) => {
    const first = viewableItems[0]?.item;
    if (first) setCurrentId(first.id);
  }).current;

  const flash = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage((x) => (x === m ? null : x)), 2500);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/album'));
  const go = (d: number) => {
    const next = Math.min(list.length - 1, Math.max(0, index + d));
    if (next === index) return;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setCurrentId(list[next]!.id);
  };

  const isOwner = !!photo && canTrashPhoto(photo, uid);

  const download = async () => {
    if (!photo) return;
    setBusy(true);
    try {
      const urlsOrig = await getPhotoUrls(backend, [photo.id], 'original');
      const url = urlsOrig[photo.id];
      if (!url) throw new Error('원본 주소를 받지 못했어요');
      flash(await saveOriginal(url, photo.originalName || `${photo.id}.jpg`));
    } catch (e) {
      flash(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const saveShare = async () => {
    if (!photo || !isValidShare(shareDraft, mySpaceIds, personalSpaceId)) return;
    setBusy(true);
    try {
      await backend.api('PATCH', `/photos/${photo.id}`, { spaceIds: shareDraft });
      setSheet(null);
      flash('공유 범위를 바꿨어요');
    } catch (e) {
      flash(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleAlbum = async (albumId: string | null) => {
    if (!photo || !albumId) return;
    const next = photo.albumIds.includes(albumId) ? photo.albumIds.filter((a) => a !== albumId) : [...photo.albumIds, albumId];
    try {
      await backend.api('PATCH', `/photos/${photo.id}`, { albumIds: next });
    } catch (e) {
      flash(errorText(e));
    }
  };

  const trash = async () => {
    if (!photo) return;
    const ok = await dialog.ask({
      title: '이 사진을 휴지통으로 옮길까요?',
      message: '모든 공간에서 사라져요. 30일 동안 휴지통에서 되살릴 수 있어요.',
      options: [
        { label: '휴지통으로', value: true, kind: 'danger' },
        { label: '취소', value: false, kind: 'ghost' },
      ],
    });
    if (!ok) return;
    try {
      const neighbor = list[index + 1] ?? list[index - 1];
      await backend.api('POST', `/photos/${photo.id}/trash`);
      if (neighbor) setCurrentId(neighbor.id);
      else close();
    } catch (e) {
      flash(errorText(e));
    }
  };

  const fg = dark.ink;
  const bg = dark.bg;
  const meName = myName(members, uid, me?.displayName ?? '나');

  if (loaded && !photo && list.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <T color={fg}>사진을 찾을 수 없어요. 지워졌거나 볼 수 없는 사진이에요.</T>
        <Button label="돌아가기" kind="secondary" onPress={close} />
      </View>
    );
  }

  if (!list.length) return <Loading />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle="light-content" />
      <FlatList
        ref={listRef}
        data={list}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.id}
        initialScrollIndex={initialIndex.current ?? 0}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onViewableItemsChanged={viewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        renderItem={({ item }) => (
          <ZoomableImage
            uri={urls[item.id]}
            width={width}
            height={height}
            label={`${dayLabel(photoTime(item))} 사진`}
            onZoomChange={setZoomed}
            onTap={() => setChrome((v) => !v)}
          />
        )}
      />

      {chrome && photo ? (
        <>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: dark.shadow }}>
            <ViewerButton icon="x" label="닫기" color={fg} onPress={close} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <T v="label" color={fg} style={{ fontFamily: fonts.semibold }}>
                {dayLabel(photoTime(photo))}
              </T>
              <T v="tiny" color={dark.muted}>
                {index + 1} / {list.length}
              </T>
            </View>
            <ViewerButton icon="info" label="사진 정보" color={fg} onPress={() => setSheet('info')} />
          </View>

          {/* 웹·큰 화면: 이전·다음 버튼 */}
          {width >= 600 ? (
            <>
              {index > 0 ? (
                <View style={{ position: 'absolute', left: 8, top: height / 2 - 22 }}>
                  <ViewerButton icon="chevron-left" label="이전 사진" color={fg} onPress={() => go(-1)} />
                </View>
              ) : null}
              {index < list.length - 1 ? (
                <View style={{ position: 'absolute', right: 8, top: height / 2 - 22 }}>
                  <ViewerButton icon="chevron-right" label="다음 사진" color={fg} onPress={() => go(1)} />
                </View>
              ) : null}
            </>
          ) : null}

          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: insets.bottom + 8, paddingTop: 8, backgroundColor: dark.shadow }}>
            {message ? (
              <T v="caption" color={fg} center style={{ paddingBottom: 6 }}>
                {message}
              </T>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', maxWidth: 520, width: '100%', alignSelf: 'center' }}>
              <ActionButton icon="download" label="원본" color={fg} onPress={download} disabled={busy} />
              {isOwner ? (
                <>
                  <ActionButton
                    icon="users"
                    label="공유 범위"
                    color={fg}
                    onPress={() => {
                      setShareDraft(photo.spaceIds.filter((s) => mySpaceIds.includes(s)));
                      setSheet('share');
                    }}
                  />
                  <ActionButton icon="folder-plus" label="앨범에 넣기" color={fg} onPress={() => setSheet('album')} />
                  <ActionButton icon="trash-2" label="휴지통" color={fg} onPress={trash} />
                </>
              ) : (
                <ActionButton icon="info" label="정보" color={fg} onPress={() => setSheet('info')} />
              )}
            </View>
          </View>
        </>
      ) : null}

      {photo ? (
        <Sheet visible={sheet === 'info'} onClose={() => setSheet(null)} title="사진 정보">
          <Card style={{ backgroundColor: c.bg }}>
            <Row first label="찍은 날" value={photo.takenAt ? fullDateTime(photo.takenAt) : '정보 없음'} />
            <Row label="기기" value={photo.cameraModel ?? SOURCE_LABEL[photo.source]} />
            <Row label="올린 사람" value={`${personName(members, photo.ownerUid, uid, meName)} · ${fullDateTime(photo.createdAt)}`} />
            <Row label="크기" value={`${photo.width}×${photo.height} · ${formatBytes(photo.bytes)}`} />
            <Row label="출처" value={`${SOURCE_LABEL[photo.source]}${photo.hasExif ? '' : ' · 촬영 정보 없음'}`} />
          </Card>
          <View style={{ gap: 8 }}>
            <T v="label" muted style={{ fontFamily: fonts.semibold }}>
              공유 범위
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {tagsFor(photo.spaceIds, spaceById).map((t) => (
                <SpaceTag key={t.id} name={t.name} color={t.color} />
              ))}
            </View>
            {photo.albumIds.length ? (
              <T v="caption" muted>
                앨범: {albums.filter((a) => photo.albumIds.includes(a.id)).map((a) => a.name).join(', ')}
              </T>
            ) : null}
            {!isOwner ? (
              <T v="caption" muted>
                공유 범위와 앨범은 올린 사람만 바꿀 수 있어요.
              </T>
            ) : null}
          </View>
        </Sheet>
      ) : null}

      <Sheet
        visible={sheet === 'share'}
        onClose={() => setSheet(null)}
        title="공유 범위 바꾸기"
        footer={<Button label="저장" onPress={saveShare} loading={busy} disabled={!isValidShare(shareDraft, mySpaceIds, personalSpaceId)} />}>
        <ShareScope value={shareDraft} onChange={setShareDraft} note="내가 속하지 않은 공간의 공유는 그대로 남아요." />
      </Sheet>

      {photo ? (
        <AlbumPicker
          visible={sheet === 'album'}
          onClose={() => setSheet(null)}
          title="앨범에 넣기"
          selected={null}
          selectedIds={photo.albumIds}
          allowNone={false}
          onSelect={toggleAlbum}
          newAlbumSpaceIds={photo.spaceIds.filter((s) => mySpaceIds.includes(s))}
        />
      ) : null}
      {dialog.element}
    </GestureHandlerRootView>
  );
}

function ViewerButton({ icon, label, color, onPress }: { icon: 'x' | 'info' | 'chevron-left' | 'chevron-right'; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Feather name={icon} size={24} color={color} />
    </Pressable>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
  disabled,
}: {
  icon: 'download' | 'users' | 'folder-plus' | 'trash-2' | 'info';
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ minWidth: 64, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed || disabled ? 0.5 : 1 })}>
      <Feather name={icon} size={22} color={color} />
      <T v="tiny" color={color}>
        {label}
      </T>
    </Pressable>
  );
}
