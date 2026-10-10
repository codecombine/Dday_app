// Worker API 요청·응답 타입 (앱과 Worker가 함께 쓰는 계약, 명세서 19장)
import type { Millis, PhotoSource, PhotoVariant, SpaceRules } from './types';

export interface ApiError {
  error: string;
  message: string;
}

// ── 인증 ─────────────────────────────────────────────
export type KakaoAuthRequest = { accessToken: string } | { code: string; redirectUri: string };
export interface KakaoAuthResponse {
  customToken: string;
}

export interface BootstrapRequest {
  displayName?: string;
}
export interface BootstrapResponse {
  personalSpaceId: string;
  spaceIds: string[];
  /** 클레임이 바뀌었으면 true → 앱은 ID 토큰을 새로 받아야 한다 */
  claimsChanged: boolean;
}

export interface DeleteMeRequest {
  /** 공간 규칙이 'ask'인 공간마다 사진 처리 선택 */
  photoChoices?: Record<string, 'keep' | 'remove'>;
}

// ── 공간·초대 ────────────────────────────────────────
export interface CreateSpaceRequest {
  name: string;
  color: string;
  rules?: Partial<SpaceRules>;
}
export interface CreateSpaceResponse {
  spaceId: string;
}

export interface CreateInviteRequest {
  /** 프로필 구성원을 대상으로 한 초대면 그 구성원 ID */
  targetMemberId?: string;
}
export interface CreateInviteResponse {
  token: string;
  url: string;
  expiresAt: Millis;
}

export interface InvitePreview {
  spaceId: string;
  spaceName: string;
  spaceColor: string;
  inviterName: string;
  memberCount: number;
  itemCount: number;
  photoCount: number;
  memberNames: string[];
  targetMemberName: string | null;
  expiresAt: Millis;
  valid: boolean;
}

export interface AcceptInviteResponse {
  spaceId: string;
  spaceIds: string[];
}

export interface LeaveSpaceRequest {
  photoChoice?: 'keep' | 'remove';
}

export interface SetRoleRequest {
  role: 'admin' | 'member';
}

// ── 사진 ─────────────────────────────────────────────
export interface PreparePhotoInput {
  sha256: string;
  phash: string;
  width: number;
  height: number;
  bytes: number;
  mime: string;
  hasExif: boolean;
  takenAt: Millis | null;
  cameraModel: string | null;
  source: PhotoSource;
  originalName: string;
}

export interface PreparePhotosRequest {
  photos: PreparePhotoInput[];
}

export interface PreparedPhoto {
  sha256: string;
  /** 새로 올릴 사진 ID. 같은 파일이 이미 보이면 null */
  photoId: string | null;
  /** 볼 수 있는 사진 중 같은 파일 */
  existingPhotoId: string | null;
}
export interface PreparePhotosResponse {
  photos: PreparedPhoto[];
}

export interface CommitPhotoRequest {
  spaceIds: string[];
  albumIds: string[];
  notify: boolean;
}

export interface PhotoUrlsRequest {
  ids: string[];
  variant: PhotoVariant;
}
export interface PhotoUrlsResponse {
  urls: Record<string, string>;
  expiresAt: Millis;
}

export interface AddToExistingRequest {
  spaceIds: string[];
  albumIds: string[];
}

// ── 중복 정리 ────────────────────────────────────────
export interface ApplyDedupeRequest {
  keepPhotoId: string;
  removePhotoIds: string[];
}
export interface ApplyDedupeResponse {
  trashed: string[];
  /** 원본 주인 확인이 필요해서 보류된 사진 */
  awaitingOwner: string[];
}

export interface ScanResponse {
  groups: number;
}

// ── 캘린더 ───────────────────────────────────────────
export interface GoogleConnectRequest {
  /** 안드로이드: serverAuthCode, 웹: GIS code client의 code */
  code: string;
  /** 웹은 'postmessage', 안드로이드는 빈 문자열 */
  redirectUri: string;
  mirrorSpaceIds?: string[];
}
export interface GoogleStatus {
  connected: boolean;
  email: string | null;
  mirrorSpaceIds: string[];
}

// ── 기기 ─────────────────────────────────────────────
export interface RegisterDeviceRequest {
  deviceId: string;
  fcmToken: string;
  platform: 'android' | 'ios' | 'web';
}

/** 무음 푸시 데이터 */
export interface SilentPushData {
  type: 'items-changed' | 'photos-changed' | 'dedupe' | 'merge-request';
  [key: string]: string;
}
