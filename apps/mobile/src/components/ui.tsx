// 공용 UI 부품. 모든 화면은 이 부품과 useTheme()의 색만 쓴다 (하드코딩 색 금지).
import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { fonts, radius, space, useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Feather>['name'];

// ── 글자 ─────────────────────────────────────────────

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'tiny' | 'number';

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 46 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30 },
  heading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 15 },
  number: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, fontVariant: ['tabular-nums'] },
};

export function T({
  v = 'body',
  color,
  muted,
  style,
  children,
  numberOfLines,
  center,
}: {
  v?: Variant;
  color?: string;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  center?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[variants[v], { color: color ?? (muted ? c.muted : c.ink) }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme();
  return <Feather name={name} size={size} color={color ?? c.ink} />;
}

// ── 화면 틀 ──────────────────────────────────────────

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  contentStyle,
  footer,
  header,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  header?: ReactNode;
}) {
  const { c } = useTheme();
  const inner = [{ padding: space.xl, gap: space.xxl, paddingBottom: 120 }, contentStyle];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      {scroll ? (
        <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled">
          <View style={styles.maxWidth}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

/** 위쪽 막대: 왼쪽 버튼 · 제목 · 오른쪽 버튼 */
export function TopBar({
  title,
  left,
  right,
}: {
  title?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topSide}>{left}</View>
      <T v="heading" style={{ flex: 1, textAlign: 'center', fontSize: 17 }} numberOfLines={1}>
        {title ?? ''}
      </T>
      <View style={[styles.topSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

export function TextButton({
  label,
  onPress,
  strong,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  strong?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.textButton, (pressed || disabled) && { opacity: 0.5 }]}>
      <T v={strong ? 'bodyStrong' : 'body'} color={danger ? c.danger : strong ? c.primary : c.muted}>
        {label}
      </T>
    </Pressable>
  );
}

export function IconButton({
  name,
  label,
  onPress,
  color,
  size = 22,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}>
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

// ── 묶음 ─────────────────────────────────────────────

export function Card({ children, style, padded }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { c } = useTheme();
  return <View style={[{ backgroundColor: c.surface, borderRadius: radius.lg, overflow: 'hidden' }, padded && { padding: space.lg }, style]}>{children}</View>;
}

export function Section({
  title,
  action,
  children,
  gap = 10,
}: {
  title?: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
  gap?: number;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap }}>
      {(title || action) && (
        <View style={styles.sectionHeader}>
          {title ? <T v="heading">{title}</T> : <View />}
          {action && (
            <Pressable accessibilityRole="link" onPress={action.onPress} hitSlop={10}>
              <T v="caption" color={c.muted}>
                {action.label}
              </T>
            </Pressable>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <T v="label" muted style={{ fontFamily: fonts.semibold }}>
      {children}
    </T>
  );
}

/** 카드 안 한 줄: 왼쪽 라벨, 오른쪽 값. onPress가 있으면 눌림 */
export function Row({
  label,
  value,
  onPress,
  first,
  right,
  sub,
  danger,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  first?: boolean;
  right?: ReactNode;
  sub?: string;
  danger?: boolean;
}) {
  const { c } = useTheme();
  const body = (
    <View style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: c.line }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" color={danger ? c.danger : value !== undefined ? c.muted : c.ink} style={value !== undefined ? { fontSize: 14 } : undefined}>
          {label}
        </T>
        {sub ? <T v="caption" muted>{sub}</T> : null}
      </View>
      {value !== undefined && (
        <T v="label" style={{ flexShrink: 1, textAlign: 'right', fontSize: 15 }}>
          {value}
        </T>
      )}
      {right}
      {onPress && !right ? <Icon name="chevron-right" size={18} color={c.muted} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  );
}

// ── 입력 ─────────────────────────────────────────────

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {label ? (
        <T v="caption" muted>
          {label}
        </T>
      ) : null}
      <TextInput
        placeholderTextColor={c.muted}
        accessibilityLabel={label}
        {...props}
        style={[
          {
            fontFamily: fonts.medium,
            fontSize: 16,
            color: c.ink,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            minHeight: 48,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[styles.switchTrack, { backgroundColor: value ? c.primary : c.switchOff }]}>
      <View style={[styles.switchKnob, { left: value ? 23 : 3 }]} />
    </Pressable>
  );
}

export function ToggleRow({
  label,
  sub,
  value,
  onChange,
  first,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  first?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, { paddingVertical: 10 }, !first && { borderTopWidth: 1, borderTopColor: c.line }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" style={{ fontSize: 15 }}>
          {label}
        </T>
        {sub ? <T v="caption" muted style={{ fontSize: 12 }}>{sub}</T> : null}
      </View>
      <Toggle value={value} onChange={onChange} label={label} />
    </View>
  );
}

/** 체크 상자 줄 (공유 범위 선택 등) */
export function CheckRow({
  label,
  sub,
  checked,
  onPress,
  dot,
  first,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onPress: () => void;
  dot?: string;
  first?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.row, { minHeight: 52 }, !first && { borderTopWidth: 1, borderTopColor: c.line }]}>
      {dot ? <View style={[styles.dot10, { backgroundColor: dot }]} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" style={{ fontSize: 15 }}>
          {label}
        </T>
        {sub ? <T v="caption" muted style={{ fontSize: 12 }}>{sub}</T> : null}
      </View>
      <View
        style={[
          styles.checkbox,
          checked ? { backgroundColor: c.primary, borderWidth: 0 } : { borderColor: c.border, borderWidth: 1.5, backgroundColor: c.surface },
        ]}>
        {checked ? <Feather name="check" size={16} color={c.onPrimary} /> : null}
      </View>
    </Pressable>
  );
}

export function RadioGroup<V extends string>({
  title,
  options,
  value,
  onChange,
  disabled,
}: {
  title: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Card padded style={{ paddingBottom: 6 }}>
      <T v="bodyStrong" style={{ paddingBottom: 4 }}>
        {title}
      </T>
      <View accessibilityRole="radiogroup" accessibilityLabel={title}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled }}
              disabled={disabled}
              onPress={() => onChange(o.value)}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: disabled ? 0.6 : 1 }}>
              <View style={[styles.radioOuter, { borderColor: on ? c.primary : c.muted, borderWidth: on ? 2 : 1.5 }]}>
                {on ? <View style={[styles.radioInner, { backgroundColor: c.primary }]} /> : null}
              </View>
              <T v="label" style={{ fontFamily: fonts.regular }}>
                {o.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string; sub?: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: c.surfaceAlt }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: c.surface }]}>
            <T v="label" style={{ fontFamily: on ? fonts.bold : fonts.medium }}>
              {o.label}
            </T>
            {o.sub ? (
              <T v="tiny" muted>
                {o.sub}
              </T>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── 버튼 ─────────────────────────────────────────────

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'kakao' | 'danger' | 'ghost';
  icon?: IconName | ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const look = {
    primary: { bg: c.primary, fg: c.onPrimary, border: c.primary },
    secondary: { bg: c.surface, fg: c.ink, border: c.border },
    kakao: { bg: c.kakao, fg: c.onKakao, border: c.kakao },
    danger: { bg: c.dangerTint, fg: c.danger, border: c.dangerBorder },
    ghost: { bg: 'transparent', fg: c.muted, border: 'transparent' },
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: look.bg, borderColor: look.border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <>
          {typeof icon === 'string' ? <Feather name={icon as IconName} size={18} color={look.fg} /> : icon}
          <T v="bodyStrong" color={look.fg} style={{ fontSize: 16 }}>
            {label}
          </T>
        </>
      )}
    </Pressable>
  );
}

