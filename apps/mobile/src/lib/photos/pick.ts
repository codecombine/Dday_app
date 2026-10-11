// 웹: 파일 고르기(여러 장·폴더)와 끌어놓기. 네이티브 구현은 pick.native.ts
import type { LocalPhoto } from './types';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i;

let seq = 0;

export function filesToLocal(files: Iterable<File> | ArrayLike<File>): LocalPhoto[] {
  return Array.from(files as ArrayLike<File>)
    .filter((f) => f.type.startsWith('image/') || IMAGE_EXT.test(f.name))
    .map((f) => ({
      key: `web-${++seq}-${f.name}`,
      uri: URL.createObjectURL(f),
      file: f,
      name: f.name,
      mime: f.type || 'image/jpeg',
      bytes: f.size,
      width: 0,
      height: 0,
    }));
}

/** 파일 선택 창. directory면 폴더 통째로 고른다 (전체 가져오기) */
export function pickPhotos(opts: { directory?: boolean } = {}): Promise<LocalPhoto[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    if (opts.directory) input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    let done = false;
    const finish = (list: LocalPhoto[]) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(list);
    };
    input.addEventListener('change', () => finish(filesToLocal(input.files ?? [])));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

export const canPickDirectory = true;

/** 다 쓴 미리보기 주소 정리 */
export function releaseLocal(list: LocalPhoto[]): void {
  for (const l of list) if (l.uri.startsWith('blob:')) URL.revokeObjectURL(l.uri);
}
