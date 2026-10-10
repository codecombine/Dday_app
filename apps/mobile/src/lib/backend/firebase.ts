// 실제 백엔드: Firebase Auth + Firestore (실시간 구독) + Cloudflare Worker API
import {
  DEFAULT_SPACE_RULES,
  DEFAULT_USER_SETTINGS,
  type Album,
  type AuthProvider,
  type DedupeGroup,
  type Item,
  type KakaoAuthResponse,
  type Member,
  type MergeRequest,
  type Photo,
  type Space,
  type UserDoc,
} from '@hanjibung/core';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  initializeFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore';

import { config } from '../config';
import { createAuth } from './auth-init';
import { googleSignIn } from './google-auth';
import { kakaoNativeLogin, startKakaoWebLogin } from './kakao-auth';
import { ApiError, type AuthUser, type Backend, type Unsubscribe } from './types';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function ensure() {
  if (!app) {
    app = initializeApp(config.firebase);
    auth = createAuth(app);
    db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, ignoreUndefinedProperties: true });
  }
  return { app: app!, auth: auth!, db: db! };
}

function providerOf(u: User): AuthProvider {
  if (u.uid.startsWith('kakao:')) return 'kakao';
  if (u.providerData.some((p) => p.providerId === 'google.com')) return 'google';
  return 'password';
}

function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    displayName: u.displayName,
    email: u.email,
    provider: providerOf(u),
    // 구글·카카오는 이메일 인증이 필요 없다
    emailVerified: u.emailVerified || providerOf(u) !== 'password',
  };
}

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/** 공간이 30개를 넘으면 쿼리를 나눠서 구독하고 결과를 합친다 */
function watchByChunks<T extends { id: string }>(
  ids: string[],
  make: (chunkIds: string[]) => Query<DocumentData>,
  map: (id: string, d: DocumentData) => T,
  cb: (rows: T[]) => void,
): Unsubscribe {
  if (ids.length === 0) {
    cb([]);
    return () => {};
  }
  const parts = chunk(ids, 30);
  const results: Map<string, T>[] = parts.map(() => new Map());
  const unsubs = parts.map((p, i) =>
    onSnapshot(
      make(p),
      (snap) => {
        const m = new Map<string, T>();
        snap.forEach((d) => m.set(d.id, map(d.id, d.data())));
        results[i] = m;
        const merged = new Map<string, T>();
        for (const r of results) for (const [k, v] of r) merged.set(k, v);
        cb([...merged.values()]);
      },
      (err) => console.warn('[firestore]', err.code, err.message),
    ),
  );
  return () => unsubs.forEach((u) => u());
}

// ── 문서 → 타입 (빠진 필드는 기본값) ─────────────────

const asSpace = (id: string, d: DocumentData): Space => ({
  id,
  name: d.name ?? '',
  color: d.color ?? '#0B3040',
  kind: d.kind ?? 'shared',
  ownerUid: d.ownerUid ?? '',
  adminUids: d.adminUids ?? [],
  memberUids: d.memberUids ?? [],
  rules: { ...DEFAULT_SPACE_RULES, ...(d.rules ?? {}) },
  createdAt: d.createdAt ?? 0,
});

const asMember = (spaceId: string) => (id: string, d: DocumentData): Member => ({
  id,
  spaceId,
  displayName: d.displayName ?? '',
  role: d.role ?? 'member',
  uid: d.uid ?? null,
  managedByUid: d.managedByUid ?? null,
  joinedAt: d.joinedAt ?? 0,
});

const asItem = (id: string, d: DocumentData): Item => ({
  id,
  kind: d.kind ?? 'event',
  title: d.title ?? '',
  memo: d.memo ?? '',
  spaceIds: d.spaceIds ?? [],
  ownerUid: d.ownerUid ?? '',
  coEdit: !!d.coEdit,
  participants: d.participants ?? [],
  date: d.date,
  allDay: d.allDay ?? true,
  time: d.time ?? null,
  endDate: d.endDate ?? null,
  endTime: d.endTime ?? null,
  repeat: d.repeat ?? 'none',
  lunar: d.lunar ?? null,
  mode: d.mode ?? 'countdown',
  countFromOne: d.countFromOne ?? true,
  milestones: d.milestones ?? false,
  reminders: d.reminders ?? [],
  createdAt: d.createdAt ?? 0,
  updatedAt: d.updatedAt ?? 0,
  updatedBy: d.updatedBy ?? '',
});

