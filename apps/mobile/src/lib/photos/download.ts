// 웹: 원본 내려받기 (서명 주소 + dl=1 → Worker가 첨부 파일로 보낸다). 네이티브 구현은 download.native.ts
export function downloadUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}dl=1`;
}

export async function saveOriginal(url: string, fileName: string): Promise<string> {
  const a = document.createElement('a');
  a.href = url.startsWith('data:') || url.startsWith('blob:') ? url : downloadUrl(url);
  a.download = fileName;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return '원본을 내려받는 중이에요';
}
