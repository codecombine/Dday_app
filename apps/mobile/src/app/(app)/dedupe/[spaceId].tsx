// 중복 사진 정리 (시안 '중복 정리', 명세서 9장) — 그 공간 관리자만.
// 같은 파일·화질 낮은 사본은 원본을 남기고 나머지를 '지우기'로 미리 고르고, 비슷한 사진은 고르지 않는다.
import { isAdmin, type ApplyDedupeRequest, type ApplyDedupeResponse, type DedupeGroup, type DedupeKind, type Photo, type ScanResponse } from '@hanjibung/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { useDialog } from '@/components/photos/Sheet';
import { Button, Empty, IconButton, Segmented, T, TextButton } from '@/components/ui';
import { dateTimeLabel, formatBytes, personName, photoTime, subject, timeLabel } from '@/lib/photos/format';
import { errorText } from '@/lib/photos/upload';
import { removableCount, useDedupeGroups, usePhotoMap, usePhotos } from '@/lib/photos/use-photos';
import { useSession } from '@/lib/session';
import { myName, spaceLabel } from '@/lib/spaces';
import { fonts, radius, space, useTheme } from '@/theme';

const TABS: { id: DedupeKind; name: string; desc: string }[] = [
  { id: 'exact', name: '같은 파일', desc: '완전히 같은 파일이에요. 여러 가족이 같은 사진을 올린 경우로, 하나만 남겨도 잃는 것이 없습니다.' },
  { id: 'copy', name: '화질 낮은 사본', desc: '카톡 등으로 주고받으며 줄어든 사본이에요. 해상도가 가장 높고 촬영 정보가 남아 있는 사진을 원본으로 골랐어요.' },
  { id: 'similar', name: '비슷한 사진', desc: '연사처럼 비슷하지만 서로 다른 사진이에요. 자동으로 지울 사진을 고르지 않으니 필요하면 직접 골라주세요.' },
];

const key = (g: DedupeGroup, pid: string) => `${g.id}:${pid}`;

