// 일정·기념일 수정. 수정 권한이 없으면 읽기 전용 안내를 보여준다.
import { canEditItem } from '@hanjibung/core';
import { router, useLocalSearchParams } from 'expo-router';

import { ItemForm } from '@/components/schedule/ItemForm';
import { Button, Empty, Screen, TextButton, TopBar } from '@/components/ui';
import { useSession } from '@/lib/session';

export default function EditItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, uid, mySpaceIds } = useSession();
  const item = items.find((i) => i.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!item || !canEditItem(item, uid, mySpaceIds)) {
    return (
      <Screen edges={['top', 'bottom']} header={<TopBar title="수정" left={<TextButton label="닫기" onPress={back} />} />}>
        <Empty text={item ? '이 항목은 만든 사람만 고칠 수 있어요.' : '항목을 찾을 수 없어요. 지워졌거나 볼 수 없는 공간으로 옮겨졌어요.'} />
        {item ? (
          <Button label="상세 보기" kind="secondary" onPress={() => router.replace({ pathname: '/item/[id]', params: { id: item.id } })} />
        ) : null}
      </Screen>
    );
  }
  // 다른 사람이 동시에 고쳐도 양식은 처음 연 내용으로 유지한다 (key로 고정)
  return <ItemForm key={item.id} initial={item} isNew={false} />;
}
