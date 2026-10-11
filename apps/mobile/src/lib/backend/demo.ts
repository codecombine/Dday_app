// 데모 백엔드: 메모리 안의 가족 데이터로 동작한다 (설정 없이 화면 확인·개발용).
// 시안과 같은 가족(엄마·아빠·지우, 외가, 시댁)을 넣어둔다. 앱을 새로고침하면 처음 상태로 돌아간다.
import {
  addDays,
  DEFAULT_SPACE_RULES,
  DEFAULT_USER_SETTINGS,
  todayISO,
  type Album,
  type DedupeGroup,
  type Item,
  type Member,
  type MergeRequest,
  type Photo,
  type Space,
  type UserDoc,
} from '@hanjibung/core';

import { ApiError, type AuthUser, type Backend, type Unsubscribe } from './types';

const ME = 'demo-mom';
const DAD = 'demo-dad';
const UNCLE = 'demo-uncle';
const AUNT = 'demo-aunt';
const NOW = Date.now();
const T = todayISO();

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());
const sub = (fn: () => void): Unsubscribe => {
  const l = () => fn();
  listeners.add(l);
  fn();
  return () => listeners.delete(l);
};

let seq = 1000;
const id = () => `demo${++seq}${Math.random().toString(36).slice(2, 6)}`;

function space(sid: string, name: string, color: string, owner: string, admins: string[], members: string[], kind: Space['kind'] = 'shared'): Space {
  return { id: sid, name, color, kind, ownerUid: owner, adminUids: admins, memberUids: members, rules: { ...DEFAULT_SPACE_RULES }, createdAt: NOW };
}

const state = {
  signedIn: false,
  user: {
    uid: ME,
    displayName: '엄마',
    provider: 'kakao',
    personalSpaceId: `personal_${ME}`,
    spaceIds: [`personal_${ME}`, 'home', 'mom', 'dad'],
    settings: { ...DEFAULT_USER_SETTINGS, pinnedItemIds: ['jiwoo'] },
    createdAt: NOW,
  } as UserDoc,
  spaces: [
    space(`personal_${ME}`, '나만', '#5B6673', ME, [ME], [ME], 'personal'),
    space('home', '우리집', '#0B3040', ME, [ME], [ME, DAD]),
    space('mom', '외가', '#B85C1E', ME, [ME], [ME, DAD, UNCLE]),
    space('dad', '시댁', '#2E7D74', DAD, [DAD], [DAD, ME, AUNT]),
  ] as Space[],
  members: [] as Member[],
  items: [] as Item[],
  photos: [] as Photo[],
  albums: [] as Album[],
  groups: [] as DedupeGroup[],
  merge: [] as MergeRequest[],
  google: { connected: false, email: null as string | null, mirrorSpaceIds: [] as string[] },
};

function member(spaceId: string, displayName: string, uid: string | null, role: Member['role'] = 'member'): Member {
  return { id: uid ?? id(), spaceId, displayName, role, uid, managedByUid: uid ? null : ME, joinedAt: NOW };
}
state.members = [
  member(`personal_${ME}`, '엄마', ME, 'admin'),
  member('home', '엄마', ME, 'admin'),
  member('home', '아빠', DAD),
  member('home', '지우', null),
  member('mom', '엄마', ME, 'admin'),
  member('mom', '아빠', DAD),
  member('mom', '외삼촌', UNCLE),
  member('mom', '외할머니', null),
  member('mom', '외할아버지', null),
  member('dad', '아빠', DAD, 'admin'),
  member('dad', '엄마', ME),
  member('dad', '고모', AUNT),
  member('dad', '할머니', null),
  member('dad', '할아버지', null),
];

