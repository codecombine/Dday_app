import { describe, expect, it } from 'vitest';

import {
  addMonths,
  buildGroups,
  buildIcs,
  calendarEntries,
  classifyPair,
  dayCount,
  diffDays,
  elapsedYMD,
  formatDday,
  formatElapsed,
  guessSource,
  hammingDistance,
  holidayName,
  itemStatus,
  koreanHolidays,
  lunarToSolar,
  mergeNeedsOwnerApproval,
  monthGrid,
  nextOccurrence,
  occurrencesBetween,
  phashBands,
  phashFromGray32,
  pickOriginal,
  solarToLunar,
  toggleShareSpace,
  upcomingMilestones,
  viewerNames,
  type DedupeCandidate,
  type Item,
  type Member,
} from '../src';

const TODAY = '2026-10-10';

function item(p: Partial<Item>): Item {
  return {
    id: 'i1',
    kind: 'anniversary',
    title: '테스트',
    memo: '',
    spaceIds: ['s1'],
    ownerUid: 'u1',
    coEdit: false,
    participants: [],
    date: '2026-10-10',
    allDay: true,
    time: null,
    endDate: null,
    endTime: null,
    repeat: 'none',
    lunar: null,
    mode: 'countdown',
    countFromOne: true,
    milestones: true,
    reminders: [],
    createdAt: 0,
    updatedAt: 0,
    updatedBy: 'u1',
    ...p,
  };
}

describe('날짜 기본', () => {
  it('일수 차이와 말일 보정', () => {
    expect(diffDays('2026-10-10', '2026-11-07')).toBe(28);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
  });
  it('경과 기간', () => {
    expect(elapsedYMD('2024-01-28', TODAY)).toEqual({ y: 2, m: 8, d: 12 });
    expect(formatElapsed({ y: 0, m: 0, d: 5 })).toBe('5일');
  });
  it('2026년 10월 달력은 목요일 시작, 5주', () => {
    const g = monthGrid(2026, 10);
    expect(g).toHaveLength(5);
    expect(g[0]!.slice(0, 5)).toEqual([null, null, null, null, '2026-10-01']);
  });
});

describe('D-Day', () => {
  it('표기', () => {
    expect(formatDday(0)).toBe('D-Day');
    expect(formatDday(13)).toBe('D-13');
    expect(formatDday(-15)).toBe('D+15');
  });
  it('1일부터 세기: 2024-01-28 → 2026-10-10은 987일째, 1000일은 10월 23일', () => {
    expect(dayCount('2024-01-28', TODAY, true)).toBe(987);
    const ms = upcomingMilestones('2024-01-28', TODAY, true, 3);
    expect(ms[0]).toEqual({ label: '1,000일', date: '2026-10-23', daysUntil: 13 });
    expect(ms.map((m) => m.label)).toContain('1,100일');
  });
  it('지난 날부터 세기 상태', () => {
    const s = itemStatus(item({ mode: 'since', date: '2024-01-28' }), TODAY);
    expect(s.headline).toBe('987일째');
    expect(s.elapsed).toBe('2년 8개월 12일');
    expect(s.nextMilestone?.daysUntil).toBe(13);
  });
  it('지난 카운트다운은 past', () => {
    const s = itemStatus(item({ date: '2026-09-25' }), TODAY);
    expect(s.headline).toBe('D+15');
    expect(s.past).toBe(true);
  });
  it('여러 날 일정은 진행 중', () => {
    const s = itemStatus(item({ kind: 'event', date: '2026-10-09', endDate: '2026-10-11' }), TODAY);
    expect(s.headline).toBe('진행 중');
    expect(s.past).toBe(false);
  });
});

describe('반복', () => {
  it('매년: 올해 지났으면 내년, 2월 29일은 평년에 28일', () => {
    expect(nextOccurrence(item({ repeat: 'yearly', date: '2015-11-07' }), TODAY)).toBe('2026-11-07');
    expect(nextOccurrence(item({ repeat: 'yearly', date: '2015-03-01' }), TODAY)).toBe('2027-03-01');
    expect(nextOccurrence(item({ repeat: 'yearly', date: '2020-02-29' }), TODAY)).toBe('2027-02-28');
  });
  it('매월: 31일은 말일', () => {
    expect(nextOccurrence(item({ repeat: 'monthly', date: '2026-01-31' }), TODAY)).toBe('2026-10-31');
    expect(nextOccurrence(item({ repeat: 'monthly', date: '2026-01-31' }), '2026-11-01')).toBe('2026-11-30');
  });
  it('매주', () => {
    expect(nextOccurrence(item({ repeat: 'weekly', date: '2026-10-06' }), TODAY)).toBe('2026-10-13');
    expect(occurrencesBetween(item({ repeat: 'weekly', date: '2026-10-06' }), '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-06',
      '2026-10-13',
      '2026-10-20',
      '2026-10-27',
    ]);
  });
  it('시작일이 미래면 시작일', () => {
    expect(nextOccurrence(item({ repeat: 'yearly', date: '2027-05-01' }), TODAY)).toBe('2027-05-01');
  });
});

