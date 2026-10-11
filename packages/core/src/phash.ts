// 생김새 지문(pHash). 32×32 흑백 픽셀 → DCT → 왼쪽 위 8×8 저주파 성분의 중앙값 비교 → 64비트.
// 크기 조정·재압축에는 거의 변하지 않고, 다른 사진이면 크게 달라진다.

const N = 32;
const K = 8;

let cosTable: Float64Array | null = null;
function cos(): Float64Array {
  if (cosTable) return cosTable;
  const t = new Float64Array(K * N);
  for (let u = 0; u < K; u++) {
    for (let x = 0; x < N; x++) t[u * N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
  }
  cosTable = t;
  return t;
}

/** RGBA(또는 RGB) 픽셀 배열을 32×32 흑백(0-255)으로. 입력은 이미 32×32로 줄인 이미지여야 한다 */
export function grayscale32(pixels: ArrayLike<number>, channels: 3 | 4 = 4): Float64Array {
  if (pixels.length < N * N * channels) throw new Error('32×32 이미지가 필요합니다');
  const g = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const r = pixels[i * channels]!;
    const gr = pixels[i * channels + 1]!;
    const b = pixels[i * channels + 2]!;
    g[i] = 0.299 * r + 0.587 * gr + 0.114 * b;
  }
  return g;
}

/** 32×32 흑백 → 16자리 hex pHash */
export function phashFromGray32(gray: ArrayLike<number>): string {
  if (gray.length !== N * N) throw new Error('32×32 흑백 배열이 필요합니다');
  const c = cos();
  // 행 방향 DCT (u < 8 만)
  const rows = new Float64Array(N * K);
  for (let y = 0; y < N; y++) {
    for (let u = 0; u < K; u++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += gray[y * N + x]! * c[u * N + x]!;
      rows[y * K + u] = s;
    }
  }
  // 열 방향 DCT (v < 8 만)
  const coeffs: number[] = [];
  for (let v = 0; v < K; v++) {
    for (let u = 0; u < K; u++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += rows[y * K + u]! * c[v * N + y]!;
      coeffs.push(s);
    }
  }
  // DC 성분(0,0)을 빼고 중앙값 계산
  const ac = coeffs.slice(1).sort((a, b) => a - b);
  const median = (ac[31]! + ac[32]!) / 2;
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) nibble = (nibble << 1) | (coeffs[i + j]! > median ? 1 : 0);
    hex += nibble.toString(16);
  }
  return hex;
}

const POPCOUNT4 = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** 두 pHash의 다른 비트 수 (0~64) */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('pHash 길이가 다릅니다');
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POPCOUNT4[parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)]!;
  return d;
}

export const PHASH_BAND_COUNT = 8;

/**
 * 후보 검색용: 8비트씩 8조각.
 * 비둘기집 원리로 거리가 7 이하이면 적어도 한 조각은 반드시 같다 → '화질 낮은 사본'(≤6)은 빠짐없이 찾는다.
 */
export function phashBands(h: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < PHASH_BAND_COUNT; i++) out.push(h.slice(i * 2, i * 2 + 2));
  return out;
}
