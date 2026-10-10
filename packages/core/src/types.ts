// 한지붕 도메인 타입. 앱(Firestore 문서)과 Worker(API)가 함께 쓴다.
// 날짜는 'YYYY-MM-DD', 시각은 'HH:mm', 타임스탬프는 epoch millis(number)로 통일한다.

export type ISODate = string; // 'YYYY-MM-DD'
export type HHmm = string; // 'HH:mm'
export type Millis = number;

// ── 공간 ─────────────────────────────────────────────

export type SpaceKind = 'personal' | 'shared';

export const SPACE_COLORS = [
  '#0B3040', // 남색 (기본)
  '#B85C1E', // 주황
  '#2E7D74', // 청록
  '#5B6673', // 회색
  '#7A4BA0', // 보라
  '#1F5FBF', // 파랑
  '#A8326E', // 자주
  '#3F7F2E', // 초록
  '#8A6D1F', // 황토
  '#C23B3B', // 빨강
] as const;

export type PhotoDeleteRule = 'owner' | 'ownerOrAdmin';
export type OnLeaveRule = 'keep' | 'remove' | 'ask';
export type EventEditRule = 'owner' | 'all';

export interface SpaceRules {
  photoDelete: PhotoDeleteRule;
  onLeave: OnLeaveRule;
  eventEditDefault: EventEditRule;
}

export const DEFAULT_SPACE_RULES: SpaceRules = {
  photoDelete: 'owner',
  onLeave: 'ask',
  eventEditDefault: 'owner',
};

export interface Space {
  id: string;
  name: string;
  color: string;
  kind: SpaceKind;
  ownerUid: string;
  adminUids: string[];
  memberUids: string[];
  rules: SpaceRules;
  createdAt: Millis;
}

export type MemberRole = 'admin' | 'member';

export interface Member {
  id: string;
  spaceId: string;
  displayName: string;
  role: MemberRole;
  /** 앱을 쓰는 구성원이면 Firebase uid, 프로필 구성원이면 null */
  uid: string | null;
  /** 프로필 구성원을 대신 관리하는 사람 */
  managedByUid: string | null;
  joinedAt: Millis;
}

// ── 사용자 ───────────────────────────────────────────

export type AuthProvider = 'kakao' | 'google' | 'password';
export type ThemePref = 'system' | 'light' | 'dark';

export interface NotifySettings {
  anniversary: boolean;
  familyEvent: boolean;
  newPhoto: boolean;
  dedupeReview: boolean;
}

export interface AutoUploadSettings {
  enabled: boolean;
  album: string | null; // 폰 앨범(폴더) 이름, null이면 카메라
  spaceIds: string[];
  wifiOnly: boolean;
  chargingOnly: boolean;
}

export interface UserSettings {
  notify: NotifySettings;
  theme: ThemePref;
  defaultReminderTime: HHmm;
  pinnedItemIds: string[];
  lastShareSpaceIds: string[];
  autoUpload: AutoUploadSettings;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  notify: { anniversary: true, familyEvent: true, newPhoto: false, dedupeReview: true },
  theme: 'system',
  defaultReminderTime: '09:00',
  pinnedItemIds: [],
  lastShareSpaceIds: [],
  autoUpload: { enabled: false, album: null, spaceIds: [], wifiOnly: true, chargingOnly: true },
};

export interface UserDoc {
  uid: string;
  displayName: string;
  provider: AuthProvider;
  personalSpaceId: string;
  spaceIds: string[];
  settings: UserSettings;
  createdAt: Millis;
}

// ── 항목 (일정·기념일) ────────────────────────────────

export type ItemKind = 'event' | 'anniversary';
export type Repeat = 'none' | 'weekly' | 'monthly' | 'yearly';
/** countdown: D-n / since: 지난 날부터 n일째 */
export type AnniversaryMode = 'countdown' | 'since';

export interface LunarDate {
  month: number;
  day: number;
  leap: boolean;
}

export interface Reminder {
  /** 며칠 전 (0 = 당일) */
  daysBefore: number;
  /** 알림 시각. 시각 일정에서 hoursBefore를 쓰면 무시 */
  time: HHmm;
  /** 시각 일정 전용: N시간 전 */
  hoursBefore?: number;
}

export interface Participant {
  spaceId: string;
  memberId: string;
  displayName: string;
}

export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  memo: string;
  spaceIds: string[];
  ownerUid: string;
  coEdit: boolean;
  /** 비어 있으면 "가족 모두" */
  participants: Participant[];
  /** 시작일 (반복이면 기준일, 음력이면 처음 입력한 해의 양력일) */
  date: ISODate;
  allDay: boolean;
  time: HHmm | null;
  endDate: ISODate | null;
  endTime: HHmm | null;
  repeat: Repeat;
  lunar: LunarDate | null;
  mode: AnniversaryMode;
  countFromOne: boolean;
  /** 100일 단위·주년 기념일 표시/알림 */
  milestones: boolean;
  reminders: Reminder[];
  createdAt: Millis;
  updatedAt: Millis;
  updatedBy: string;
}

// ── 사진 ─────────────────────────────────────────────

export type PhotoStatus = 'uploading' | 'active' | 'trashed';
export type PhotoSource = 'camera' | 'kakao' | 'screenshot' | 'unknown';
export type PhotoVariant = 'original' | 'preview' | 'thumb';

export interface PhotoFingerprint {
  sha256: string; // hex 64자
  phash: string; // hex 16자 (64비트)
  width: number;
  height: number;
  bytes: number;
  hasExif: boolean;
  takenAt: Millis | null;
  source: PhotoSource;
}

export interface Photo extends PhotoFingerprint {
  id: string;
  ownerUid: string;
  spaceIds: string[];
  albumIds: string[];
  mime: string;
  cameraModel: string | null;
  originalName: string;
  status: PhotoStatus;
  trashedAt: Millis | null;
  trashedBy: string | null;
  createdAt: Millis;
}

export interface Album {
  id: string;
  name: string;
  spaceIds: string[];
  ownerUid: string;
  coverPhotoId: string | null;
  createdAt: Millis;
}

// ── 중복 정리 ────────────────────────────────────────

export type DedupeKind = 'exact' | 'copy' | 'similar';
export type DedupeStatus = 'open' | 'awaiting_owner' | 'applied' | 'dismissed';

export interface DedupeGroup {
  id: string;
  spaceId: string;
  kind: DedupeKind;
  photoIds: string[];
  keepPhotoId: string;
  status: DedupeStatus;
  updatedAt: Millis;
}

export interface MergeRequest {
  id: string;
  groupId: string;
  photoId: string;
  ownerUid: string;
  addSpaceIds: string[];
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Millis;
}
