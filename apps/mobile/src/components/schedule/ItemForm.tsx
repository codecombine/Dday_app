// 일정·기념일 추가/수정 양식 (명세서 4·5장, 시안 NewEvent). 저장은 lib/items.saveItem으로만 한다.
import {
  diffDays,
  formatKoreanDate,
  isValidISODate,
  isValidShare,
  LUNAR_MAX_YEAR,
  LUNAR_MIN_YEAR,
  solarToLunar,
  type AnniversaryMode,
  type Item,
  type ItemKind,
  type LunarDate,
  type Repeat,
  type Space,
  type UserSettings,
} from '@hanjibung/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ShareScope } from '@/components/ShareScope';
import { Button, Card, FieldLabel, Note, Screen, Segmented, T, TextButton, ToggleRow, TopBar } from '@/components/ui';
import { deleteItem, emptyItem, saveItem } from '@/lib/items';
import { askReminderPermission } from '@/lib/reminders';
import { useSession } from '@/lib/session';
import { fonts, radius, space, useTheme } from '@/theme';

import { confirmAsync } from './confirm';
import { useToday } from './data';
import { DateRow, TimeRow } from './DateField';
import { lunarLong, lunarThisYear, normalizeTime, REPEAT_LABEL, TIME_RE } from './format';
import { SpaceTags } from './ItemRow';
import { ParticipantsPicker } from './ParticipantsPicker';
import { ReminderEditor } from './ReminderEditor';

const TITLE_MAX = 60;

/** 공유 범위 기본값: 마지막으로 쓴 범위(내 공간만) → 첫 공용 공간 → 나만 */
export function defaultShare(settings: UserSettings, spaces: Space[], mySpaceIds: string[], personalSpaceId: string): string[] {
  const last = settings.lastShareSpaceIds.filter((id) => mySpaceIds.includes(id));
  if (last.length > 0 && isValidShare(last, mySpaceIds, personalSpaceId)) return last;
  const shared = spaces.find((s) => s.kind === 'shared');
  return [shared?.id ?? personalSpaceId];
}

/** 새 항목 초안 */
export function newDraft(
  id: string,
  uid: string,
  kind: ItemKind,
  date: string,
  spaceIds: string[],
  spaceById: Record<string, Space>,
  settings: UserSettings,
): Item {
  const base = emptyItem(id, uid, date, spaceIds, kind);
  return {
    ...base,
    coEdit: spaceById[spaceIds[0] ?? '']?.rules.eventEditDefault === 'all',
    reminders: defaultReminders(kind, settings),
  };
}

function defaultReminders(kind: ItemKind, settings: UserSettings): Item['reminders'] {
  return kind === 'anniversary'
    ? [
        { daysBefore: 7, time: settings.defaultReminderTime },
        { daysBefore: 0, time: settings.defaultReminderTime },
      ]
    : [{ daysBefore: 1, time: '20:00' }];
}

type Errors = Partial<Record<'title' | 'date' | 'time' | 'endDate' | 'endTime' | 'lunar' | 'share' | 'save', string>>;