export default function Dedupe() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const { c, scheme } = useTheme();
  const { backend, spaceById, uid, members, me } = useSession();
  const dialog = useDialog();
  const space_ = spaceById[spaceId];
  const admin = !!space_ && isAdmin(space_, uid);
  const groupsBySpace = useDedupeGroups(admin ? [spaceId] : []);
  const { photos } = usePhotos();
  const byId = usePhotoMap(photos);
  const meName = myName(members, uid, me?.displayName ?? '나');

  // 화면에 그릴 수 있는 묶음 (사진이 2장 이상 보이는 것)
  const groups = useMemo(
    () => (groupsBySpace[spaceId] ?? []).filter((g) => g.photoIds.filter((id) => byId[id]).length >= 2).sort((a, b) => b.updatedAt - a.updatedAt),
    [groupsBySpace, spaceId, byId],
  );
  const firstKind = TABS.find((t) => groups.some((g) => g.kind === t.id))?.id ?? 'exact';
  const [tabState, setTab] = useState<DedupeKind | null>(null);
  const tab = tabState ?? firstKind;
  const [over, setOver] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isRemoved = (g: DedupeGroup, pid: string) => over[key(g, pid)] ?? (g.status === 'open' && g.kind !== 'similar' && pid !== g.keepPhotoId);
  const visibleIds = (g: DedupeGroup) => g.photoIds.filter((id) => byId[id]);

  const selection = groups
    .filter((g) => g.status === 'open')
    .map((g) => ({ g, remove: visibleIds(g).filter((id) => isRemoved(g, id)) }))
    .filter((x) => x.remove.length > 0);
  const removeCount = selection.reduce((n, x) => n + x.remove.length, 0);
  const removeBytes = selection.reduce((n, x) => n + x.remove.reduce((m, id) => m + (byId[id]?.bytes ?? 0), 0), 0);
  const spacePhotoCount = photos.filter((p) => p.spaceIds.includes(spaceId)).length;

  const toggle = (g: DedupeGroup, pid: string) => {
    const next = !isRemoved(g, pid);
    if (next && visibleIds(g).filter((id) => id !== pid && !isRemoved(g, id)).length === 0) {
      setMessage('묶음마다 한 장은 남겨야 해요');
      return;
    }
    setOver((o) => ({ ...o, [key(g, pid)]: next }));
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/album'));

  const rescan = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await backend.api<ScanResponse>('POST', `/spaces/${spaceId}/dedupe/scan`);
      setMessage(`다시 검사했어요 · 정리할 묶음 ${res.groups}개`);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (g: DedupeGroup) => {
    try {
      await backend.api('POST', `/dedupe/${g.id}/dismiss`);
    } catch (e) {
      setMessage(errorText(e));
    }
  };

  const apply = async () => {
    if (!removeCount) return;
    const ok = await dialog.ask({
      title: `선택한 ${removeCount}장을 휴지통으로 옮길까요?`,
      message: '30일 동안 되살릴 수 있어요. 지운 사본의 공유 범위와 앨범은 원본으로 합쳐집니다.',
      options: [
        { label: '휴지통으로', value: true, kind: 'primary' },
        { label: '취소', value: false, kind: 'ghost' },
      ],
    });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    let trashed = 0;
    let awaiting = 0;
    let failed = 0;
    for (const { g, remove } of selection) {
      const kept = visibleIds(g).filter((id) => !remove.includes(id));
      const keepPhotoId = kept.includes(g.keepPhotoId) ? g.keepPhotoId : kept[0];
      if (!keepPhotoId) continue;
      try {
        const res = await backend.api<ApplyDedupeResponse>('POST', `/dedupe/${g.id}/apply`, { keepPhotoId, removePhotoIds: remove } satisfies ApplyDedupeRequest);
        trashed += res.trashed.length;
        awaiting += res.awaitingOwner.length;
      } catch {
        failed += remove.length;
      }
    }
    setOver({});
    setBusy(false);
    setMessage(
      [`${trashed}장을 휴지통으로 옮겼어요`, awaiting ? `원본 주인 확인을 기다리는 사진 ${awaiting}장` : '', failed ? `실패 ${failed}장` : ''].filter(Boolean).join(' · '),
    );
  };

  const counts: Record<DedupeKind, string> = {
    exact: `${removableCount(groups.filter((g) => g.kind === 'exact'))}장`,
    copy: `${removableCount(groups.filter((g) => g.kind === 'copy'))}장`,
    similar: `${groups.filter((g) => g.kind === 'similar').length}묶음`,
  };
  const cur = TABS.find((t) => t.id === tab)!;
  const shown = groups.filter((g) => g.kind === tab);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, gap: 4 }}>
        <IconButton name="chevron-left" label="뒤로" onPress={back} />
        <T v="heading" style={{ fontSize: 18, fontFamily: fonts.bold, flexShrink: 1 }} numberOfLines={1}>
          중복 사진 정리
        </T>
        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: c.primaryTint, marginLeft: 4 }}>
          <T v="tiny" color={c.primary}>
            관리자 검토
          </T>
        </View>
        <View style={{ flex: 1 }} />
        {admin ? <TextButton label="다시 검사" onPress={rescan} disabled={busy} /> : null}
      </View>

      {!admin ? (
        <View style={{ padding: space.xl }}>
          <Empty text={space_ ? `${spaceLabel(space_)} 공간의 관리자만 중복 사진을 정리할 수 있어요.` : '공간을 찾을 수 없어요.'} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: 4, paddingBottom: 24 }}>
            <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 14 }}>
              <View style={{ backgroundColor: scheme === 'dark' ? c.primaryTint : c.primary, borderRadius: radius.lg, padding: space.lg, gap: 4 }}>
                <T v="caption" color={c.primaryCardMuted}>
                  {spaceLabel(space_)} 사진 {spacePhotoCount.toLocaleString()}장 검사 완료
                </T>
                <T v="title" color={c.primaryCardText} style={{ fontSize: 20, lineHeight: 28 }}>
                  {removeCount ? `${removeCount}장 정리하면 ${formatBytes(removeBytes)} 줄어요` : groups.length ? '정리할 사진을 골라주세요' : '정리할 중복 사진이 없어요'}
                </T>
              </View>

              <Segmented options={TABS.map((t) => ({ value: t.id, label: t.name, sub: counts[t.id] }))} value={tab} onChange={(v) => setTab(v)} />
              <T v="caption" color={c.inkSoft} style={{ lineHeight: 20 }}>
                {cur.desc}
              </T>
              {message ? (
                <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.primaryTint, borderRadius: radius.md, padding: 12 }}>
                  <T v="label" color={c.primary} style={{ fontSize: 13 }}>
                    {message}
                  </T>
                </View>
              ) : null}

              {shown.length === 0 ? <Empty text={`${cur.name}로 찾은 묶음이 없어요.`} /> : null}
              {shown.map((g) => (
                <GroupCard key={g.id} group={g} photos={visibleIds(g).map((id) => byId[id]!)} isRemoved={(id) => isRemoved(g, id)} onToggle={(id) => toggle(g, id)} onDismiss={() => dismiss(g)} meName={meName} />
              ))}
            </View>
          </ScrollView>

          <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: space.xl, paddingTop: 12, paddingBottom: 12 }}>
            <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 8 }}>
              <Button label={`선택한 ${removeCount}장 휴지통으로`} onPress={apply} loading={busy} disabled={!removeCount} />
              <T v="caption" muted center style={{ fontSize: 12 }}>
                30일 동안 되살릴 수 있어요. 지운 사본의 공유 범위와 앨범은 원본으로 합쳐집니다.
              </T>
            </View>
          </View>
        </>
      )}
      {dialog.element}
    </SafeAreaView>
  );
}

