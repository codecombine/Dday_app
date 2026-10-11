// 새 일정·기념일. 쿼리: kind=event|anniversary, date=YYYY-MM-DD
import { isValidISODate, type ItemKind } from '@hanjibung/core';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useToday } from '@/components/schedule/data';
import { defaultShare, ItemForm, newDraft } from '@/components/schedule/ItemForm';
import { useSession } from '@/lib/session';

export default function NewItem() {
  const params = useLocalSearchParams<{ kind?: string; date?: string }>();
  const { backend, uid, settings, spaces, spaceById, mySpaceIds, personalSpaceId } = useSession();
  const today = useToday();
  const [initial] = useState(() => {
    const kind: ItemKind = params.kind === 'anniversary' ? 'anniversary' : 'event';
    const date = params.date && isValidISODate(params.date) ? params.date : today;
    const share = defaultShare(settings, spaces, mySpaceIds, personalSpaceId);
    return newDraft(backend.newId(), uid, kind, date, share, spaceById, settings);
  });
  return <ItemForm initial={initial} isNew />;
}
