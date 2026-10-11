declare module 'upng-js' {
  interface Image {
    width: number;
    height: number;
    depth: number;
    ctype: number;
  }
  export function decode(buffer: ArrayBuffer): Image;
  export function toRGBA8(img: Image): ArrayBuffer[];
}