const asPhoto = (id: string, d: DocumentData): Photo => ({
  id,
  ownerUid: d.ownerUid ?? '',
  spaceIds: d.spaceIds ?? [],
  albumIds: d.albumIds ?? [],
  sha256: d.sha256 ?? '',
  phash: d.phash ?? '',
  width: d.width ?? 0,
  height: d.height ?? 0,
  bytes: d.bytes ?? 0,
  mime: d.mime ?? 'image/jpeg',
  hasExif: !!d.hasExif,
  takenAt: d.takenAt ?? null,
  cameraModel: d.cameraModel ?? null,
  source: d.source ?? 'unknown',
  originalName: d.originalName ?? '',
  status: d.status ?? 'active',
  trashedAt: d.trashedAt ?? null,
  trashedBy: d.trashedBy ?? null,
  createdAt: d.createdAt ?? 0,
});

const asAlbum = (id: string, d: DocumentData): Album => ({
  id,
  name: d.name ?? '',
  spaceIds: d.spaceIds ?? [],
  ownerUid: d.ownerUid ?? '',
  coverPhotoId: d.coverPhotoId ?? null,
  createdAt: d.createdAt ?? 0,
});

const asUser = (uid: string, d: DocumentData): UserDoc => ({
  uid,
  displayName: d.displayName ?? '',
  provider: d.provider ?? 'password',
  personalSpaceId: d.personalSpaceId ?? `personal_${uid}`,
  spaceIds: d.spaceIds ?? [],
  settings: {
    ...DEFAULT_USER_SETTINGS,
    ...(d.settings ?? {}),
    notify: { ...DEFAULT_USER_SETTINGS.notify, ...(d.settings?.notify ?? {}) },
    autoUpload: { ...DEFAULT_USER_SETTINGS.autoUpload, ...(d.settings?.autoUpload ?? {}) },
  },
  createdAt: d.createdAt ?? 0,
});

function stripId<T extends { id: string }>(x: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = x;
  return rest;
}

