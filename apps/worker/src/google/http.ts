// Google API 호출 공통: JSON 요청·응답, 오류를 GoogleApiError로 바꾼다
export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    /** Google 오류 상태(NOT_FOUND 등) 또는 OAuth error 코드(invalid_grant 등) */
    readonly reason: string,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const defaultFetcher: Fetcher = (input, init) => fetch(input, init);

export async function parseGoogleError(res: Response): Promise<GoogleApiError> {
  const text = await res.text().catch(() => '');
  let body: unknown = text;
  let reason = `HTTP_${res.status}`;
  let message = text.slice(0, 300);
  try {
    body = JSON.parse(text);
    const b = body as { error?: unknown; error_description?: string };
    if (typeof b.error === 'string') {
      reason = b.error;
      message = b.error_description ?? b.error;
    } else if (b.error && typeof b.error === 'object') {
      const e = b.error as { status?: string; message?: string; errors?: { reason?: string }[] };
      reason = e.status ?? e.errors?.[0]?.reason ?? reason;
      message = e.message ?? message;
    }
  } catch {
    // JSON이 아니면 본문 그대로
  }
  return new GoogleApiError(res.status, reason, message, body);
}

export async function googleJson<T>(
  fetcher: Fetcher,
  url: string,
  init: { method?: string; token?: string; body?: unknown; form?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(init.form).toString();
  } else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  const res = await fetcher(url, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body });
  if (!res.ok) throw await parseGoogleError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