function item(p: Partial<Item> & Pick<Item, 'id' | 'title' | 'date' | 'spaceIds'>): Item {
  return {
    kind: 'event',
    memo: '',
    ownerUid: ME,
    coEdit: false,
    participants: [],
    allDay: true,
    time: null,
    endDate: null,
    endTime: null,
    repeat: 'none',
    lunar: null,
    mode: 'countdown',
    countFromOne: true,
    milestones: false,
    reminders: [{ daysBefore: 1, time: '20:00' }],
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: ME,
    ...p,
  };
}
state.items = [
  item({ id: 'jiwoo', kind: 'anniversary', title: '지우 태어난 날', date: addDays(T, -986), spaceIds: ['home', 'mom', 'dad'], mode: 'since', milestones: true }),
  item({ id: 'grandma', kind: 'anniversary', title: '외할머니 생신', date: '1950-10-25', repeat: 'yearly', lunar: { month: 9, day: 15, leap: false }, spaceIds: ['mom', 'home'] }),
  item({ id: 'trip', kind: 'anniversary', title: '가족 여행', date: addDays(T, 21), endDate: addDays(T, 22), spaceIds: ['home'] }),
  item({ id: 'wedding', kind: 'anniversary', title: '결혼기념일', date: '2015-11-07', repeat: 'yearly', spaceIds: ['home'] }),
  item({ id: 'memorial', kind: 'anniversary', title: '할아버지 기일', date: '2001-11-11', repeat: 'yearly', lunar: { month: 10, day: 3, leap: false }, spaceIds: ['dad'], ownerUid: DAD }),
  item({ id: 'exam', kind: 'anniversary', title: '자격증 시험', date: addDays(T, 43), spaceIds: [`personal_${ME}`] }),
  item({ id: 'soccer', title: '지우 축구 경기', date: T, allDay: false, time: '14:00', spaceIds: ['home'], ownerUid: DAD }),
  item({ id: 'lunch', title: '시댁 점심', date: addDays(T, 1), allDay: false, time: '12:00', spaceIds: ['dad', 'home'], ownerUid: DAD, coEdit: true }),
  item({ id: 'teacher', title: '학부모 상담', date: addDays(T, 3), allDay: false, time: '16:00', spaceIds: ['home'] }),
  item({ id: 'dentist', title: '치과', date: addDays(T, 5), allDay: false, time: '19:00', spaceIds: [`personal_${ME}`] }),
  item({ id: 'dinner', title: '외가 저녁 모임', date: addDays(T, 8), allDay: false, time: '17:00', spaceIds: ['mom', 'home'] }),
  item({ id: 'past', kind: 'anniversary', title: '지우 운동회', date: addDays(T, -21), spaceIds: ['home'] }),
];

state.albums = [
  { id: 'a-chuseok', name: '추석', spaceIds: ['mom', 'dad', 'home'], ownerUid: ME, coverPhotoId: null, createdAt: NOW },
  { id: 'a-soccer', name: '지우 축구', spaceIds: ['home'], ownerUid: DAD, coverPhotoId: null, createdAt: NOW },
];

function photo(i: number, spaceIds: string[], over: Partial<Photo> = {}): Photo {
  return {
    id: `p${i}`,
    ownerUid: ME,
    spaceIds,
    albumIds: [],
    sha256: `sha${i}`.padEnd(64, '0'),
    phash: 'ffff0000ffff0000',
    width: 4032,
    height: 3024,
    bytes: 3_800_000,
    mime: 'image/jpeg',
    hasExif: true,
    takenAt: NOW - i * 3_600_000 * 7,
    cameraModel: 'Galaxy S25',
    source: 'camera',
    originalName: `20260925_14${String(i).padStart(4, '0')}.jpg`,
    status: 'active',
    trashedAt: null,
    trashedBy: null,
    createdAt: NOW - i * 3_600_000 * 7,
    ...over,
  };
}
for (let i = 1; i <= 6; i++) state.photos.push(photo(i, ['home']));
for (let i = 7; i <= 14; i++) state.photos.push(photo(i, ['mom', 'home'], { albumIds: ['a-chuseok'], ownerUid: UNCLE }));
for (let i = 15; i <= 20; i++) state.photos.push(photo(i, ['dad', 'home'], { albumIds: ['a-chuseok'] }));
state.photos.push(photo(21, ['mom'], { sha256: state.photos[7]!.sha256, ownerUid: DAD, createdAt: NOW - 1000 }));
state.photos.push(photo(22, ['mom'], { width: 1280, height: 960, bytes: 300_000, hasExif: false, source: 'kakao', takenAt: null, originalName: 'KakaoTalk_20260926_182001234.jpg' }));
state.photos.push(photo(23, [`personal_${ME}`], { cameraModel: null }));
state.groups = [
  { id: 'g1', spaceId: 'mom', kind: 'exact', photoIds: ['p8', 'p21'], keepPhotoId: 'p8', status: 'open', updatedAt: NOW },
  { id: 'g2', spaceId: 'mom', kind: 'copy', photoIds: ['p9', 'p22'], keepPhotoId: 'p9', status: 'open', updatedAt: NOW },
];

