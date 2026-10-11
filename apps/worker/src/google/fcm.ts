// FCM HTTP v1 발송
import { type Fetcher, parseGoogleError } from './http';

export interface PushMessage {
  /** 없으면 데이터만 보내는 무음 푸시 */
  notification?: { title: string; body: string };
  data: Record<string, string>;
}

export type PushResult = 'ok' | 'unregistered' | 'error';

export interface PushSender {
  send(token: string, msg: PushMessage): Promise<PushResult>;
}

export class FcmClient implements PushSender {
  constructor(
    private readonly projectId: string,
    private readonly token: () => Promise<string>,
    private readonly fetcher: Fetcher,
  ) {}

  async send(deviceToken: string, msg: PushMessage): Promise<PushResult> {
    const message: Record<string, unknown> = {
      token: deviceToken,
      data: msg.data,
      android: msg.notification
        ? { priority: 'high', notification: { channel_id: 'family', tag: msg.data.tag } }
        : { priority: 'high' },
    };
    if (msg.notification) message.notification = msg.notification;
    const res = await this.fetcher(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (res.ok) return 'ok';
    const err = await parseGoogleError(res);
    const details = (err.body as { error?: { details?: { errorCode?: string }[] } })?.error?.details ?? [];
    if (details.some((d) => d.errorCode === 'UNREGISTERED')) return 'unregistered';
    console.warn('FCM 발송 실패', err.status, err.reason, err.message);
    return 'error';
  }
}
