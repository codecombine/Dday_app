// 사진 저장소 계층 (명세서 17.2). put / get / head / delete 네 가지만 가진다.
// 앱·Firestore·D1에는 사진 ID만 남기고, 실제 위치(키·버킷·NAS)는 이 계층만 안다.
// NAS로 옮길 때는 같은 인터페이스의 S3BlobStore(S3 호환 + Cloudflare Tunnel)를 추가하고
// BLOB_BACKEND 설정으로 바꾸면 된다.
import type { PhotoVariant } from '@hanjibung/core';

import type { Env } from '../env';

export interface BlobInfo {
  contentType: string;
  size: number;
}

export interface BlobObject extends BlobInfo {
  body: ReadableStream;
}

export interface BlobStore {
  put(key: string, body: ReadableStream | ArrayBuffer, opts: { contentType: string; size?: number }): Promise<void>;
  get(key: string): Promise<BlobObject | null>;
  head(key: string): Promise<BlobInfo | null>;
  delete(key: string): Promise<void>;
}

/** 저장 키: photos/<사진ID>/original | preview.jpg | thumb.jpg */
export function photoBlobKey(photoId: string, variant: PhotoVariant): string {
  switch (variant) {
    case 'original':
      return `photos/${photoId}/original`;
    case 'preview':
      return `photos/${photoId}/preview.jpg`;
    case 'thumb':
      return `photos/${photoId}/thumb.jpg`;
  }
}

export const PHOTO_VARIANTS: readonly PhotoVariant[] = ['original', 'preview', 'thumb'];

export class R2BlobStore implements BlobStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, body: ReadableStream | ArrayBuffer, opts: { contentType: string; size?: number }): Promise<void> {
    // R2는 길이를 아는 스트림만 받는다 (요청 본문은 Content-Length가 있으면 OK)
    const value =
      body instanceof ArrayBuffer || opts.size === undefined ? body : body.pipeThrough(new FixedLengthStream(opts.size));
    await this.bucket.put(key, value, { httpMetadata: { contentType: opts.contentType } });
  }

  async get(key: string): Promise<BlobObject | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
      size: obj.size,
    };
  }

  async head(key: string): Promise<BlobInfo | null> {
    const obj = await this.bucket.head(key);
    if (!obj) return null;
    return { contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream', size: obj.size };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}

export function createBlobStore(env: Env): BlobStore {
  const backend = (env.BLOB_BACKEND ?? 'r2').toLowerCase();
  switch (backend) {
    case 'r2':
      return new R2BlobStore(env.PHOTOS);
    // case 's3': return new S3BlobStore({ endpoint: env.NAS_ENDPOINT, ... }) — 2단계 (NAS)
    default:
      throw new Error(`알 수 없는 BLOB_BACKEND: ${backend}`);
  }
}
