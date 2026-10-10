// 공유 카드 (명세서 14장): 미리 보기 창에서 카드를 보여주고, 앱은 공유 창으로·웹은 PNG로 내보낸다.
// 카드는 테마와 상관없이 늘 같은 브랜드 색(남색)으로 그린다.
import type { Item } from '@hanjibung/core';
import { useRef, useState, type RefObject } from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View, type View as RNView } from 'react-native';

import { Button, T } from '@/components/ui';
import { light } from '@/theme/colors';
import { fonts, radius, space, useTheme } from '@/theme';

import { useToday } from './data';
import { exportShareCard, SHARE_ACTION_LABEL } from './shareCardCapture';
import { CARD_H, CARD_LAYOUT as L, CARD_W, shareCardData, type ShareCardData } from './shareCardData';

export function ShareCardView({ data, width, viewRef }: { data: ShareCardData; width: number; viewRef?: RefObject<RNView | null> }) {
  const s = width / CARD_W;
  return (
    <View
      ref={viewRef}
      collapsable={false}
      style={{ width, height: (width * CARD_H) / CARD_W, backgroundColor: light.primary, overflow: 'hidden', padding: L.pad * s }}>
      <View
        style={{
          position: 'absolute',
          width: L.circle.r * 2 * s,
          height: L.circle.r * 2 * s,
          borderRadius: L.circle.r * s,
          left: (L.circle.cx - L.circle.r) * s,
          top: (L.circle.cy - L.circle.r) * s,
          backgroundColor: light.primaryCardInner,
        }}
      />
      <T color={light.primaryCardMuted} style={{ fontFamily: fonts.semibold, fontSize: L.brandSize * s, lineHeight: L.brandSize * 1.3 * s }}>
        {L.brand}
      </T>
      <View style={{ flex: 1, justifyContent: 'center', gap: L.gap * s }}>
        <T
          color={light.primaryCardText}
          numberOfLines={2}
          style={{ fontFamily: fonts.semibold, fontSize: L.title * s, lineHeight: L.titleLH * s }}>
          {data.title}
        </T>
        <T
          color={light.primaryCardText}
          numberOfLines={1}
          style={{ fontFamily: fonts.bold, fontSize: L.big * s, lineHeight: L.big * 1.15 * s, marginLeft: -6 * s, fontVariant: ['tabular-nums'] }}>
          {data.big}
        </T>
        <View style={{ gap: 6 * s }}>
          <T color={light.primaryCardMuted} style={{ fontFamily: fonts.medium, fontSize: L.line1 * s, lineHeight: L.line1 * 1.3 * s }}>
            {data.line1}
          </T>
          {data.line2 ? (
            <T color={light.primaryCardMuted} style={{ fontFamily: fonts.regular, fontSize: L.line2 * s, lineHeight: L.line2 * 1.4 * s }}>
              {data.line2}
            </T>
          ) : null}
        </View>
      </View>
      <T color={light.primaryCardMuted} style={{ fontFamily: fonts.medium, fontSize: L.footerSize * s, lineHeight: L.footerSize * 1.3 * s }}>
        {L.footer}
      </T>
    </View>
  );
}

/** 카드 미리 보기 + 내보내기 창. item이 null이면 닫힌 상태 */
export function ShareCardModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const { c } = useTheme();
  const today = useToday();
  const { width, height } = useWindowDimensions();
  const ref = useRef<RNView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardW = Math.min(width - 48, (height - 260) * (CARD_W / CARD_H), 360);
  const data = item ? shareCardData(item, today) : null;

  const run = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await exportShareCard(ref, data);
      if (Platform.OS === 'web') onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '카드를 만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="닫기" style={[StyleSheet.absoluteFill, { backgroundColor: c.shadow }]} onPress={onClose} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <T v="heading" center>
            카드로 공유
          </T>
          {data ? (
            <View style={{ borderRadius: radius.md, overflow: 'hidden', alignSelf: 'center' }}>
              <ShareCardView data={data} width={cardW} viewRef={ref} />
            </View>
          ) : null}
          {error ? (
            <T v="caption" color={c.danger} center>
              {error}
            </T>
          ) : null}
          <Button label={SHARE_ACTION_LABEL} icon={Platform.OS === 'web' ? 'download' : 'share-2'} loading={busy} onPress={() => void run()} />
          <Button label="닫기" kind="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  sheet: { width: '100%', maxWidth: 420, borderRadius: radius.xl, padding: space.xl, gap: space.md },
});