/** 칸 묶음 안의 작은 선택 막대 (반복 등) */
function InlineChoice<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.choiceRow, { borderTopColor: c.line }]}>
      <T v="label" muted style={{ fontFamily: fonts.regular, fontSize: 14 }}>
        {label}
      </T>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.choice, { backgroundColor: c.surfaceAlt }]}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${label} ${o.label}`}
              onPress={() => onChange(o.value)}
              style={[styles.choiceBtn, on && { backgroundColor: c.surface }]}>
              <T v="label" style={{ fontSize: 13, fontFamily: on ? fonts.bold : fonts.medium }}>
                {o.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ItemForm({ initial, isNew }: { initial: Item; isNew: boolean }) {
  const { c } = useTheme();
  const today = useToday();
  const { backend, uid, settings, updateSettings, spaceById, personalSpaceId, mySpaceIds } = useSession();
  const [draft, setDraft] = useState<Item>(initial);
  const [timeText, setTimeText] = useState(initial.time ?? '');
  const [endTimeText, setEndTimeText] = useState(initial.endTime ?? '');
  const [lunarOn, setLunarOn] = useState(!!initial.lunar);
  const [coEditTouched, setCoEditTouched] = useState(!isNew);
  const [remindersTouched, setRemindersTouched] = useState(!isNew);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (patch: Partial<Item>) => setDraft((d) => ({ ...d, ...patch }));
  const isOwner = draft.ownerUid === uid;
  const anniv = draft.kind === 'anniversary';
  const since = anniv && draft.mode === 'since';
  const canLunar = anniv && !since && draft.repeat === 'yearly';
  const showEnd = !since && (draft.kind === 'event' || draft.repeat === 'none');
  const timed = draft.kind === 'event' && !draft.allDay;

  // 음력: 고른 양력 날짜를 음력 월·일로 바꾼다 (날짜를 안 바꿨으면 저장된 값 유지)
  const lunar: LunarDate | null = (() => {
    if (!canLunar || !lunarOn || !isValidISODate(draft.date)) return null;
    if (initial.lunar && initial.date === draft.date) return initial.lunar;
    const l = solarToLunar(draft.date);
    return l ? { month: l.month, day: l.day, leap: l.leap } : null;
  })();
  const lunarText = lunar
    ? (() => {
        const thisYear = lunarThisYear(lunar, today);
        return `${lunarLong(lunar)}${thisYear ? ` (올해 ${formatKoreanDate(thisYear, { weekday: false })})` : ''}`;
      })()
    : null;

  const changeKind = (kind: ItemKind) => {
    if (kind === draft.kind) return;
    setDraft((d) => ({
      ...d,
      kind,
      mode: 'countdown',
      allDay: kind === 'anniversary' ? true : d.allDay,
      time: kind === 'anniversary' ? null : d.time,
      endTime: kind === 'anniversary' ? null : d.endTime,
      milestones: kind === 'anniversary',
      reminders: remindersTouched ? d.reminders : defaultReminders(kind, settings),
    }));
    if (kind === 'event') setLunarOn(false);
  };

  const changeMode = (mode: AnniversaryMode) => {
    set(mode === 'since' ? { mode, repeat: 'none', endDate: null, countFromOne: true, milestones: true } : { mode });
  };

  const changeShare = (spaceIds: string[]) => {
    setErrors((e) => ({ ...e, share: undefined }));
    const patch: Partial<Item> = { spaceIds };
    if (!coEditTouched && spaceIds[0]) patch.coEdit = spaceById[spaceIds[0]]?.rules.eventEditDefault === 'all';
    set(patch);
  };

  const validate = (): Errors => {
    const e: Errors = {};
    const title = draft.title.trim();
    if (!title) e.title = '제목을 입력해 주세요';
    else if (title.length > TITLE_MAX) e.title = `제목은 ${TITLE_MAX}자까지 쓸 수 있어요`;
    if (!isValidISODate(draft.date)) e.date = '날짜를 확인해 주세요';
    if (timed && !TIME_RE.test(normalizeTime(timeText))) e.time = '시각은 14:00처럼 입력해 주세요';
    if (timed && endTimeText && !TIME_RE.test(normalizeTime(endTimeText))) e.endTime = '시각은 18:00처럼 입력해 주세요';
    if (showEnd && draft.endDate && isValidISODate(draft.date) && diffDays(draft.date, draft.endDate) < 0) {
      e.endDate = '끝나는 날이 시작보다 빨라요';
    }
    if (
      timed &&
      !e.time &&
      !e.endTime &&
      endTimeText &&
      (!draft.endDate || draft.endDate === draft.date) &&
      normalizeTime(endTimeText) < normalizeTime(timeText)
    ) {
      e.endTime = '끝나는 시각이 시작보다 빨라요';
    }
    if (canLunar && lunarOn && !lunar) e.lunar = `음력은 ${LUNAR_MIN_YEAR}~${LUNAR_MAX_YEAR}년 날짜만 계산할 수 있어요`;
    if (isOwner && !isValidShare(draft.spaceIds, mySpaceIds, personalSpaceId)) e.share = '공유할 공간을 하나 이상 골라주세요';
    return e;
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const onSave = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const item: Item = {
      ...draft,
      title: draft.title.trim(),
      memo: draft.memo.trim(),
      mode: anniv ? draft.mode : 'countdown',
      repeat: since ? 'none' : draft.repeat,
      allDay: anniv ? true : draft.allDay,
      time: timed ? normalizeTime(timeText) : null,
      endDate: showEnd && draft.endDate && draft.endDate !== draft.date ? draft.endDate : null,
      endTime: timed && endTimeText ? normalizeTime(endTimeText) : null,
      lunar: canLunar && lunarOn ? lunar : null,
      milestones: since ? draft.milestones : anniv ? draft.milestones : false,
    };
    setSaving(true);
    try {
      // 알림을 켠 항목을 처음 저장할 때 한 번만 알림 권한을 묻는다 (웹은 해당 없음)
      if (item.reminders.length > 0 && settings.notify.anniversary) await askReminderPermission();
      await saveItem(backend, item, isNew, uid);
      if (isOwner) {
        const same = item.spaceIds.length === settings.lastShareSpaceIds.length && item.spaceIds.every((id) => settings.lastShareSpaceIds.includes(id));
        if (!same) updateSettings({ lastShareSpaceIds: item.spaceIds }).catch(() => {});
      }
      close();
    } catch (err) {
      setErrors({ save: err instanceof Error ? err.message : '저장하지 못했어요. 잠시 뒤 다시 해 주세요.' });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirmAsync('삭제할까요?', `'${initial.title}'을(를) 모든 공간에서 지워요. 되돌릴 수 없어요.`, '삭제', true);
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteItem(backend, initial.id);
      if (settings.pinnedItemIds.includes(initial.id)) {
        updateSettings({ pinnedItemIds: settings.pinnedItemIds.filter((id) => id !== initial.id) }).catch(() => {});
      }
      router.dismissTo('/');
    } catch (err) {
      setErrors({ save: err instanceof Error ? err.message : '삭제하지 못했어요.' });
      setDeleting(false);
    }
  };

  const heading = isNew ? (anniv ? '새 기념일' : '새 일정') : anniv ? '기념일 수정' : '일정 수정';
  const errorText = (msg?: string) =>
    msg ? (
      <T v="caption" color={c.danger} style={{ fontSize: 12 }}>
        {msg}
      </T>
    ) : null;

  return (
    <Screen
      edges={['top', 'bottom']}
      contentStyle={{ gap: 18, paddingTop: space.sm }}
      header={
        <TopBar
          title={heading}
          left={<TextButton label="취소" onPress={close} />}
          right={<TextButton label="저장" strong onPress={() => void onSave()} disabled={saving || deleting} />}
        />
      }>
      <Segmented<ItemKind>
        options={[
          { value: 'event', label: '일정' },
          { value: 'anniversary', label: '기념일' },
        ]}
        value={draft.kind}
        onChange={changeKind}
      />

      <View style={{ gap: 8 }}>
        <Card>
          <View style={styles.titleBox}>
            <T v="caption" muted style={{ fontSize: 12 }}>
              제목
            </T>
            <TextInput
              value={draft.title}
              onChangeText={(t) => {
                set({ title: t });
                if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
              }}
              maxLength={TITLE_MAX}
              placeholder={anniv ? '예: 결혼기념일' : '예: 외가 저녁 모임'}
              placeholderTextColor={c.muted}
              accessibilityLabel="제목"
              returnKeyType="done"
              style={[styles.titleInput, { color: c.ink }]}
            />
            {errorText(errors.title)}
          </View>
          <DateRow
            label={since ? '시작한 날' : '날짜'}
            value={draft.date}
            display={lunarText ?? undefined}
            onChange={(d) => {
              set({ date: d });
              setErrors((e) => ({ ...e, date: undefined, lunar: undefined, endDate: undefined }));
            }}
            error={errors.date ?? errors.lunar}
          />
          {draft.kind === 'event' ? (
            <ToggleRow
              label="종일"
              value={draft.allDay}
              onChange={(v) => {
                set({ allDay: v });
                if (!v && !timeText) setTimeText('09:00');
              }}
            />
          ) : null}
          {timed ? <TimeRow label="시작 시각" value={timeText} onChange={setTimeText} error={errors.time} /> : null}
          {showEnd ? (
            <DateRow
              label="끝나는 날"
              value={draft.endDate}
              placeholder="없음"
              onChange={(d) => {
                set({ endDate: d });
                setErrors((e) => ({ ...e, endDate: undefined }));
              }}
              onClear={() => set({ endDate: null })}
              error={errors.endDate}
            />
          ) : null}
          {timed ? <TimeRow label="끝나는 시각 (선택)" placeholder="없음" value={endTimeText} onChange={setEndTimeText} error={errors.endTime} /> : null}
          {!since ? (
            <InlineChoice<Repeat>
              label="반복"
              options={(['none', 'weekly', 'monthly', 'yearly'] as const).map((r) => ({ value: r, label: REPEAT_LABEL[r] }))}
              value={draft.repeat}
              onChange={(repeat) => set({ repeat, endDate: anniv && repeat !== 'none' ? null : draft.endDate })}
            />
          ) : null}
          {canLunar ? (
            <ToggleRow
              label="음력으로 계산"
              sub={lunarText ? `매년 ${lunarLong(lunar!)}에 맞춰 계산해요` : '고른 날짜의 음력 날짜로 매년 계산해요'}
              value={lunarOn}
              onChange={(v) => {
                setLunarOn(v);
                setErrors((e) => ({ ...e, lunar: undefined }));
              }}
            />
          ) : null}
        </Card>
        {anniv && !since && draft.repeat !== 'yearly' ? <Note>음력 계산은 반복을 '매년'으로 고르면 켤 수 있어요.</Note> : null}
      </View>

      {anniv ? (
        <View style={{ gap: 8 }}>
          <FieldLabel>세는 방식</FieldLabel>
          <Segmented<AnniversaryMode>
            options={[
              { value: 'countdown', label: 'D-Day 카운트다운', sub: 'D-n → D-Day' },
              { value: 'since', label: '지난 날부터 세기', sub: 'n일째' },
            ]}
            value={draft.mode}
            onChange={changeMode}
          />
          {since ? (
            <Card>
              <ToggleRow
                first
                label="1일부터 세기"
                sub={draft.countFromOne ? '시작한 날을 1일째로 세요' : '시작한 날을 0일째로 세요'}
                value={draft.countFromOne}
                onChange={(v) => set({ countFromOne: v })}
              />
              <ToggleRow
                label="100일·주년 기념일 표시"
                sub="100일 단위와 매 주년을 보여주고 알려드려요"
                value={draft.milestones}
                onChange={(v) => set({ milestones: v })}
              />
            </Card>
          ) : null}
        </View>
      ) : null}

      <ParticipantsPicker value={draft.participants} onChange={(participants) => set({ participants })} spaceIds={draft.spaceIds} />

      {isOwner ? (
        <View style={{ gap: 6 }}>
          <ShareScope
            value={draft.spaceIds}
            onChange={changeShare}
            note="일정은 하나로 저장되고, 고르는 공간마다 같은 일정이 보여요. 고치면 모든 공간에 함께 반영됩니다."
          />
          {errorText(errors.share)}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <FieldLabel>누가 볼 수 있나요</FieldLabel>
          <SpaceTags spaceIds={draft.spaceIds} />
          <Note>공유 범위는 만든 사람만 바꿀 수 있어요.</Note>
        </View>
      )}

      {isOwner ? (
        <Card>
          <ToggleRow
            first
            label="다른 가족도 수정 가능"
            sub="끄면 나만 고치고 지울 수 있어요"
            value={draft.coEdit}
            onChange={(v) => {
              setCoEditTouched(true);
              set({ coEdit: v });
            }}
          />
        </Card>
      ) : null}

      <ReminderEditor
        value={draft.reminders}
        onChange={(reminders) => {
          setRemindersTouched(true);
          set({ reminders });
        }}
        timed={timed}
        defaultTime={settings.defaultReminderTime}
      />

      <View style={{ gap: 8 }}>
        <FieldLabel>메모</FieldLabel>
        <TextInput
          value={draft.memo}
          onChangeText={(memo) => set({ memo })}
          multiline
          maxLength={1000}
          placeholder="선택"
          placeholderTextColor={c.muted}
          accessibilityLabel="메모"
          style={[styles.memo, { color: c.ink, backgroundColor: c.surface, borderColor: c.border }]}
        />
      </View>

      {errors.save ? (
        <View style={[styles.banner, { backgroundColor: c.dangerTint, borderColor: c.dangerBorder }]}>
          <T v="label" color={c.danger}>
            {errors.save}
          </T>
        </View>
      ) : null}
      {Object.keys(errors).length > 0 && !errors.save ? (
        <T v="caption" color={c.danger}>
          빨간 글씨로 표시된 칸을 확인해 주세요.
        </T>
      ) : null}

      <Button label="저장" onPress={() => void onSave()} loading={saving} disabled={deleting} />
      {!isNew && isOwner ? <Button label="삭제" kind="danger" icon="trash-2" onPress={() => void onDelete()} loading={deleting} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleBox: { gap: 4, paddingHorizontal: space.lg, paddingVertical: 14 },
  titleInput: { fontFamily: fonts.semibold, fontSize: 17, padding: 0, minHeight: 28 },
  choiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: space.lg, paddingRight: 12, paddingVertical: 8, borderTopWidth: 1, minHeight: 56 },
  choice: { flexDirection: 'row', borderRadius: radius.sm, padding: 3, gap: 2 },
  choiceBtn: { minHeight: 38, minWidth: 48, paddingHorizontal: 8, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  memo: { fontFamily: fonts.regular, fontSize: 15, borderWidth: 1, borderRadius: radius.md, padding: 14, minHeight: 96, textAlignVertical: 'top' },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: 12 },
});