function GroupCard({
  group,
  photos: list,
  isRemoved: removed,
  onToggle,
  onDismiss,
  meName: mine,
}: {
  group: DedupeGroup;
  photos: Photo[];
  isRemoved: (id: string) => boolean;
  onToggle: (id: string) => void;
  onDismiss: () => void;
  meName: string;
}) {
  const { c } = useTheme();
  const { members, uid } = useSession();
  const keep = list.find((p) => p.id === group.keepPhotoId) ?? list[0]!;
  const owners = [...new Set(list.map((p) => p.ownerUid))];
  const awaiting = group.status === 'awaiting_owner';
  const title = group.kind === 'similar' ? dateTimeLabel(Math.min(...list.map(photoTime))) : dateTimeLabel(photoTime(keep));
  const note = awaiting
    ? '원본 주인 확인 중'
    : group.kind === 'similar'
      ? `비슷한 사진 ${list.length}장`
      : owners.length > 1
        ? `${owners.length}명이 올림`
        : `${subject(personName(members, owners[0]!, uid, mine))} 올림`;
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <T v="label" style={{ fontFamily: fonts.semibold }}>
          {title}
        </T>
        <T v="caption" muted style={{ fontSize: 12 }}>
          {note}
        </T>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {list.map((p) => {
          const rm = removed(p.id);
          const isKeep = p.id === group.keepPhotoId;
          const lines = metaLines(group, p, isKeep, personName(members, p.ownerUid, uid, mine));
          const ratio = Math.min(4 / 3, Math.max(3 / 4, p.width && p.height ? p.width / p.height : 4 / 3));
          return (
            <View key={p.id} style={{ width: '31%', flexGrow: 0, gap: 6 }}>
              <PhotoThumb id={p.id} width="100%" rounded={8} dim={rm} label={lines.join(', ')} style={{ aspectRatio: ratio }}>
                {isKeep && group.kind !== 'similar' ? (
                  <View style={{ position: 'absolute', top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: c.primary }}>
                    <T v="tiny" color={c.onPrimary} style={{ fontFamily: fonts.bold, fontSize: 10 }}>
                      원본
                    </T>
                  </View>
                ) : null}
              </PhotoThumb>
              <T v="tiny" color={c.inkSoft} style={{ fontFamily: fonts.regular, lineHeight: 15 }}>
                {lines.join('\n')}
              </T>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: rm, disabled: awaiting }}
                accessibilityLabel={`${lines[0]} ${rm ? '지우기로 선택됨' : '남기기로 선택됨'}`}
                disabled={awaiting}
                onPress={() => onToggle(p.id)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: rm ? c.dangerBorder : c.border,
                  backgroundColor: rm ? c.dangerTint : c.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: awaiting ? 0.5 : pressed ? 0.7 : 1,
                })}>
                <T v="caption" color={rm ? c.danger : c.primary} style={{ fontFamily: fonts.semibold, fontSize: 12 }}>
                  {rm ? '지우기' : '남기기'}
                </T>
              </Pressable>
            </View>
          );
        })}
      </View>
      {!awaiting ? (
        <View style={{ alignItems: 'flex-end', marginBottom: -8 }}>
          <TextButton label="이 묶음 무시" onPress={onDismiss} />
        </View>
      ) : null}
    </View>
  );
}

/** 사진 아래 설명 줄 */
function metaLines(group: DedupeGroup, p: Photo, isKeep: boolean, name: string): string[] {
  const size = `${p.width}×${p.height} · ${formatBytes(p.bytes)}`;
  if (group.kind === 'similar') return [p.takenAt ? timeLabel(p.takenAt) : `${subject(name)} 올림`, size];
  const who = p.source === 'kakao' ? `${name} · 카톡 저장본` : p.source === 'screenshot' ? `${name} · 화면 캡처` : p.hasExif ? `${name} 폰` : `${subject(name)} 올림`;
  if (group.kind === 'exact') return isKeep ? [who, size] : [`${subject(name)} 올림`, '같은 파일'];
  return [who, size, p.hasExif ? '촬영 정보 있음' : '촬영 정보 없음'];
}
