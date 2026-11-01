// 기념일: 위쪽 큰 카드(고정한 '지난 날부터 세기'), 가까운 순 목록, 지난 항목 접기 (명세서 5.3)
import { formatDday, formatKoreanDate, upcomingMilestones, type Item } from '@hanjibung/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { anniversaryRows, featureRow, useToday, type StatusRow } from '@/components/schedule/data';
import { AnniversaryRow, openItem, PastRow } from '@/components/schedule/ItemRow';
import { ShareCardModal } from '@/components/schedule/ShareCard';
import { Card, ChipBar, Empty, Fab, Icon, Screen, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { ALL, inFilter, spaceChips } from '@/lib/spaces';
import { fonts, radius, space, useTheme } from '@/theme';

function FeatureCard({ row, onShare }: { row: StatusRow; onShare: () => void }) {
  const { c, scheme } = useTheme();
  const today = useToday();
  const { item, status } = row;
  const milestones = item.milestones ? upcomingMilestones(item.date, today, item.countFromOne, 3) : [];
  const bg = scheme === 'dark' ? c.primaryTint : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}부터 ${status.headline}`}
      onPress={() => openItem(item.id)}
      style={({ pressed }) => [styles.feature, { backgroundColor: bg, opacity: pressed ? 0.92 : 1 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="caption" color={c.primaryCardMuted} numberOfLines={1}>
            {`${item.title}부터`}
          </T>
          <T v="display" color={c.primaryCardText} style={{ fontVariant: ['tabular-nums'] }}>
            {status.headline}
          </T>
          <T v="caption" color={c.primaryCardMuted}>
            {[formatKoreanDate(item.date, { year: true, weekday: false }), status.elapsed].filter(Boolean).join(' · ')}
          </T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="카드 이미지로 공유"
          onPress={onShare}
          hitSlop={4}
          style={({ pressed }) => [styles.shareBtn, { borderColor: c.primaryCardInner, opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="share" size={20} color={c.primaryCardText} />
        </Pressable>
      </View>
      {milestones.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {milestones.map((m) => (
            <View key={m.label} style={[styles.ms, { backgroundColor: c.primaryCardInner }]}>
              <T v="caption" color={c.primaryCardMuted} style={{ fontSize: 12 }} numberOfLines={1}>
                {m.label}
              </T>
              <T v="heading" color={c.primaryCardText} style={{ fontFamily: fonts.bold, fontVariant: ['tabular-nums'] }}>
                {formatDday(m.daysUntil)}
              </T>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

export default function Anniversaries() {
  const { c } = useTheme();
  const { items, spaces, settings } = useSession();
  const today = useToday();
  const [filter, setFilter] = useState(ALL);
  const [showPast, setShowPast] = useState(false);
  const [shareItem, setShareItem] = useState<Item | null>(null);

  const visible = useMemo(() => inFilter(items, filter), [items, filter]);
  const { upcoming, past } = useMemo(() => anniversaryRows(visible, today, settings.pinnedItemIds), [visible, today, settings.pinnedItemIds]);
  // 큰 카드는 걸러보기와 상관없이 고정한 항목을 보여준다
  const feature = useMemo(() => featureRow(items, today, settings.pinnedItemIds), [items, today, settings.pinnedItemIds]);
  const addAnniversary = () => router.push({ pathname: '/item/new', params: { kind: 'anniversary' } });

  return (
    <Screen contentStyle={{ gap: 18 }} footer={<Fab label="기념일 추가" onPress={addAnniversary} />}>
      <T v="title">기념일</T>

      {feature ? <FeatureCard row={feature} onShare={() => setShareItem(feature.item)} /> : null}

      <ChipBar options={spaceChips(spaces)} value={filter} onChange={setFilter} />

      {upcoming.length > 0 ? (
        <Card>
          {upcoming.map((row, i) => (
            <AnniversaryRow key={row.item.id} row={row} today={today} first={i === 0} />
          ))}
        </Card>
      ) : (
        <Empty text={past.length > 0 ? '다가오는 기념일이 없어요' : '아직 기념일이 없어요'} action={{ label: '추가', onPress: addAnniversary }} />
      )}

      {past.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            aria-expanded={showPast}
            onPress={() => setShowPast((v) => !v)}
            style={styles.pastToggle}>
            <T v="label" muted style={{ fontFamily: fonts.semibold }}>
              {`지난 항목 ${past.length}개`}
            </T>
            <View style={{ transform: [{ rotate: showPast ? '180deg' : '0deg' }] }}>
              <Icon name="chevron-down" size={18} color={c.muted} />
            </View>
          </Pressable>
          {showPast ? (
            <Card>
              {past.map((row, i) => (
                <PastRow key={row.item.id} row={row} first={i === 0} />
              ))}
            </Card>
          ) : null}
        </View>
      ) : null}

      <ShareCardModal item={shareItem} onClose={() => setShareItem(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  feature: { borderRadius: radius.xl, padding: space.xl, gap: 14 },
  shareBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ms: { flex: 1, minWidth: 0, borderRadius: radius.md, padding: 10, gap: 2 },
  pastToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
});
