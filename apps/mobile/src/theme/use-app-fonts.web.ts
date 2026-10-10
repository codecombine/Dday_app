// 웹: 글꼴 파일(약 11MB)을 묶지 않고 public/fonts.css로 필요한 글자 조각만 받는다
let injected = false;

export function useAppFonts(): boolean {
  if (!injected && typeof document !== 'undefined') {
    injected = true;
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://fonts.gstatic.com';
    preconnect.crossOrigin = 'anonymous';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/fonts.css';
    document.head.append(preconnect, link);
  }
  return true;
}
