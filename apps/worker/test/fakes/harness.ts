// 시험 환경: 가짜 의존성 묶음 + 데이터 준비 도우미
import {
  DEFAULT_SPACE_RULES,
  DEFAULT_USER_SETTINGS,
  type Item,
  type Member,
  type Photo,
  type Space,
  type SpaceRules,
  type UserDoc,
} from '@hanjibung/core';

import type { AuthUser } from '../../src/auth/firebase-auth';
import { loadConfig } from '../../src/config';
import type { Deps } from '../../src/deps';
import type { Env } from '../../src/env';
import { P } from '../../src/repo/docstore';
import { D1IndexStore, type PhotoIndexRow } from '../../src/repo/index-store';
import { clearCalendarTokenCache } from '../../src/services/calendar-sync';
import { MemoryDocStore } from './memory-docstore';
import { FakeAuth, FakeGoogle, FakeKakao, FakePush, MemoryBlobStore } from './services';
import { SqliteD1 } from './sqlite-d1';

/** 2026-10-10 12:00 (한국 시간) */
export const NOW = Date.UTC(2026, 9, 10, 3, 0, 0);

export const TEST_ENV = {
  FIREBASE_PROJECT_ID: 'demo-hanjibung',
  WEB_ORIGIN: 'https://hanjibung.test',
  API_ORIGIN: 'https://api.hanjibung.test',
  GOOGLE_CLIENT_ID: 'google-client',
  KAKAO_REST_API_KEY: 'kakao-key',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  TOKEN_ENC_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  URL_SIGNING_KEY: 'url-signing-key',
  GOOGLE_WEBHOOK_SECRET: 'webhook-secret',
} as unknown as Env;

export function makeHarness(now = NOW) {
  clearCalendarTokenCache();
  let clock = now;
  const docs = new MemoryDocStore();
  const d1 = new SqliteD1();
  const index = new D1IndexStore(d1 as unknown as D1Database);
  const blobs = new MemoryBlobStore();
  const auth = new FakeAuth();
  const push = new FakePush();
  const google = new FakeGoogle();
  const kakao = new FakeKakao();
  const tasks: Promise<unknown>[] = [];
  const deps: Deps = {
    cfg: loadConfig(TEST_ENV),
    now: () => clock,
    docs,
    index,
    blobs,
    auth,
    push,
    google,
    kakao,
    serviceAccount: () => {
      throw new Error('시험에서는 서비스 계정을 쓰지 않는다');
    },
    // 기다리는 동안 시계도 흐른다
    sleep: async (ms) => {
      clock += ms;
    },
    defer: (p) => {
      tasks.push(p);
    },
  };
  return {
    deps,
    docs,
    d1,
    index,
    blobs,
    auth,
    push,
    google,
    tick: (ms: number) => {
      clock += ms;
    },
    /** 미뤄 둔 작업(waitUntil)을 모두 끝낸다 */
    async flush() {
      while (tasks.length) await tasks.shift();
    },
  };
}

export type Harness = ReturnType<typeof makeHarness>;

export function authUser(uid: string, spaces: string[], over: Partial<AuthUser> = {}): AuthUser {
  return { uid, spaces, name: uid, email: null, picture: null, provider: 'google', ...over };
}

export function seedUser(h: Harness, uid: string, spaceIds: string[], displayName = uid): UserDoc {
  const u: UserDoc = {
    uid,
    displayName,
    provider: 'google',
    personalSpaceId: `personal_${uid}`,
    spaceIds: [`personal_${uid}`, ...spaceIds.filter((s) => s !== `personal_${uid}`)],
    settings: DEFAULT_USER_SETTINGS,
    createdAt: NOW,
  };
  h.docs.seed(P.user(uid), { ...u });
  h.docs.seed(P.space(`personal_${uid}`), {
    id: `personal_${uid}`,
    name: '나만',
    color: '#0B3040',
    kind: 'personal',
    ownerUid: uid,
    adminUids: [uid],
    memberUids: [uid],
    rules: DEFAULT_SPACE_RULES,
    createdAt: NOW,
  });
  return u;
}

