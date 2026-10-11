// 아래에서 올라오는 시트와 확인·선택·입력 대화상자 (웹에서는 Alert가 동작하지 않아 직접 그린다)
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, T } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: c.shadow }]} />
        <View style={styles.wrap} pointerEvents="box-none">
          <View
            accessibilityViewIsModal
            style={[styles.card, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 12) + 8, shadowColor: c.shadow }]}>
            <View style={[styles.grabber, { backgroundColor: c.border }]} />
            {title ? (
              <T v="heading" style={{ fontSize: 17 }}>
                {title}
              </T>
            ) : null}
            {children ? (
              <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.md }} keyboardShouldPersistTaps="handled">
                {children}
              </ScrollView>
            ) : null}
            {footer}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface DialogOption<V> {
  label: string;
  value: V;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

interface AskRequest<V> {
  title: string;
  message?: string;
  options: DialogOption<V>[];
  input?: { placeholder?: string; initial?: string; maxLength?: number; label?: string };
}

type Pending = { req: AskRequest<unknown>; resolve: (r: { value: unknown; text: string } | null) => void };

/**
 * const dialog = useDialog(); … {dialog.element}
 * const v = await dialog.ask({ title, options: [...] })  → 고른 value 또는 null(닫음)
 * const name = await dialog.prompt({ title, initial })   → 입력한 글 또는 null
 */
export function useDialog() {
  const { c } = useTheme();
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const pendingRef = useRef<Pending | null>(null);

  const close = useCallback((result: { value: unknown; text: string } | null) => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    p?.resolve(result);
  }, []);

  const open = useCallback(<V,>(req: AskRequest<V>) => {
    return new Promise<{ value: V; text: string } | null>((resolve) => {
      pendingRef.current?.resolve(null);
      const p: Pending = { req: req as AskRequest<unknown>, resolve: resolve as Pending['resolve'] };
      pendingRef.current = p;
      setText(req.input?.initial ?? '');
      setPending(p);
    });
  }, []);

  const ask = useCallback(
    async <V,>(req: Omit<AskRequest<V>, 'input'>): Promise<V | null> => (await open<V>(req))?.value ?? null,
    [open],
  );

  const prompt = useCallback(
    async (req: { title: string; message?: string; initial?: string; placeholder?: string; maxLength?: number; confirmLabel?: string }): Promise<string | null> => {
      const r = await open<'ok' | 'cancel'>({
        title: req.title,
        message: req.message,
        input: { initial: req.initial, placeholder: req.placeholder, maxLength: req.maxLength, label: req.title },
        options: [
          { label: req.confirmLabel ?? '확인', value: 'ok', kind: 'primary' },
          { label: '취소', value: 'cancel', kind: 'ghost' },
        ],
      });
      if (!r || r.value !== 'ok') return null;
      const t = r.text.trim();
      return t ? t : null;
    },
    [open],
  );

  const req = pending?.req;
  const element = (
    <Sheet visible={!!req} onClose={() => close(null)} title={req?.title}>
      {req?.message ? (
        <T v="body" color={c.inkSoft}>
          {req.message}
        </T>
      ) : null}
      {req?.input ? (
        <Field
          value={text}
          onChangeText={setText}
          placeholder={req.input.placeholder}
          maxLength={req.input.maxLength}
          autoFocus
          accessibilityLabel={req.input.label}
          onSubmitEditing={() => close({ value: req.options[0]?.value, text })}
        />
      ) : null}
      <View style={{ gap: space.sm, paddingTop: 4 }}>
        {req?.options.map((o) => (
          <Button key={String(o.value)} label={o.label} kind={o.kind ?? 'secondary'} onPress={() => close({ value: o.value, text })} />
        ))}
      </View>
    </Sheet>
  );

  return { element, ask, prompt };
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '88%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xl,
    paddingTop: 10,
    gap: space.md,
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
});
