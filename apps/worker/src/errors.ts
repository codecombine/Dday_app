// API 오류. 응답은 { error, message } (message는 사용자에게 보여줄 한국어)
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message = '요청 형식이 올바르지 않아요', code = 'bad_request', extra?: Record<string, unknown>) =>
  new HttpError(400, code, message, extra);
export const unauthorized = (message = '다시 로그인해 주세요') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = '권한이 없어요', code = 'forbidden') => new HttpError(403, code, message);
export const notFound = (message = '찾을 수 없어요', code = 'not_found') => new HttpError(404, code, message);
export const conflict = (code: string, message: string, extra?: Record<string, unknown>) =>
  new HttpError(409, code, message, extra);
export const upstream = (message = '외부 서비스와 통신하지 못했어요. 잠시 후 다시 시도해 주세요', code = 'upstream_error') =>
  new HttpError(502, code, message);
