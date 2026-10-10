// 홈: 오늘 날짜, 공간 칩, 다가오는 기념일 3개, 다가오는 일정 4개, 최근 사진 (명세서 7장)
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { anniversaryRows, upcomingEvents, useToday } from '@/components/schedule/data';
import { longDayTitle } from '@/components/schedule/format';
import { AnniversaryRow, EventRow } from '@/components/schedule/ItemRow';
import { Card, ChipBar, Empty, Fab, IconButton, Note, Screen, Section, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { ALL, inFilter, spaceChips } from '@/lib/spaces';
import { fonts, useTheme } from '@/theme';

export default function Home() {
  const { c } = useTheme();
  const { items, spaces, settings } = useSession();
  const today = useToday();
  const [filter, setFilter] = useState(ALL);
  const visible = useMemo(() => inFilter(items, filter), [items, filter]);
  const anns = useMemo(() => anniversaryRows(visible, today, settings.pinnedItemIds).upcoming.slice(0, 3), [visible, today, settings.pinnedItemIds]);
  const events = useMemo(() => upcomingEvents(visible, today, 4), [visible, today]);

  return (
    <Screen footer={<Fab label="일정 추가" onPress={() => router.push('/item/new')} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <T v="caption" color={c.primary} style={{ fontFamily: fonts.semibold, letterSpacing: 0.3 }}>
            한지붕
          </T>
          <T v="title" style={{ fontSize: 24, lineHeight: 32 }} >
            {longDayTitle(today)}
          </T>
        </View>
        <IconButton name="users" label="공간 관리" onPress={() => router.push('/me')} />
      </View>

      <ChipBar options={spaceChips(spaces)} value={filter} onChange={setFilter} />

      <Section title="다가오는 기념일" action={{ label: '전체 보기', onPress: () => router.push('/anniversaries') }}>
        {anns.length > 0 ? (
          <Card>
            {anns.map((row, i) => (
              <AnniversaryRow key={row.item.id} row={row} today={today} first={i === 0} home />
            ))}
          </Card>
        ) : (
          <Empty
            text="다가오는 기념일이 없어요"
            action={{ label: '추가', onPress: () => router.push({ pathname: '/item/new', params: { kind: 'anniversary' } }) }}
          />
        )}
      </Section>

      <Section title="다가오는 일정" action={{ label: '캘린더', onPress: () => router.push('/calendar') }}>
        {events.length > 0 ? (
          <Card>
            {events.map((o, i) => (
              <EventRow key={`${o.item.id}:${o.date}`} item={o.item} date={o.date} today={today} first={i === 0} />
            ))}
          </Card>
        ) : (
          <Empty text="다가오는 일정이 없어요" action={{ label: '추가', onPress: () => router.push('/item/new') }} />
        )}
      </Section>

      {/* 사진 담당 화면 묶음의 RecentPhotos로 바꿀 자리 */}
      <Section title="최근 사진" action={{ label: '앨범 보기', onPress: () => router.push('/album') }}>
        <Card padded>
          <Note>가족이 올린 사진은 앨범에서 볼 수 있어요.</Note>
        </Card>
      </Section>
    </Screen>
  );
}