export function seedSpace(
  h: Harness,
  id: string,
  admins: string[],
  members: string[],
  rules: Partial<SpaceRules> = {},
  profiles: { id: string; displayName: string }[] = [],
): Space {
  const s: Space = {
    id,
    name: id,
    color: '#2E7D74',
    kind: 'shared',
    ownerUid: admins[0]!,
    adminUids: admins,
    memberUids: members,
    rules: { ...DEFAULT_SPACE_RULES, ...rules },
    createdAt: NOW,
  };
  h.docs.seed(P.space(id), { ...s });
  for (const uid of members) {
    const m: Member = { id: uid, spaceId: id, displayName: uid, role: admins.includes(uid) ? 'admin' : 'member', uid, managedByUid: null, joinedAt: NOW };
    h.docs.seed(P.member(id, uid), { ...m });
  }
  for (const p of profiles) {
    const m: Member = { id: p.id, spaceId: id, displayName: p.displayName, role: 'member', uid: null, managedByUid: admins[0]!, joinedAt: NOW };
    h.docs.seed(P.member(id, p.id), { ...m });
  }
  return s;
}

let photoSeq = 0;

export function phashWithFlips(base: string, bits: number[]): string {
  let n = BigInt(`0x${base}`);
  for (const b of bits) n ^= 1n << BigInt(b);
  return n.toString(16).padStart(16, '0');
}

export async function seedPhoto(
  h: Harness,
  over: Partial<Photo> & { id?: string; ownerUid: string; spaceIds: string[] },
): Promise<Photo> {
  const id = over.id ?? `p${++photoSeq}`;
  const p: Photo = {
    id,
    sha256: (over.sha256 ?? id.padEnd(64, '0')).slice(0, 64),
    phash: 'f0f0f0f0f0f0f0f0',
    width: 4000,
    height: 3000,
    bytes: 3_000_000,
    hasExif: true,
    takenAt: null,
    source: 'camera',
    albumIds: [],
    mime: 'image/jpeg',
    cameraModel: null,
    originalName: `${id}.jpg`,
    status: 'active',
    trashedAt: null,
    trashedBy: null,
    createdAt: NOW + photoSeq,
    ...over,
  };
  h.docs.seed(P.photo(id), { ...p });
  const row: PhotoIndexRow = {
    photoId: id,
    ownerUid: p.ownerUid,
    spaceIds: p.spaceIds,
    sha256: p.sha256,
    phash: p.phash,
    width: p.width,
    height: p.height,
    bytes: p.bytes,
    hasExif: p.hasExif,
    takenAt: p.takenAt,
    source: p.source,
    mime: p.mime,
    originalName: p.originalName,
    status: p.status,
    hasOriginal: true,
    hasPreview: true,
    hasThumb: true,
    trashedAt: p.trashedAt,
    createdAt: p.createdAt,
  };
  await h.index.insertPhoto(row);
  return p;
}

export function seedItem(h: Harness, over: Partial<Item> & { id: string; ownerUid: string; spaceIds: string[] }): Item {
  const it: Item = {
    kind: 'event',
    title: '저녁 모임',
    memo: '',
    coEdit: false,
    participants: [],
    date: '2026-10-18',
    allDay: false,
    time: '17:00',
    endDate: null,
    endTime: null,
    repeat: 'none',
    lunar: null,
    mode: 'countdown',
    countFromOne: true,
    milestones: false,
    reminders: [],
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: over.ownerUid,
    ...over,
  };
  h.docs.seed(P.item(it.id), { ...it });
  return it;
}

export function seedDevice(h: Harness, uid: string, token: string, platform: 'android' | 'web' = 'android'): void {
  h.docs.seed(P.device(uid, `dev-${token}`), { fcmToken: token, platform, updatedAt: NOW });
}
