// 새 앨범 만들기 / 앨범 편집(?id=, 만든 사람만): 이름 · 공유 범위 · 지우기
import { isValidShare, type Album } from '@hanjibung/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useDialog } from '@/components/photos/Sheet';
import { ShareScope } from '@/components/ShareScope';
import { Button, Field, Note, Screen, T, TextButton, TopBar } from '@/components/ui';
import { errorText } from '@/lib/photos/upload';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

export default function AlbumEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { albums, backend, uid, settings, mySpaceIds, personalSpaceId } = useSession();
  const { c } = useTheme();
  const dialog = useDialog();
  const existing = id ? albums.find((a) => a.id === id) : undefined;
  const initialShare = existing?.spaceIds ?? settings.lastShareSpaceIds.filter((s) => mySpaceIds.includes(s));
  const [name, setName] = useState(existing?.name ?? '');
  const [spaceIds, setSpaceIds] = useState<string[]>(initialShare.length ? initialShare : [personalSpaceId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length > 0 && isValidShare(spaceIds, mySpaceIds, personalSpaceId);
  const canEdit = !existing || existing.ownerUid === uid;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/album'));

  const save = async () => {
    if (!valid || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const album: Album = existing
        ? { ...existing, name: name.trim(), spaceIds }
        : { id: backend.newId(), name: name.trim(), spaceIds, ownerUid: uid, coverPhotoId: null, createdAt: Date.now() };
      await backend.saveAlbum(album);
      if (existing) back();
      else router.replace({ pathname: '/album/[id]', params: { id: album.id } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await dialog.ask({
      title: `'${existing.name}' 앨범을 지울까요?`,
      message: '앨범만 지워지고 사진은 그대로 남아요.',
      options: [
        { label: '앨범 지우기', value: true, kind: 'danger' },
        { label: '취소', value: false, kind: 'ghost' },
      ],
    });
    if (!ok) return;
    await backend.deleteAlbum(existing.id);
    router.replace('/album');
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      header={
        <TopBar
          left={<TextButton label="취소" onPress={back} />}
          title={existing ? '앨범 편집' : '새 앨범'}
          right={<TextButton label={existing ? '저장' : '만들기'} strong onPress={save} disabled={!valid || saving || !canEdit} />}
        />
      }>
      {!canEdit ? <Note>앨범은 만든 사람만 바꿀 수 있어요.</Note> : null}
      <Field label="앨범 이름" placeholder="예: 2026 추석" value={name} onChangeText={setName} maxLength={30} autoFocus={!existing} />
      <ShareScope value={spaceIds} onChange={setSpaceIds} title="누가 볼 수 있나요" note="앨범이 보이는 공간이에요. 사진마다의 공유 범위는 따로 정해요." />
      {error ? (
        <T v="caption" color={c.danger}>
          {error}
        </T>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button label={existing ? '저장' : '앨범 만들기'} onPress={save} loading={saving} disabled={!valid || !canEdit} />
        {existing && canEdit ? <Button label="앨범 지우기" kind="danger" onPress={remove} /> : null}
      </View>
      {dialog.element}
    </Screen>
  );
}