describe('음력', () => {
  it('2026년 음력 9.15 = 10월 25일, 음력 10.3 = 11월 11일', () => {
    expect(lunarToSolar(2026, { month: 9, day: 15, leap: false })).toBe('2026-10-25');
    expect(lunarToSolar(2026, { month: 10, day: 3, leap: false })).toBe('2026-11-11');
  });
  it('설날·추석', () => {
    expect(lunarToSolar(2026, { month: 1, day: 1, leap: false })).toBe('2026-02-17');
    expect(lunarToSolar(2026, { month: 8, day: 15, leap: false })).toBe('2026-09-25');
  });
  it('양력 → 음력 왕복', () => {
    const l = solarToLunar('2026-10-25');
    expect(l).toMatchObject({ month: 9, day: 15, leap: false });
  });
  it('음력 매년 다음 날짜', () => {
    const i = item({ repeat: 'yearly', date: '1950-10-25', lunar: { month: 9, day: 15, leap: false } });
    expect(nextOccurrence(i, TODAY)).toBe('2026-10-25');
    expect(nextOccurrence(i, '2026-10-26')).toBe(lunarToSolar(2027, { month: 9, day: 15, leap: false }));
  });
  it('없는 윤달은 평달로', () => {
    const plain = lunarToSolar(2026, { month: 3, day: 10, leap: false });
    expect(lunarToSolar(2026, { month: 3, day: 10, leap: true })).toBe(plain);
  });
  it('범위 밖은 null', () => {
    expect(lunarToSolar(2051, { month: 1, day: 1, leap: false })).toBeNull();
  });
});

describe('공휴일', () => {
  it('2026년 주요 공휴일과 대체공휴일', () => {
    expect(holidayName('2026-10-03')).toBe('개천절');
    expect(holidayName('2026-10-05')).toBe('대체공휴일(개천절)');
    expect(holidayName('2026-10-09')).toBe('한글날');
    expect(holidayName('2026-08-17')).toBe('대체공휴일(광복절)');
    expect(holidayName('2026-03-02')).toBe('대체공휴일(삼일절)');
    expect(holidayName('2026-09-25')).toBe('추석');
    expect(holidayName('2026-07-17')).toBe('제헌절');
    expect(holidayName('2026-10-10')).toBeNull();
  });
  it('2027년 설날(일요일 포함) 대체공휴일은 2월 9일', () => {
    const names = koreanHolidays(2027).filter((h) => h.name.includes('설날'));
    expect(names.map((h) => h.date)).toEqual(['2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09']);
  });
});

describe('공유 범위', () => {
  it('나만 보기와 다른 공간은 함께 고를 수 없다', () => {
    expect(toggleShareSpace(['home', 'mom'], 'me', 'me')).toEqual(['me']);
    expect(toggleShareSpace(['me'], 'home', 'me')).toEqual(['home']);
    expect(toggleShareSpace(['home', 'mom'], 'mom', 'me')).toEqual(['home']);
  });
  it('볼 수 있는 사람은 중복 제거, 프로필 구성원 제외', () => {
    const members: Member[] = [
      { id: 'a', spaceId: 'home', displayName: '엄마', role: 'admin', uid: 'u1', managedByUid: null, joinedAt: 0 },
      { id: 'b', spaceId: 'mom', displayName: '엄마', role: 'admin', uid: 'u1', managedByUid: null, joinedAt: 0 },
      { id: 'c', spaceId: 'mom', displayName: '외할머니', role: 'member', uid: null, managedByUid: 'u1', joinedAt: 0 },
      { id: 'd', spaceId: 'mom', displayName: '외삼촌', role: 'member', uid: 'u3', managedByUid: null, joinedAt: 0 },
    ];
    expect(viewerNames(['home', 'mom'], members, 'me')).toEqual(['엄마', '외삼촌']);
  });
  it('합치기 시 원본 주인 확인이 필요한 공간', () => {
    expect(mergeNeedsOwnerApproval({ ownerUid: 'u1', spaceIds: ['me1'] }, [{ ownerUid: 'u2', spaceIds: ['dad'] }])).toEqual([
      'dad',
    ]);
    expect(mergeNeedsOwnerApproval({ ownerUid: 'u1', spaceIds: ['home', 'dad'] }, [{ ownerUid: 'u2', spaceIds: ['dad'] }])).toEqual(
      [],
    );
  });
});

// ── 사진 지문·중복 ───────────────────────────────────

function gradient(seed: number): Float64Array {
  const g = new Float64Array(1024);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) g[y * 32 + x] = 128 + 100 * Math.sin((x * (seed + 1)) / 7 + (y * (seed + 2)) / 11);
  return g;
}

describe('pHash', () => {
  it('같은 이미지는 같은 지문, 약한 잡음에는 가깝고 다른 이미지와는 멀다', () => {
    const a = gradient(1);
    const noisy = a.map((v, i) => v + ((i * 7919) % 5) - 2);
    const b = gradient(5);
    const ha = phashFromGray32(a);
    expect(ha).toMatch(/^[0-9a-f]{16}$/);
    expect(phashFromGray32(a)).toBe(ha);
    expect(hammingDistance(ha, phashFromGray32(noisy))).toBeLessThanOrEqual(4);
    expect(hammingDistance(ha, phashFromGray32(b))).toBeGreaterThan(12);
  });
  it('8조각 밴드', () => {
    expect(phashBands('0123456789abcdef')).toEqual(['01', '23', '45', '67', '89', 'ab', 'cd', 'ef']);
  });
});

