// 앨범 고르기 시트 (사진 올리기·사진 보기에서 함께 쓴다). 새 앨범도 여기서 바로 만든다
import type { Album } from '@hanjibung/core';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, CheckRow, Field, Note } from '@/components/ui';
import { useSession } from '@/lib/session';

import { useSpaceNames } from './AlbumsRow';
import { Sheet } from './Sheet';

export function AlbumPicker({
  visible,
  onClose,
  selected,
  onSelect,
  newAlbumSpaceIds,
  allowNone = true,
  title = '앨범 고르기',
  selectedIds,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string | null;
  onSelect: (albumId: string | null) => void;
  /** 새 앨범을 만들 때 쓸 공유 범위 */
  newAlbumSpaceIds: string[];
  allowNone?: boolean;
  title?: string;
  /** 여러 앨범 모드 (사진 보기의 앨범에 넣기·빼기): 눌러도 시트를 닫지 않는다 */
  selectedIds?: string[];
}) {
  const { albums, backend, uid } = useSession();
  const names = useSpaceNames();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const sorted = [...albums].sort((a, b) => b.createdAt - a.createdAt);

  const create = async () => {
    const n = name.trim();
    if (!n || !newAlbumSpaceIds.length) return;
    setCreating(true);
    try {
      const album: Album = { id: backend.newId(), name: n, spaceIds: newAlbumSpaceIds, ownerUid: uid, coverPhotoId: null, createdAt: Date.now() };
      await backend.saveAlbum(album);
      setName('');
      onSelect(album.id);
      if (!selectedIds) onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Card>
        {allowNone ? (
          <CheckRow
            first
            label="선택 안 함"
            checked={selected === null}
            onPress={() => {
              onSelect(null);
              onClose();
            }}
          />
        ) : null}
        {sorted.map((a, i) => (
          <CheckRow
            key={a.id}
            first={!allowNone && i === 0}
            label={a.name}
            sub={names(a.spaceIds)}
            checked={selectedIds ? selectedIds.includes(a.id) : selected === a.id}
            onPress={() => {
              onSelect(a.id);
              if (!selectedIds) onClose();
            }}
          />
        ))}
      </Card>
      <View style={{ gap: 8 }}>
        <Field label="새 앨범" placeholder="예: 2026 추석" value={name} onChangeText={setName} maxLength={30} onSubmitEditing={create} />
        <Note>새 앨범은 지금 고른 공유 범위로 만들어요.</Note>
        <Button label="새 앨범 만들고 넣기" kind="secondary" onPress={create} loading={creating} disabled={!name.trim() || !newAlbumSpaceIds.length} />
      </View>
    </Sheet>
  );
}
