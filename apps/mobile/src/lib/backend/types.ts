// 앱이 데이터에 접근하는 단일 창구. 실제(Firebase+Worker)와 데모(메모리) 두 구현이 있다.
import type {
  Album,
  AuthProvider,
  DedupeGroup,
  Item,
  Member,
  MergeRequest,
  Photo,
  PhotoVariant,
  Space,
  SpaceRules,
  UserDoc,
  UserSettings,
} from '@hanjibung/core';

export type Unsubscribe = () => void;

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  provider: AuthProvider;
  emailVerified: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Backend {
  kind: 'firebase' | 'demo';

  // ── 인증 ──
  onAuth(cb: (user: AuthUser | null) => void): Unsubscribe;
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
  signInWithGoogle(): Promise<void>;
  /** 웹은 카카오 로그인 페이지로 이동한다 (돌아오면 completeKakaoRedirect) */
  signInWithKakao(): Promise<void>;
  completeKakaoRedirect(code: string, redirectUri: string): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  /** 가입 후 인증 메일을 보내고 로그아웃한다 */
  signUpWithEmail(email: string, password: string, displayName: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;

  // ── 실시간 구독 ──
  watchUser(uid: string, cb: (user: UserDoc | null) => void): Unsubscribe;
  watchSpaces(ids: string[], cb: (spaces: Space[]) => void): Unsubscribe;
  watchMembers(spaceIds: string[], cb: (members: Member[]) => void): Unsubscribe;
  watchItems(spaceIds: string[], cb: (items: Item[]) => void): Unsubscribe;
  watchPhotos(spaceIds: string[], cb: (photos: Photo[]) => void): Unsubscribe;
  watchTrash(uid: string, cb: (photos: Photo[]) => void): Unsubscribe;
  watchAlbums(spaceIds: string[], cb: (albums: Album[]) => void): Unsubscribe;
  watchDedupeGroups(spaceId: string, cb: (groups: DedupeGroup[]) => void): Unsubscribe;
  watchMergeRequests(uid: string, cb: (reqs: MergeRequest[]) => void): Unsubscribe;

  // ── 앱이 직접 쓰는 것 (나머지는 Worker API) ──
  newId(): string;
  saveItem(item: Item, isNew: boolean): Promise<void>;
  deleteItem(id: string): Promise<void>;
  updateUser(uid: string, patch: { displayName?: string; settings?: UserSettings }): Promise<void>;
  updateSpace(id: string, patch: { name?: string; color?: string; rules?: SpaceRules }): Promise<void>;
  addProfileMember(spaceId: string, displayName: string, managedByUid: string): Promise<string>;
  renameProfileMember(spaceId: string, memberId: string, displayName: string): Promise<void>;
  deleteProfileMember(spaceId: string, memberId: string): Promise<void>;
  saveAlbum(album: Album): Promise<void>;
  deleteAlbum(id: string): Promise<void>;

  // ── Worker API ──
  api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T>;
  /** 사진 파일 올리기 (PUT /photos/:id/blob/:variant). data는 웹 Blob 또는 네이티브 파일 uri */
  uploadPhotoBlob(photoId: string, variant: PhotoVariant, data: Blob | string, contentType: string): Promise<void>;
}
