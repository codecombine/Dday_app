// 올리기 파이프라인에서 쓰는 타입
import type { PreparePhotoInput } from '@hanjibung/core';

/** 원본 그대로 / 용량 절약(긴 변 2048px, JPEG 85) */
export type Quality = 'original' | 'saver';

/** 폰(또는 웹)에서 고른 사진 한 장 */
export interface LocalPhoto {
  /** 화면 목록 키 */
  key: string;
  /** 표시·처리용 주소 (네이티브: 파일 uri, 웹: object URL) */
  uri: string;
  /** 웹: 원본 파일 */
  file?: Blob;
  name: string;
  mime: string;
  /** 모르면 0 */
  bytes: number;
  width: number;
  height: number;
  /** 네이티브 사진 고르기·사진첩이 준 EXIF */
  exif?: Record<string, unknown> | null;
  /** 폰 사진첩 ID (자동 올리기·전체 가져오기) */
  assetId?: string | null;
}

/** 올릴 파일 하나: 네이티브는 파일 uri, 웹은 Blob */
export interface Variant {
  data: Blob | string;
  contentType: string;
  bytes: number;
}

/** 지문 계산과 미리보기·썸네일 만들기가 끝난 사진 */
export interface AnalyzedPhoto {
  local: LocalPhoto;
  input: PreparePhotoInput;
  original: Variant;
  preview: Variant;
  thumb: Variant;
  /** 다 올린 뒤 지울 임시 파일 (네이티브) */
  temp: string[];
}