export function Fab({ onPress, label, icon = 'plus' }: { onPress: () => void; label: string; icon?: IconName }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: c.primary, shadowColor: c.shadow, opacity: pressed ? 0.85 : 1 },
      ]}>
      <Feather name={icon} size={24} color={c.onPrimary} />
    </Pressable>
  );
}

// ── 꼬리표·칩 ────────────────────────────────────────

export function SpaceTag({ name, color }: { name: string; color: string }) {
  const { tone } = useTheme();
  const t = tone(color);
  return (
    <View style={[styles.tag, { backgroundColor: t.tint }]}>
      <T v="tiny" color={t.text}>
        {name}
      </T>
    </View>
  );
}

export interface ChipOption {
  id: string;
  label: string;
  color?: string;
}

/** 공간 걸러보기 칩 (가로 스크롤) */
export function ChipBar({ options, value, onChange }: { options: ChipOption[]; value: string; onChange: (id: string) => void }) {
  const { c, tone } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.xl }} style={{ marginHorizontal: -space.xl, flexGrow: 0 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={[
              styles.chip,
              { backgroundColor: on ? c.primary : c.surface, borderColor: on ? c.primary : c.border },
            ]}>
            <View style={[styles.dot8, { backgroundColor: on ? c.onPrimary : o.color ? tone(o.color).dot : c.ink }]} />
            <T v="label" color={on ? c.onPrimary : c.ink}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Avatar({ label, color, ghost, size = 40 }: { label: string; color?: string; ghost?: boolean; size?: number }) {
  const { c, tone } = useTheme();
  const t = tone(color ?? c.primary);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ghost ? c.surface : t.tint,
        borderWidth: ghost ? 1.5 : 0,
        borderStyle: ghost ? 'dashed' : 'solid',
        borderColor: c.muted,
      }}>
      <T v="label" color={ghost ? c.muted : t.text} style={{ fontFamily: fonts.semibold }}>
        {label.slice(0, 1)}
      </T>
    </View>
  );
}

export function Empty({ text, action }: { text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <Card padded style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <T v="label" muted style={{ flex: 1, fontFamily: fonts.regular }}>
        {text}
      </T>
      {action ? <TextButton label={action.label} onPress={action.onPress} strong /> : null}
    </Card>
  );
}

export function Loading() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <T v="caption" muted style={{ fontSize: 12, lineHeight: 18 }}>
      {children}
    </T>
  );
}

const styles = StyleSheet.create({
  maxWidth: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.xxl },
  topBar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm },
  topSide: { minWidth: 72, justifyContent: 'center' },
  textButton: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: 14, minHeight: 48 },
  switchTrack: { width: 52, height: 32, borderRadius: 16, justifyContent: 'center' },
  switchKnob: {
    position: 'absolute',
    top: 3,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  checkbox: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  radioOuter: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  button: { minHeight: 52, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: space.lg },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start' },
  chip: { height: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot8: { width: 8, height: 8, borderRadius: 4 },
  dot10: { width: 10, height: 10, borderRadius: 5 },
});
