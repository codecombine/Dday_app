// 폰 캘린더에서 가져오기 (안드로이드, 명세서 11장): 폰 캘린더 일정을 골라 일정이나 기념일로 가져온다.
import { addDays, formatKoreanDate, isValidShare, todayISO, type Item, type ItemKind } from '@hanjibung/core';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';

import { ShareScope } from '@/components/ShareScope';
import { notify } from '@/components/schedule/confirm';
import {
  DEVICE_CALENDAR_SUPPORTED,
  loadCalendars,
  loadEvents,
  requestAccess,
  type DeviceCalendar,
  type DeviceEvent,
} from '@/components/schedule/deviceCalendar';
import { REPEAT_LABEL } from '@/components/schedule/format';
import { defaultShare, newDraft } from '@/components/schedule/ItemForm';
import { Button, Card, CheckRow, Empty, FieldLabel, IconButton, Note, Screen, Segmented, TextButton, TopBar } from '@/components/ui';
import { saveItem } from '@/lib/items';
import { useSession } from '@/lib/session';

const PAST_DAYS = 30;
const AHEAD_DAYS = 365;
const MAX_SHOWN = 300;

function back() {
  if (router.canGoBack()) router.back();
  else router.replace('/calendar');
}

function eventSub(e: DeviceEvent): string {
  const when = e.allDay ? '종일' : e.time;
  const end = e.endDate ? ` ~ ${formatKoreanDate(e.endDate)}` : '';
  return [`${formatKoreanDate(e.date, { year: true })}${end}`, when, e.repeat !== 'none' ? REPEAT_LABEL[e.repeat] : null].filter(Boolean).join(' · ');
}

