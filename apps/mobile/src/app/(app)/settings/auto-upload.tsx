// 새 사진 자동으로 올리기 설정 (명세서 8.3): 켜기 · 올릴 폴더(기본 카메라) · 기본 공유 범위(기본 나만 보기) · 조건(Wi-Fi·충전 중)
import { isValidShare, type AutoUploadSettings } from '@hanjibung/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { ShareScope } from '@/components/ShareScope';
import { Card, CheckRow, FieldLabel, IconButton, Note, Screen, T, ToggleRow, TopBar } from '@/components/ui';
import { autoUploadAvailable, getAutoUploadStatus, runAutoUpload, setAutoUploadSchedule, startAutoUploadFrom, type AutoUploadStatus } from '@/lib/photos/auto-upload';
import { fullDateTime } from '@/lib/photos/format';
import { ensureLibraryPermission, listFolders, type Folder } from '@/lib/photos/library';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

export default function AutoUploadSettingsScreen() {
  const { c } = useTheme();
  const { settings, updateSettings, uid, personalSpaceId, mySpaceIds, backend } = useSession();
  const auto = settings.autoUpload;
  const [folders, setFolders] = useState<Folder[]>([]);
  const [status, setStatus] = useState<AutoUploadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));
  const share = auto.spaceIds.filter((s) => mySpaceIds.includes(s));
  const shareValue = share.length ? share : [personalSpaceId];
  const [scope, setScope] = useState<string[]>(shareValue);

  // '나' 화면에서 스위치를 켜고 들어오면 바로 켠다 (권한 요청 포함)
  const { enable } = useLocalSearchParams<{ enable?: string }>();
  const enabledOnce = useRef(false);
  useEffect(() => {
    if (enable === '1' && !auto.enabled && autoUploadAvailable && !enabledOnce.current) {
      enabledOnce.current = true;
      void toggle(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enable]);

  useEffect(() => {
    void getAutoUploadStatus().then(setStatus);
    if (!autoUploadAvailable) return;
    void ensureLibraryPermission(false).then((ok) => (ok ? listFolders().then(setFolders) : undefined));
  }, []);

  const save = (patch: Partial<AutoUploadSettings>) => updateSettings({ autoUpload: { ...auto, ...patch } });

  const toggle = async (on: boolean) => {
    setError(null);
    if (on) {
      const ok = await ensureLibraryPermission(true);
      if (!ok) {
        setError('사진 접근 권한을 허용해야 자동으로 올릴 수 있어요. 휴대폰 설정에서 권한을 켜 주세요.');
        return;
      }
      setFolders(await listFolders());
      // 지금 이후에 찍은 사진만 올린다
      await startAutoUploadFrom(uid);
      const next = { ...auto, enabled: true, spaceIds: isValidShare(scope, mySpaceIds, personalSpaceId) ? scope : [personalSpaceId] };
      await updateSettings({ autoUpload: next });
      await setAutoUploadSchedule(true);
      void runAutoUpload(backend, { uid, personalSpaceId, spaceIds: mySpaceIds, auto: next }).then(() => getAutoUploadStatus().then(setStatus));
    } else {
      await save({ enabled: false });
      await setAutoUploadSchedule(false);
    }
  };

  const folderTitle = auto.album ?? 'Camera';
  const folderList = folders.length ? folders : [{ id: 'camera', title: 'Camera' }];

  return (
    <Screen edges={['top', 'bottom']} header={<TopBar left={<IconButton name="chevron-left" label="뒤로" onPress={back} />} title="자동 올리기" />} contentStyle={{ paddingTop: 8, gap: 20 }}>
      <Card>
        <ToggleRow
          first
          label="새 사진 자동으로 올리기"
          sub={autoUploadAvailable ? '끄면 직접 고른 사진만 올라가요' : '안드로이드 앱에서 쓸 수 있어요'}
          value={auto.enabled && autoUploadAvailable}
          onChange={(v) => (autoUploadAvailable ? void toggle(v) : undefined)}
        />
      </Card>
      {!autoUploadAvailable ? <Note>웹에서는 폰 사진첩에 접근할 수 없어요. 대신 &apos;폰 사진 전체 가져오기&apos;에서 폴더를 통째로 올릴 수 있어요.</Note> : null}
      {error ? (
        <T v="caption" color={c.danger}>
          {error}
        </T>
      ) : null}

      <View style={{ gap: 20, opacity: auto.enabled ? 1 : 0.5 }} pointerEvents={auto.enabled && autoUploadAvailable ? 'auto' : 'none'}>
        <View style={{ gap: 8 }}>
          <FieldLabel>올릴 폴더</FieldLabel>
          <Card>
            {folderList.map((f, i) => (
              <CheckRow
                key={f.id}
                first={i === 0}
                label={f.title === 'Camera' ? '카메라' : f.title}
                checked={f.title === folderTitle}
                onPress={() => save({ album: f.title === 'Camera' ? null : f.title })}
              />
            ))}
          </Card>
        </View>

        <ShareScope
          title="기본 공유 범위"
          value={scope}
          onChange={(v) => {
            setScope(v);
            if (isValidShare(v, mySpaceIds, personalSpaceId)) void save({ spaceIds: v });
          }}
          note="자동으로 올린 사진은 가족에게 알림을 보내지 않아요. 나중에 사진마다 공유 범위를 바꿀 수 있어요."
        />

        <View style={{ gap: 8 }}>
          <FieldLabel>올리는 조건</FieldLabel>
          <Card>
            <ToggleRow first label="Wi-Fi에 연결됐을 때만" value={auto.wifiOnly} onChange={(v) => save({ wifiOnly: v })} />
            <ToggleRow label="충전 중일 때만" value={auto.chargingOnly} onChange={(v) => save({ chargingOnly: v })} />
          </Card>
          <Note>앱을 열 때와 백그라운드에서 새 사진을 찾아 올려요. 영상은 올리지 않아요.</Note>
        </View>

        {status?.lastRunAt ? (
          <Card padded style={{ gap: 4 }}>
            <T v="label">마지막 확인 {fullDateTime(status.lastRunAt)}</T>
            <T v="caption" muted>
              {status.message ?? `새로 올린 사진 ${status.uploaded}장`}
            </T>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
