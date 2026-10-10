// 초대 링크 만들기·보내기·복사 (명세서 2.3)
// 안드로이드는 공유 시트(카카오톡이 첫 줄에 뜬다), 웹은 Web Share가 있으면 그것을, 없으면 복사한다.
import type { CreateInviteRequest, CreateInviteResponse } from '@hanjibung/core';
import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

import type { Backend } from '@/lib/backend';

export async function createInvite(backend: Backend, spaceId: string, targetMemberId?: string): Promise<CreateInviteResponse> {
  const body: CreateInviteRequest = targetMemberId ? { targetMemberId } : {};
  return backend.api<CreateInviteResponse>('POST', `/spaces/${spaceId}/invites`, body);
}

export function inviteText(spaceName: string, url: string, targetName?: string): string {
  return targetName ? `${targetName}님, 한지붕 '${spaceName}'에 초대합니다: ${url}` : `한지붕 '${spaceName}'에 초대합니다: ${url}`;
}

/** 보냈으면 'shared', 웹에서 공유를 못 해 복사했으면 'copied', 취소면 'cancelled' */
export async function sendInvite(text: string, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
    if (nav?.share) {
      try {
        await nav.share({ text, url });
        return 'shared';
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return 'cancelled';
      }
    }
    await Clipboard.setStringAsync(text);
    return 'copied';
  }
  const res = await Share.share({ message: text }, { dialogTitle: '초대 보내기' });
  return res.action === Share.dismissedAction ? 'cancelled' : 'shared';
}

export async function copyInvite(url: string): Promise<void> {
  await Clipboard.setStringAsync(url);
}
