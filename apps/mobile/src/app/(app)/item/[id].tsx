// 항목 상세: 큰 숫자, 날짜·음력, 지난 기간, 다가오는 기념일 3개, 누구 일정, 공유 범위, 알림, 고정·공유·수정·삭제
import {
  addYears,
  canDeleteItem,
  canEditItem,
  diffDays,
  formatDday,
  formatKoreanDate,
  itemStatus,
  occurrencesBetween,
  upcomingMilestones,
  type Item,
} from '@hanjibung/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { confirmAsync } from '@/components/schedule/confirm';
import { useToday } from '@/components/schedule/data';
import { dateRangeText, isSince, lunarLong, REPEAT_LABEL, remindersText, timeRangeText } from '@/components/schedule/format';
import { SpaceTags } from '@/components/schedule/ItemRow';
import { ShareCardModal } from '@/components/schedule/ShareCard';
import { Button, Card, Empty, IconButton, Note, Row, Screen, Section, T, ToggleRow, TopBar } from '@/components/ui';
import { deleteItem } from '@/lib/items';
import { useSession } from '@/lib/session';
import { participantText } from '@/lib/spaces';
import { fonts, space, useTheme } from '@/theme';

function back() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function upcomingList(item: Item, today: string): { label: string; date: string; daysUntil: number }[] {
  if (isSince(item)) {
    return item.milestones ? upcomingMilestones(item.date, today, item.countFromOne, 3) : [];
  }
  if (item.repeat === 'none') return [];
  // 반복 항목: 앞으로 3회 (매년이면 3년, 매주면 3주)
  return occurrencesBetween(item, today, addYears(today, 3), 3).map((d) => ({
    label: formatKoreanDate(d, { year: true }),
    date: d,
    daysUntil: diffDays(today, d),
  }));
}

export default function ItemDetail() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, uid, mySpaceIds, members, backend, settings, updateSettings } = useSession();
  const today = useToday();
  const [shareItem, setShareItem] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const item = items.find((i) => i.id === id);

  const header = (title: string, right?: ReactNode) => (
    <TopBar title={title} left={<IconButton name="chevron-left" label="뒤로" onPress={back} />} right={right} />
  );

  if (!item) {
    return (
      <Screen edges={['top', 'bottom']} header={header('')}>
        <Empty text="항목을 찾을 수 없어요. 지워졌거나 볼 수 없는 공간으로 옮겨졌어요." action={{ label: '홈으로', onPress: () => router.replace('/') }} />
      </Screen>
    );
  }

  const status = itemStatus(item, today);
  const since = isSince(item);
  const canEdit = canEditItem(item, uid, mySpaceIds);
  const canDelete = canDeleteItem(item, uid);
  const pinned = settings.pinnedItemIds.includes(item.id);
  const owner = members.find((m) => m.uid === item.ownerUid)?.displayName ?? (item.ownerUid === uid ? '나' : '가족');
  const upcoming = upcomingList(item, today);
  const nextDate = status.nextDate ?? item.date;

  const dateLine = since
    ? `${formatKoreanDate(item.date, { year: true })}${diffDays(item.date, today) >= 0 ? '부터' : ' 시작'}`
    : item.repeat === 'none'
      ? dateRangeText(item, item.date, true)
      : `다음 ${formatKoreanDate(nextDate, { year: true })}`;

  const edit = () => router.push({ pathname: '/item/edit/[id]', params: { id: item.id } });
  const togglePin = (v: boolean) => {
    const next = v ? [item.id, ...settings.pinnedItemIds.filter((x) => x !== item.id)] : settings.pinnedItemIds.filter((x) => x !== item.id);
    updateSettings({ pinnedItemIds: next }).catch(() => {});
  };
  const remove = async () => {
    const ok = await confirmAsync('삭제할까요?', `'${item.title}'을(를) 모든 공간에서 지워요. 되돌릴 수 없어요.`, '삭제', true);
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteItem(backend, item.id);
      if (pinned) updateSettings({ pinnedItemIds: settings.pinnedItemIds.filter((x) => x !== item.id) }).catch(() => {});
      back();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      contentStyle={{ gap: 18, paddingTop: space.sm }}
      header={header(item.kind === 'anniversary' ? '기념일' : '일정', canEdit ? <IconButton name="edit-2" label="수정" onPress={edit} /> : undefined)}>
      <Card padded style={{ gap: 6 }}>
        <T v="title" style={{ fontSize: 20, lineHeight: 28 }}>
          {item.title}
        </T>
        <T v="display" color={c.primary} style={{ fontVariant: ['tabular-nums'] }}>
          {status.headline}
        </T>
        <T v="body" muted>
          {dateLine}
        </T>
        {item.lunar && item.repeat === 'yearly' ? (
          <T v="caption" muted>
            {`${lunarLong(item.lunar)} · 매년 음력으로 계산`}
          </T>
        ) : null}
        {status.elapsed ? (
          <T v="caption" muted>
            {`지난 기간 ${status.elapsed}`}
          </T>
        ) : null}
        <View style={{ marginTop: 6 }}>
          <SpaceTags spaceIds={item.spaceIds} />
        </View>
      </Card>

      {upcoming.length > 0 ? (
        <Section title={since ? '다가오는 기념일' : '다가오는 날'}>
          <Card>
            {upcoming.map((m, i) => (
              <Row
                key={`${m.label}${m.date}`}
                first={i === 0}
                label={m.label}
                sub={since ? formatKoreanDate(m.date, { year: true }) : undefined}
                right={
                  <T v="heading" color={c.primary} style={{ fontFamily: fonts.bold, fontVariant: ['tabular-nums'] }}>
                    {formatDday(m.daysUntil)}
                  </T>
                }
              />
            ))}
          </Card>
        </Section>
      ) : null}

      <Card>
        {item.kind === 'event' ? <Row first label="시각" value={timeRangeText(item)} /> : null}
        <Row first={item.kind !== 'event'} label="반복" value={since ? '지난 날부터 세기' : REPEAT_LABEL[item.repeat]} />
        {since ? <Row label="세는 방법" value={item.countFromOne ? '시작한 날이 1일째' : '시작한 날이 0일째'} /> : null}
        <Row label="누구 일정" value={participantText(item)} />
        <Row label="알림" value={remindersText(item.reminders)} />
        <Row label="만든 사람" value={owner} />
        <Row label="다른 가족 수정" value={item.coEdit ? '가능' : '만든 사람만'} />
      </Card>

      {item.memo ? (
        <Section title="메모">
          <Card padded>
            <T v="body">{item.memo}</T>
          </Card>
        </Section>
      ) : null}

      {item.kind === 'anniversary' ? (
        <Card>
          <ToggleRow first label="맨 위에 고정" sub="기념일 목록과 위젯에 먼저 보여요" value={pinned} onChange={togglePin} />
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <Button label="카드로 공유" kind="secondary" icon="share" onPress={() => setShareItem(item)} />
        {canEdit ? <Button label="수정" onPress={edit} /> : null}
        {canDelete ? <Button label="삭제" kind="danger" icon="trash-2" loading={deleting} onPress={() => void remove()} /> : null}
        {!canEdit ? <Note>{`${owner}만 고칠 수 있는 항목이에요.`}</Note> : null}
      </View>

      <ShareCardModal item={shareItem} onClose={() => setShareItem(null)} />
    </Screen>
  );
}