// 사진 자리표시 이미지 (공간 색 바탕)
const photoTint: Record<string, string> = { home: '#DCE6EC', mom: '#F3E2D6', dad: '#D9ECE9' };
function placeholder(p: Photo): string {
  const bg = photoTint[p.spaceIds[0] ?? ''] ?? '#E3E6EA';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width > p.height ? 400 : 300}" height="${p.width > p.height ? 300 : 400}"><rect width="100%" height="100%" fill="${bg}"/><circle cx="35%" cy="40%" r="24" fill="#ffffff" opacity="0.7"/><path d="M0 85% L35% 55% L60% 75% L80% 60% L100% 80% L100% 100% L0 100% Z" fill="#ffffff" opacity="0.55"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const blobUrls = new Map<string, string>();

function visible<T extends { spaceIds: string[] }>(rows: T[], spaceIds: string[]): T[] {
  return rows.filter((r) => r.spaceIds.some((s) => spaceIds.includes(s)));
}

const authUser = (): AuthUser => ({ uid: ME, displayName: '엄마', email: 'demo@hanjibung.app', provider: 'kakao', emailVerified: true });

export function createDemoBackend(): Backend {
  const authListeners = new Set<(u: AuthUser | null) => void>();
  const setSignedIn = (v: boolean) => {
    state.signedIn = v;
    authListeners.forEach((l) => l(v ? authUser() : null));
  };

  const route = async (method: string, path: string, body: any): Promise<any> => {
    await new Promise((r) => setTimeout(r, 150));
    const p = path.split('?')[0]!;
    if (p === '/me/bootstrap') return { personalSpaceId: state.user.personalSpaceId, spaceIds: state.user.spaceIds, claimsChanged: false };
    if (p === '/devices' || p.endsWith('/changed')) return {};
    if (p === '/spaces' && method === 'POST') {
      const sid = id();
      state.spaces.push(space(sid, body.name, body.color, ME, [ME], [ME]));
      state.members.push(member(sid, state.user.displayName, ME, 'admin'));
      state.user = { ...state.user, spaceIds: [...state.user.spaceIds, sid] };
      emit();
      return { spaceId: sid };
    }
    let m = /^\/spaces\/([^/]+)\/invites$/.exec(p);
    if (m) return { token: 'demo-invite', url: `https://hanjibung.pages.dev/invite/demo-invite`, expiresAt: NOW + 7 * 86_400_000 };
    if (p.startsWith('/invites/') && method === 'GET') {
      const s = state.spaces.find((x) => x.id === 'mom')!;
      return {
        spaceId: s.id,
        spaceName: s.name,
        spaceColor: s.color,
        inviterName: '엄마',
        memberCount: 5,
        itemCount: 12,
        photoCount: 348,
        memberNames: ['엄마', '외할머니', '외할아버지', '외삼촌'],
        targetMemberName: null,
        expiresAt: NOW + 6 * 86_400_000,
        valid: true,
      };
    }
    if (p.startsWith('/invites/') && p.endsWith('/accept')) return { spaceId: 'mom', spaceIds: state.user.spaceIds };
    m = /^\/spaces\/([^/]+)\/leave$/.exec(p);
    if (m) {
      const sid = m[1]!;
      state.user = { ...state.user, spaceIds: state.user.spaceIds.filter((s) => s !== sid) };
      emit();
      return {};
    }
    m = /^\/spaces\/([^/]+)\/members\/([^/]+)(\/role)?$/.exec(p);
    if (m) {
      if (m[3]) state.members = state.members.map((x) => (x.spaceId === m![1] && x.id === m![2] ? { ...x, role: body.role } : x));
      else state.members = state.members.filter((x) => !(x.spaceId === m![1] && x.id === m![2]));
      emit();
      return {};
    }
    if (p === '/photos/urls') {
      const urls: Record<string, string> = {};
      for (const pid of body.ids as string[]) {
        const ph = state.photos.find((x) => x.id === pid);
        if (ph) urls[pid] = blobUrls.get(pid) ?? placeholder(ph);
      }
      return { urls, expiresAt: Date.now() + 3_600_000 };
    }
    if (p === '/photos/prepare') {
      return {
        photos: (body.photos as any[]).map((x) => {
          const existing = state.photos.find((ph) => ph.sha256 === x.sha256 && ph.status === 'active');
          if (existing) return { sha256: x.sha256, photoId: null, existingPhotoId: existing.id };
          const pid = id();
          state.photos.push({ ...photo(0, []), ...x, id: pid, status: 'uploading', ownerUid: ME, createdAt: Date.now(), albumIds: [] });
          return { sha256: x.sha256, photoId: pid, existingPhotoId: null };
        }),
      };
    }
    m = /^\/photos\/([^/]+)\/(commit|trash|restore|add)$/.exec(p);
    if (m) {
      const pid = m[1]!;
      state.photos = state.photos.map((ph) => {
        if (ph.id !== pid) return ph;
        if (m![2] === 'commit') return { ...ph, status: 'active', spaceIds: body.spaceIds, albumIds: body.albumIds };
        if (m![2] === 'trash') {
          // 관리자가 자기 공간에서만 빼는 경우 (다른 공간이 남으면 휴지통으로 가지 않음)
          const only = body?.spaceId as string | undefined;
          if (only && ph.ownerUid !== ME) {
            const rest = ph.spaceIds.filter((s) => s !== only);
            return rest.length ? { ...ph, spaceIds: rest } : { ...ph, spaceIds: [state.user.personalSpaceId] };
          }
          return { ...ph, status: 'trashed', trashedAt: Date.now(), trashedBy: ME };
        }
        if (m![2] === 'restore') return { ...ph, status: 'active', trashedAt: null, trashedBy: null };
        return { ...ph, spaceIds: [...new Set([...ph.spaceIds, ...body.spaceIds])], albumIds: [...new Set([...ph.albumIds, ...body.albumIds])] };
      });
      emit();
      return {};
    }
    m = /^\/photos\/([^/]+)$/.exec(p);
    if (m && method === 'PATCH') {
      state.photos = state.photos.map((ph) => (ph.id === m![1] ? { ...ph, ...body } : ph));
      emit();
      return {};
    }
    m = /^\/dedupe\/([^/]+)\/(apply|dismiss)$/.exec(p);
    if (m) {
      const g = state.groups.find((x) => x.id === m![1]);
      if (m[2] === 'apply' && g) {
        const removeIds: string[] = body.removePhotoIds;
        state.photos = state.photos.map((ph) => (removeIds.includes(ph.id) ? { ...ph, status: 'trashed', trashedAt: Date.now(), trashedBy: ME } : ph));
      }
      state.groups = state.groups.map((x) => (x.id === m![1] ? { ...x, status: m![2] === 'apply' ? 'applied' : 'dismissed' } : x));
      emit();
      return { trashed: body?.removePhotoIds ?? [], awaitingOwner: [] };
    }
    if (/^\/spaces\/[^/]+\/dedupe\/scan$/.test(p)) return { groups: state.groups.filter((g) => g.status === 'open').length };
    if (p === '/calendar/google' && method === 'GET') return state.google;
    if (p === '/calendar/google/connect') {
      state.google = { connected: true, email: 'demo@gmail.com', mirrorSpaceIds: body.mirrorSpaceIds ?? state.user.spaceIds };
      return state.google;
    }
    if (p === '/calendar/google/settings') {
      state.google = { ...state.google, mirrorSpaceIds: body.mirrorSpaceIds };
      return state.google;
    }
    if (p.startsWith('/calendar/google') && method === 'DELETE') {
      state.google = { connected: false, email: null, mirrorSpaceIds: [] };
      return state.google;
    }
    if (p === '/me' && method === 'DELETE') {
      setSignedIn(false);
      return {};
    }
    m = /^\/merge-requests\/([^/]+)\/(approve|reject)$/.exec(p);
    if (m) {
      state.merge = state.merge.filter((x) => x.id !== m![1]);
      emit();
      return {};
    }
    throw new ApiError(404, 'demo', `데모 모드에서 지원하지 않는 요청: ${method} ${p}`);
  };

  return {
    kind: 'demo',
    onAuth(cb) {
      authListeners.add(cb);
      cb(state.signedIn ? authUser() : null);
      return () => authListeners.delete(cb);
    },
    async getIdToken() {
      return state.signedIn ? 'demo-token' : null;
    },
    async signInWithGoogle() {
      setSignedIn(true);
    },
    async signInWithKakao() {
      setSignedIn(true);
    },
    async completeKakaoRedirect() {
      setSignedIn(true);
    },
    async signInWithEmail() {
      setSignedIn(true);
    },
    async signUpWithEmail() {},
    async sendPasswordReset() {},
    async signOut() {
      setSignedIn(false);
    },

    watchUser: (_uid, cb) => sub(() => cb(state.user)),
    watchSpaces: (ids, cb) => sub(() => cb(state.spaces.filter((s) => ids.includes(s.id)))),
    watchMembers: (spaceIds, cb) => sub(() => cb(state.members.filter((m) => spaceIds.includes(m.spaceId)))),
    watchItems: (spaceIds, cb) => sub(() => cb(visible(state.items, spaceIds))),
    watchPhotos: (spaceIds, cb) =>
      sub(() => cb(visible(state.photos.filter((p) => p.status === 'active'), spaceIds).sort((a, b) => b.createdAt - a.createdAt))),
    watchTrash: (uid, cb) => sub(() => cb(state.photos.filter((p) => p.status === 'trashed' && p.ownerUid === uid))),
    watchAlbums: (spaceIds, cb) => sub(() => cb(visible(state.albums, spaceIds))),
    watchDedupeGroups: (spaceId, cb) => sub(() => cb(state.groups.filter((g) => g.spaceId === spaceId && (g.status === 'open' || g.status === 'awaiting_owner')))),
    watchMergeRequests: (uid, cb) => sub(() => cb(state.merge.filter((r) => r.ownerUid === uid))),

    newId: id,
    async saveItem(it, isNew) {
      state.items = isNew ? [...state.items, it] : state.items.map((x) => (x.id === it.id ? it : x));
      emit();
    },
    async deleteItem(iid) {
      state.items = state.items.filter((x) => x.id !== iid);
      emit();
    },
    async updateUser(_uid, patch) {
      state.user = { ...state.user, ...patch };
      emit();
    },
    async updateSpace(sid, patch) {
      state.spaces = state.spaces.map((s) => (s.id === sid ? { ...s, ...patch } : s));
      emit();
    },
    async addProfileMember(spaceId, displayName) {
      const m = member(spaceId, displayName, null);
      state.members.push(m);
      emit();
      return m.id;
    },
    async renameProfileMember(spaceId, memberId, displayName) {
      state.members = state.members.map((m) => (m.spaceId === spaceId && m.id === memberId ? { ...m, displayName } : m));
      emit();
    },
    async deleteProfileMember(spaceId, memberId) {
      state.members = state.members.filter((m) => !(m.spaceId === spaceId && m.id === memberId));
      emit();
    },
    async saveAlbum(album) {
      state.albums = state.albums.some((a) => a.id === album.id) ? state.albums.map((a) => (a.id === album.id ? album : a)) : [...state.albums, album];
      emit();
    },
    async deleteAlbum(aid) {
      state.albums = state.albums.filter((a) => a.id !== aid);
      emit();
    },
    api: (method, path, body) => route(method, path, body),
    async uploadPhotoBlob(photoId, variant, data) {
      if (variant !== 'thumb' && variant !== 'preview') return;
      if (typeof data === 'string') blobUrls.set(photoId, data);
      else if (typeof URL !== 'undefined' && 'createObjectURL' in URL) blobUrls.set(photoId, URL.createObjectURL(data));
    },
  };
}