export default function ImportCalendar() {
  const { backend, uid, settings, spaces, spaceById, mySpaceIds, personalSpaceId, items, updateSettings } = useSession();
  const [phase, setPhase] = useState<'idle' | 'loading' | 'denied' | 'ready'>('idle');
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  const [calIds, setCalIds] = useState<string[]>([]);
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [kind, setKind] = useState<ItemKind>('event');
  const [share, setShare] = useState(() => defaultShare(settings, spaces, mySpaceIds, personalSpaceId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setPhase('loading');
    setError(null);
    try {
      if (!(await requestAccess())) {
        setPhase('denied');
        return;
      }
      const cals = await loadCalendars();
      setCalendars(cals);
      setCalIds(cals.map((c) => c.id));
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : '폰 캘린더를 읽지 못했어요.');
      setPhase('idle');
    }
  };

  useEffect(() => {
    if (DEVICE_CALENDAR_SUPPORTED) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calKey = calIds.join(',');
  useEffect(() => {
    if (phase !== 'ready') return;
    let alive = true;
    const today = todayISO();
    const from = new Date(`${addDays(today, -PAST_DAYS)}T00:00:00`);
    const to = new Date(`${addDays(today, AHEAD_DAYS)}T23:59:59`);
    loadEvents(calIds, from, to)
      .then((list) => {
        if (!alive) return;
        setEvents(list);
        setPicked((p) => p.filter((k) => list.some((e) => e.key === k)));
      })
      .catch(() => alive && setError('일정을 읽지 못했어요.'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, calKey]);

  // 같은 제목·날짜가 이미 있으면 가져오지 않는다
  const existing = useMemo(() => new Set(items.map((i) => `${i.title}|${i.date}`)), [items]);
  const isDup = (e: DeviceEvent) => existing.has(`${e.title}|${e.date}`);
  const selectable = events.filter((e) => !isDup(e));
  const shown = events.slice(0, MAX_SHOWN);

  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const allPicked = selectable.length > 0 && selectable.every((e) => picked.includes(e.key));

  const doImport = async () => {
    if (!isValidShare(share, mySpaceIds, personalSpaceId)) {
      setError('공유할 공간을 하나 이상 골라주세요.');
      return;
    }
    const chosen = events.filter((e) => picked.includes(e.key) && !isDup(e));
    if (chosen.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const e of chosen) {
        const base = newDraft(backend.newId(), uid, kind, e.date, share, spaceById, settings);
        const item: Item = {
          ...base,
          title: e.title,
          memo: e.notes.slice(0, 1000),
          allDay: kind === 'anniversary' ? true : e.allDay,
          time: kind === 'anniversary' ? null : e.time,
          endDate: e.endDate,
          endTime: kind === 'anniversary' ? null : e.endTime,
          repeat: e.repeat,
        };
        await saveItem(backend, item, true, uid);
      }
      updateSettings({ lastShareSpaceIds: share }).catch(() => {});
      notify('가져오기 완료', `${chosen.length}개를 ${kind === 'event' ? '일정' : '기념일'}으로 가져왔어요.`);
      back();
    } catch (err) {
      setError(err instanceof Error ? err.message : '가져오지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  const header = <TopBar title="폰 캘린더에서 가져오기" left={<IconButton name="chevron-left" label="뒤로" onPress={back} />} />;

  if (!DEVICE_CALENDAR_SUPPORTED || Platform.OS === 'web') {
    return (
      <Screen edges={['top', 'bottom']} header={header}>
        <Empty text="폰 캘린더에서 가져오기는 안드로이드 앱에서만 할 수 있어요." />
        <Note>웹에서는 캘린더 화면 위쪽의 내보내기 버튼으로 보이는 항목을 .ics 파일로 받을 수 있어요.</Note>
      </Screen>
    );
  }

  if (phase === 'denied') {
    return (
      <Screen edges={['top', 'bottom']} header={header}>
        <Empty text="폰 캘린더를 읽으려면 캘린더 접근 권한이 필요해요. 설정에서 권한을 허용한 뒤 다시 시도해 주세요." />
        <Button label="다시 시도" onPress={() => void start()} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} header={header} contentStyle={{ gap: 18 }}>
      {phase !== 'ready' ? (
        <Empty text={phase === 'loading' ? '폰 캘린더를 읽는 중이에요…' : '폰 캘린더를 읽지 못했어요.'} action={phase === 'idle' ? { label: '다시 시도', onPress: () => void start() } : undefined} />
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <FieldLabel>캘린더</FieldLabel>
            <Card>
              {calendars.map((cal, i) => (
                <CheckRow
                  key={cal.id}
                  first={i === 0}
                  dot={cal.color ?? undefined}
                  label={cal.title}
                  sub={cal.account ?? undefined}
                  checked={calIds.includes(cal.id)}
                  onPress={() => setCalIds((ids) => (ids.includes(cal.id) ? ids.filter((x) => x !== cal.id) : [...ids, cal.id]))}
                />
              ))}
            </Card>
          </View>

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <FieldLabel>{`일정 ${events.length}개 (지난 ${PAST_DAYS}일 ~ 앞으로 1년)`}</FieldLabel>
              {selectable.length > 0 ? (
                <TextButton
                  label={allPicked ? '모두 해제' : '모두 선택'}
                  onPress={() => setPicked(allPicked ? [] : selectable.map((e) => e.key))}
                />
              ) : null}
            </View>
            {events.length === 0 ? (
              <Empty text="이 기간에 일정이 없어요." />
            ) : (
              <Card>
                {shown.map((e, i) => (
                  <CheckRow
                    key={e.key}
                    first={i === 0}
                    label={e.title}
                    sub={isDup(e) ? `${eventSub(e)} · 이미 있음` : eventSub(e)}
                    checked={picked.includes(e.key)}
                    onPress={() => {
                      if (!isDup(e)) toggle(e.key);
                    }}
                  />
                ))}
              </Card>
            )}
            {events.length > MAX_SHOWN ? <Note>{`앞의 ${MAX_SHOWN}개만 보여줘요.`}</Note> : null}
          </View>

          <View style={{ gap: 8 }}>
            <FieldLabel>무엇으로 가져올까요</FieldLabel>
            <Segmented<ItemKind>
              options={[
                { value: 'event', label: '일정' },
                { value: 'anniversary', label: '기념일', sub: 'D-Day로 세기' },
              ]}
              value={kind}
              onChange={setKind}
            />
          </View>

          <ShareScope value={share} onChange={setShare} />

          {error ? <Note>{error}</Note> : null}
          <Button
            label={picked.length > 0 ? `${picked.length}개 가져오기` : '가져올 일정을 골라주세요'}
            disabled={picked.length === 0}
            loading={saving}
            onPress={() => void doImport()}
          />
        </>
      )}
    </Screen>
  );
}