function photo(p: Partial<DedupeCandidate> & { id: string }): DedupeCandidate {
  return {
    sha256: p.id.padEnd(64, '0'),
    phash: 'ffff0000ffff0000',
    width: 4032,
    height: 3024,
    bytes: 3_800_000,
    hasExif: true,
    takenAt: 1_000,
    source: 'camera',
    createdAt: 0,
    ...p,
  };
}

describe('중복 판정', () => {
  it('같은 파일 / 카톡 사본 / 연사', () => {
    const orig = photo({ id: 'a' });
    const same = photo({ id: 'b', sha256: orig.sha256, createdAt: 5 });
    const kakao = photo({ id: 'c', width: 1280, height: 960, bytes: 300_000, hasExif: false, takenAt: null, source: 'kakao', phash: 'ffff0000ffff0001' });
    const burst = photo({ id: 'd', phash: 'ffff0000ffff00ff', bytes: 3_700_000, takenAt: 2_000 });
    expect(classifyPair(orig, same)).toBe('exact');
    expect(classifyPair(orig, kakao)).toBe('copy');
    expect(classifyPair(orig, burst)).toBe('similar');
    expect(classifyPair(orig, photo({ id: 'e', phash: '0000ffff0000ffff' }))).toBeNull();
  });
  it('원본은 해상도 → EXIF → 용량 순', () => {
    const a = photo({ id: 'a', width: 1280, height: 960 });
    const b = photo({ id: 'b' });
    const c = photo({ id: 'c', hasExif: false });
    expect(pickOriginal([a, c, b]).id).toBe('b');
  });
  it('묶음: 같은 파일·사본은 한 묶음, 연사는 따로 제안만', () => {
    const groups = buildGroups([
      photo({ id: 'orig' }),
      photo({ id: 'dup', sha256: 'orig'.padEnd(64, '0'), createdAt: 9 }),
      photo({ id: 'kakao', width: 1280, height: 960, hasExif: false, source: 'kakao', phash: 'ffff0000ffff0001' }),
      photo({ id: 'x1', phash: '00ff00ff00ff00ff' }),
      photo({ id: 'x2', phash: '00ff00ff00ff00fe', bytes: 3_000_000, takenAt: 1_001 }),
      photo({ id: 'x3', phash: '00ff00ff00ff00f0', takenAt: 1_002 }),
    ]);
    const strong = groups.find((g) => g.photoIds.includes('orig'))!;
    expect(strong.kind).toBe('copy');
    expect(strong.keepPhotoId).toBe('orig');
    expect(strong.suggestedRemoveIds.sort()).toEqual(['dup', 'kakao']);
    const sim = groups.find((g) => g.photoIds.includes('x3'))!;
    expect(sim.kind).toBe('similar');
    expect(sim.suggestedRemoveIds).toEqual([]);
  });
  it('출처 추정', () => {
    expect(guessSource('KakaoTalk_20260926_182001234.jpg', false)).toBe('kakao');
    expect(guessSource('Screenshot_20261010-101010.png', false)).toBe('screenshot');
    expect(guessSource('20260925_140211.jpg', false)).toBe('camera');
    expect(guessSource('random.jpg', false)).toBe('unknown');
  });
});

describe('캘린더 변환', () => {
  it('음력 매년은 10년치 개별 일정', () => {
    const e = calendarEntries(item({ repeat: 'yearly', date: '1950-10-25', lunar: { month: 9, day: 15, leap: false } }), TODAY);
    expect(e).toHaveLength(10);
    expect(e[0]).toMatchObject({ key: 'Y:2026', startDate: '2026-10-25', rrule: null });
  });
  it('양력 매년은 RRULE 하나', () => {
    const e = calendarEntries(item({ repeat: 'yearly', date: '2015-11-07' }), TODAY);
    expect(e).toEqual([expect.objectContaining({ key: 'base', rrule: 'FREQ=YEARLY' })]);
  });
  it('지난 날부터 세기는 원래 날 + 1년 안 기념일', () => {
    const e = calendarEntries(item({ mode: 'since', date: '2024-01-28', title: '지우' }), TODAY);
    expect(e[0]!.key).toBe('base');
    expect(e.some((x) => x.title === '지우 1,000일' && x.startDate === '2026-10-23')).toBe(true);
    expect(e.some((x) => x.title === '지우 3주년')).toBe(true);
  });
  it('.ics 형식', () => {
    const ics = buildIcs([{ id: 'abc', item: item({ title: '외가, 저녁', kind: 'event', allDay: false, time: '17:00', date: '2026-10-18' }) }], TODAY);
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART;TZID=Asia/Seoul:20261018T170000');
    expect(ics).toContain('SUMMARY:외가\\, 저녁');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
});
