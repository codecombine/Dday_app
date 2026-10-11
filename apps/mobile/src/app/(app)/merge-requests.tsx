// 합치기 확인 요청 (명세서 9.3): 관리자가 중복 정리를 하면서 내 사진(원본)을 새 공간에 보이게 하려 할 때
import type { MergeRequest } from '@hanjibung/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { Button, Card, Empty, IconButton, Note, SpaceTag, T, TopBar, Screen } from '@/components/ui';
import { personName, subject } from '@/lib/photos/format';
import { errorText } from '@/lib/photos/upload';
import { useMergeRequests } from '@/lib/photos/use-photos';
import { useSession } from '@/lib/session';
import { myName, tagsFor } from '@/lib/spaces';
import { useTheme } from '@/theme';

export default function MergeRequests() {
  const reqs = useMergeRequests();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));
  return (
    <Screen edges={['top', 'bottom']} header={<TopBar left={<IconButton name="chevron-left" label="뒤로" onPress={back} />} title="합치기 확인 요청" />}>
      <Note>
        가족이 중복 사진을 정리하면서, 내가 올린 원본에 사본의 공유 범위를 합치려고 해요. 승인하면 아래 공간에서도 원본이 보이고 사본은 휴지통으로 가요. 거절하면 사본이 그대로 남아요.
      </Note>
      {reqs.length === 0 ? <Empty text="확인할 요청이 없어요." /> : reqs.map((r) => <RequestCard key={r.id} req={r} />)}
    </Screen>
  );
}

function RequestCard({ req }: { req: MergeRequest }) {
  const { c } = useTheme();
  const { backend, members, uid, me, spaceById } = useSession();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const who = personName(members, req.requestedBy, uid, myName(members, uid, me?.displayName ?? '나'));

  const act = async (kind: 'approve' | 'reject') => {
    setBusy(kind);
    setError(null);
    try {
      await backend.api('POST', `/merge-requests/${req.id}/${kind}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card padded style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <PhotoThumb id={req.photoId} size={88} rounded={10} label="내가 올린 원본 사진" onPress={() => router.push({ pathname: '/photo/[id]', params: { id: req.photoId } })} />
        <View style={{ flex: 1, gap: 6 }}>
          <T v="label">{subject(who)} 중복 정리를 하면서 이 사진을 다음 공간에도 보이게 하려고 해요.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {tagsFor(req.addSpaceIds, spaceById).map((t) => (
              <SpaceTag key={t.id} name={t.name} color={t.color} />
            ))}
            {req.addSpaceIds.some((id) => !spaceById[id]) ? (
              <T v="tiny" muted>
                내가 속하지 않은 공간 포함
              </T>
            ) : null}
          </View>
        </View>
      </View>
      {error ? (
        <T v="caption" color={c.danger}>
          {error}
        </T>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="거절" kind="secondary" style={{ flex: 1 }} onPress={() => act('reject')} loading={busy === 'reject'} disabled={!!busy} />
        <Button label="승인" style={{ flex: 1 }} onPress={() => act('approve')} loading={busy === 'approve'} disabled={!!busy} />
      </View>
    </Card>
  );
}
