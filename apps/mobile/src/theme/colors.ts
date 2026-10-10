// 디자인 토큰 (시안의 색을 그대로 옮김). 라이트·다크 두 벌.

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  inkSoft: string;
  muted: string;
  line: string;
  border: string;
  primary: string;
  onPrimary: string;
  primaryTint: string;
  primaryCardText: string;
  primaryCardMuted: string;
  primaryCardInner: string;
  danger: string;
  dangerTint: string;
  dangerBorder: string;
  sunday: string;
  saturday: string;
  kakao: string;
  onKakao: string;
  switchOff: string;
  shadow: string;
}

export const light: Palette = {
  bg: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceAlt: '#E3E6EA',
  ink: '#14212B',
  inkSoft: '#3D4853',
  muted: '#5B6673',
  line: '#E3E6EA',
  border: '#D5DAE0',
  primary: '#0B3040',
  onPrimary: '#FFFFFF',
  primaryTint: '#E2EBF0',
  primaryCardText: '#FFFFFF',
  primaryCardMuted: '#C8D6DE',
  primaryCardInner: '#164558',
  danger: '#A82E2E',
  dangerTint: '#FBE9E9',
  dangerBorder: '#F0C4C4',
  sunday: '#C23B3B',
  saturday: '#1F5FBF',
  kakao: '#FEE500',
  onKakao: '#191600',
  switchOff: '#C9CFD6',
  shadow: 'rgba(11, 48, 64, 0.25)',
};

export const dark: Palette = {
  bg: '#0E1419',
  surface: '#182129',
  surfaceAlt: '#26313A',
  ink: '#E8EDF1',
  inkSoft: '#C3CCD4',
  muted: '#9AA6B2',
  line: '#26313A',
  border: '#33414D',
  primary: '#8CC3DB',
  onPrimary: '#0B1E28',
  primaryTint: '#1C3442',
  primaryCardText: '#F2F7FA',
  primaryCardMuted: '#A9C0CC',
  primaryCardInner: '#1F4558',
  danger: '#F08A8A',
  dangerTint: '#3A1F22',
  dangerBorder: '#5A2E33',
  sunday: '#F07F7F',
  saturday: '#7FAEF0',
  kakao: '#FEE500',
  onKakao: '#191600',
  switchOff: '#3A4651',
  shadow: 'rgba(0, 0, 0, 0.5)',
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** a와 b를 t(0~1) 비율로 섞는다 */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export interface SpaceTone {
  /** 점·선 색 */
  dot: string;
  /** 꼬리표 배경 */
  tint: string;
  /** 꼬리표 글자 (배경 대비 4.5:1 이상이 되도록 어둡게/밝게) */
  text: string;
}

/** 공간 색 하나로 점·꼬리표 배경·글자 색을 만든다 */
export function spaceTone(color: string, scheme: 'light' | 'dark'): SpaceTone {
  if (scheme === 'dark') {
    return { dot: mix(color, '#FFFFFF', 0.25), tint: mix(color, '#0E1419', 0.72), text: mix(color, '#FFFFFF', 0.6) };
  }
  return { dot: color, tint: mix(color, '#FFFFFF', 0.87), text: mix(color, '#000000', 0.2) };
}
