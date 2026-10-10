// 로그인 상태 + 내 데이터(공간·구성원·항목·앨범) 실시간 구독을 앱 전체에 공급한다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_USER_SETTINGS,
  type AcceptInviteResponse,
  type Album,
  type BootstrapResponse,
  type Item,
  type Member,
  type Space,
  type UserDoc,
  type UserSettings,
} from '@hanjibung/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getBackend, type AuthUser, type Backend } from './backend';

export type SessionStatus = 'loading' | 'signedOut' | 'unverified' | 'ready';

export interface Session {
  status: SessionStatus;
  backend: Backend;
  authUser: AuthUser | null;
  me: UserDoc | null;
  uid: string;
  personalSpaceId: string;
  /** 내가 속한 공간 ID (개인 공간 포함) */
  mySpaceIds: string[];
  /** 개인 공간을 맨 앞에, 나머지는 만든 순서 */
  spaces: Space[];
  spaceById: Record<string, Space>;
  members: Member[];
  items: Item[];
  albums: Album[];
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  /** 공간 참여·탈퇴 뒤 토큰과 공간 목록을 새로 받는다 */
  refreshMembership: () => Promise<void>;
  /** 로그인 전에 받은 초대 토큰 (로그인하면 자동 수락) */
  setPendingInvite: (token: string | null) => Promise<void>;
  lastAcceptedSpaceId: string | null;
  error: string | null;
}

const SessionContext = createContext<Session | null>(null);
const PENDING_INVITE_KEY = 'hanjibung.pendingInvite';

export function SessionProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), []);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [me, setMe] = useState<UserDoc | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastAcceptedSpaceId, setLastAccepted] = useState<string | null>(null);
  const bootstrapped = useRef<string | null>(null);

  const acceptPendingInvite = useCallback(async () => {
    const token = await AsyncStorage.getItem(PENDING_INVITE_KEY);
    if (!token) return;
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
    try {
      const res = await backend.api<AcceptInviteResponse>('POST', `/invites/${token}/accept`);
      await backend.getIdToken(true);
      setLastAccepted(res.spaceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '초대를 수락하지 못했어요.');
    }
  }, [backend]);

  // 로그인 상태
  useEffect(() => {
    return backend.onAuth(async (u) => {
      setAuthUser(u);
      if (!u) {
        bootstrapped.current = null;
        setMe(null);
        setSpaces([]);
        setMembers([]);
        setItems([]);
        setAlbums([]);
        setStatus('signedOut');
        return;
      }
      if (!u.emailVerified) {
        setStatus('unverified');
        return;
      }
      if (bootstrapped.current !== u.uid) {
        try {
          const res = await backend.api<BootstrapResponse>('POST', '/me/bootstrap', { displayName: u.displayName ?? undefined });
          if (res.claimsChanged) await backend.getIdToken(true);
          bootstrapped.current = u.uid;
          await acceptPendingInvite();
        } catch (e) {
          setError(e instanceof Error ? e.message : '서버에 연결하지 못했어요.');
        }
      }
      setStatus('ready');
    });
  }, [backend, acceptPendingInvite]);

  // 내 사용자 문서
  useEffect(() => {
    if (status !== 'ready' || !authUser) return;
    return backend.watchUser(authUser.uid, setMe);
  }, [backend, status, authUser]);

  const spaceKey = (me?.spaceIds ?? []).join(',');

  // 공간·구성원·항목·앨범
  useEffect(() => {
    if (status !== 'ready' || !me) return;
    const ids = me.spaceIds;
    const unsubs = [
      backend.watchSpaces(ids, setSpaces),
      backend.watchMembers(ids, setMembers),
      backend.watchItems(ids, setItems),
      backend.watchAlbums(ids, setAlbums),
    ];
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, status, spaceKey]);

  const refreshMembership = useCallback(async () => {
    await backend.getIdToken(true);
  }, [backend]);

  const setPendingInvite = useCallback(async (token: string | null) => {
    if (token) await AsyncStorage.setItem(PENDING_INVITE_KEY, token);
    else await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  }, []);

  const value = useMemo<Session>(() => {
    const uid = authUser?.uid ?? '';
    const personalSpaceId = me?.personalSpaceId ?? `personal_${uid}`;
    const sorted = [...spaces].sort((a, b) =>
      a.kind === 'personal' ? -1 : b.kind === 'personal' ? 1 : a.createdAt - b.createdAt,
    );
    const settings = me?.settings ?? DEFAULT_USER_SETTINGS;
    return {
      status,
      backend,
      authUser,
      me,
      uid,
      personalSpaceId,
      mySpaceIds: me?.spaceIds ?? [],
      spaces: sorted,
      spaceById: Object.fromEntries(sorted.map((s) => [s.id, s])),
      members,
      items,
      albums,
      settings,
      updateSettings: async (patch) => {
        if (!uid) return;
        await backend.updateUser(uid, { settings: { ...settings, ...patch } });
      },
      refreshMembership,
      setPendingInvite,
      lastAcceptedSpaceId,
      error,
    };
  }, [status, backend, authUser, me, spaces, members, items, albums, refreshMembership, setPendingInvite, lastAcceptedSpaceId, error]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('SessionProvider가 필요합니다');
  return s;
}