export function createFirebaseBackend(): Backend {
  const { auth: a, db: fs } = ensure();

  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await a.currentUser?.getIdToken();
    const res = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new ApiError(res.status, json?.error ?? 'error', json?.message ?? '서버 요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
    return json as T;
  }

  return {
    kind: 'firebase',

    onAuth(cb) {
      return onAuthStateChanged(a, (u) => cb(u ? toAuthUser(u) : null));
    },
    async getIdToken(force) {
      return (await a.currentUser?.getIdToken(force)) ?? null;
    },
    async signInWithGoogle() {
      await googleSignIn(a);
    },
    async signInWithKakao() {
      const accessToken = await kakaoNativeLogin();
      if (accessToken === null) {
        startKakaoWebLogin();
        return;
      }
      const res = await api<KakaoAuthResponse>('POST', '/auth/kakao', { accessToken });
      await signInWithCustomToken(a, res.customToken);
    },
    async completeKakaoRedirect(code, redirectUri) {
      const res = await api<KakaoAuthResponse>('POST', '/auth/kakao', { code, redirectUri });
      await signInWithCustomToken(a, res.customToken);
    },
    async signInWithEmail(email, password) {
      const cred = await signInWithEmailAndPassword(a, email, password);
      if (!cred.user.emailVerified) {
        await fbSignOut(a);
        throw new ApiError(403, 'email-not-verified', '이메일 인증이 아직 안 됐어요. 메일함에서 인증 링크를 눌러주세요.');
      }
    },
    async signUpWithEmail(email, password, displayName) {
      const cred = await createUserWithEmailAndPassword(a, email, password);
      await updateProfile(cred.user, { displayName });
      await sendEmailVerification(cred.user);
      await fbSignOut(a);
    },
    async sendPasswordReset(email) {
      await sendPasswordResetEmail(a, email);
    },
    async signOut() {
      await fbSignOut(a);
    },

    watchUser(uid, cb) {
      return onSnapshot(doc(fs, 'users', uid), (s) => cb(s.exists() ? asUser(uid, s.data()) : null));
    },
    watchSpaces(ids, cb) {
      return watchByChunks(ids, (p) => query(collection(fs, 'spaces'), where(documentId(), 'in', p)), asSpace, cb);
    },
    watchMembers(spaceIds, cb) {
      if (spaceIds.length === 0) {
        cb([]);
        return () => {};
      }
      const per = new Map<string, Member[]>();
      const unsubs = spaceIds.map((sid) =>
        onSnapshot(collection(fs, 'spaces', sid, 'members'), (snap) => {
          per.set(
            sid,
            snap.docs.map((d) => asMember(sid)(d.id, d.data())),
          );
          cb([...per.values()].flat());
        }),
      );
      return () => unsubs.forEach((u) => u());
    },
    watchItems(spaceIds, cb) {
      return watchByChunks(spaceIds, (p) => query(collection(fs, 'items'), where('spaceIds', 'array-contains-any', p)), asItem, cb);
    },
    watchPhotos(spaceIds, cb) {
      const cons = (p: string[]): QueryConstraint[] => [
        where('spaceIds', 'array-contains-any', p),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc'),
      ];
      return watchByChunks(spaceIds, (p) => query(collection(fs, 'photos'), ...cons(p)), asPhoto, cb);
    },
    watchTrash(uid, cb) {
      const q = query(collection(fs, 'photos'), where('ownerUid', '==', uid), where('status', '==', 'trashed'), orderBy('trashedAt', 'desc'));
      return onSnapshot(q, (snap) => cb(snap.docs.map((d) => asPhoto(d.id, d.data()))));
    },
    watchAlbums(spaceIds, cb) {
      return watchByChunks(spaceIds, (p) => query(collection(fs, 'albums'), where('spaceIds', 'array-contains-any', p)), asAlbum, cb);
    },
    watchDedupeGroups(spaceId, cb) {
      const q = query(collection(fs, 'dedupeGroups'), where('spaceId', '==', spaceId), where('status', 'in', ['open', 'awaiting_owner']));
      return onSnapshot(
        q,
        (snap) =>
          cb(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                spaceId: x.spaceId,
                kind: x.kind,
                photoIds: x.photoIds ?? [],
                keepPhotoId: x.keepPhotoId,
                status: x.status,
                updatedAt: x.updatedAt ?? 0,
              } satisfies DedupeGroup;
            }),
          ),
        () => cb([]),
      );
    },
    watchMergeRequests(uid, cb) {
      const q = query(collection(fs, 'mergeRequests'), where('ownerUid', '==', uid), where('status', '==', 'pending'));
      return onSnapshot(
        q,
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MergeRequest, 'id'>) }))),
        () => cb([]),
      );
    },

    newId() {
      return doc(collection(fs, 'items')).id;
    },
    async saveItem(item, isNew) {
      const data = stripId(item);
      if (isNew) await setDoc(doc(fs, 'items', item.id), data);
      else await updateDoc(doc(fs, 'items', item.id), data as DocumentData);
    },
    async deleteItem(id) {
      await deleteDoc(doc(fs, 'items', id));
    },
    async updateUser(uid, patch) {
      await updateDoc(doc(fs, 'users', uid), patch as DocumentData);
    },
    async updateSpace(id, patch) {
      await updateDoc(doc(fs, 'spaces', id), patch as DocumentData);
    },
    async addProfileMember(spaceId, displayName, managedByUid) {
      const ref = doc(collection(fs, 'spaces', spaceId, 'members'));
      await setDoc(ref, { spaceId, displayName, role: 'member', uid: null, managedByUid, joinedAt: Date.now() });
      return ref.id;
    },
    async renameProfileMember(spaceId, memberId, displayName) {
      await updateDoc(doc(fs, 'spaces', spaceId, 'members', memberId), { displayName });
    },
    async deleteProfileMember(spaceId, memberId) {
      await deleteDoc(doc(fs, 'spaces', spaceId, 'members', memberId));
    },
    async saveAlbum(album) {
      await setDoc(doc(fs, 'albums', album.id), stripId(album));
    },
    async deleteAlbum(id) {
      await deleteDoc(doc(fs, 'albums', id));
    },

    api: (method, path, body) => api(method, path, body),
    async uploadPhotoBlob(photoId, variant, data, contentType) {
      const token = await a.currentUser?.getIdToken();
      const body = typeof data === 'string' ? await (await fetch(data)).blob() : data;
      const res = await fetch(`${config.apiUrl}/photos/${photoId}/blob/${variant}`, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body,
      });
      if (!res.ok) throw new ApiError(res.status, 'upload-failed', '사진을 올리지 못했어요. 네트워크를 확인해주세요.');
    },
  };
}
