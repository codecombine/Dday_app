// 공간 관리 (시안 '공간'): 가족 초대 · 구성원(계정·프로필) · 이름과 색 · 공간 규칙 · 나가기
import { isAdmin, type LeaveSpaceRequest, type Member, type SetRoleRequest, type SpaceRules } from '@hanjibung/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useDialog } from '@/components/photos/Sheet';
import { copyInvite, createInvite, inviteText, sendInvite } from '@/components/spaces/invite';
import { ColorPicker, RulesEditor } from '@/components/spaces/SpaceForm';
import { Avatar, Button, Card, Empty, Field, FieldLabel, IconButton, Loading, Note, Screen, T, TextButton } from '@/components/ui';
import { personName, subject } from '@/lib/photos/format';
import { errorText } from '@/lib/photos/upload';
import { usePhotos } from '@/lib/photos/use-photos';
import { useSession } from '@/lib/session';
import { myName } from '@/lib/spaces';
import { fonts, radius, space, useTheme } from '@/theme';

export default function SpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const session = useSession();
  const { backend, spaceById, members, uid, me, items, refreshMembership } = session;
  const dialog = useDialog();
  const sp = spaceById[id];
  const [waited, setWaited] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inviting, setInviting] = useState<'share' | 'copy' | null>(null);
  const [name, setName] = useState(sp?.name ?? '');
  const [color, setColor] = useState(sp?.color ?? '');
  const [savingName, setSavingName] = useState(false);
  const { photos } = usePhotos();

  // 방금 만든 공간은 목록에 늦게 들어올 수 있다
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 5000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (sp) {
      setName(sp.name);
      setColor(sp.color);
    }
  }, [sp?.name, sp?.color]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));
  const flash = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage((x) => (x === m ? null : x)), 3000);
  };

  if (!sp) {
    if (!waited) return <Loading />;
    return (
      <Screen header={<IconButton name="chevron-left" label="뒤로" onPress={back} />}>
        <Empty text="공간을 찾을 수 없어요. 나갔거나 삭제된 공간이에요." />
      </Screen>
    );
  }

  const admin = isAdmin(sp, uid);
  const meName = myName(members, uid, me?.displayName ?? '나');
  const spaceMembers = members
    .filter((m) => m.spaceId === sp.id)
    .sort((a, b) => {
      const rank = (m: Member) => (m.uid ? (m.role === 'admin' ? 0 : 1) : 2);
      return rank(a) - rank(b) || a.joinedAt - b.joinedAt;
    });
  const accountMembers = spaceMembers.filter((m) => m.uid);
  const header = (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, gap: 4 }}>
      <IconButton name="chevron-left" label="뒤로" onPress={back} />
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: sp.color }} />
      <T v="heading" style={{ fontSize: 18, fontFamily: fonts.bold, marginLeft: 4, flexShrink: 1 }} numberOfLines={1}>
        {sp.kind === 'personal' ? '나만' : sp.name}
      </T>
      <T v="caption" muted style={{ marginLeft: 6 }}>
        {sp.kind === 'personal' ? '개인 공간' : `구성원 ${spaceMembers.length}명`}
      </T>
    </View>
  );

  // ── 개인 공간: 초대·나가기 없음 ──
  if (sp.kind === 'personal') {
    const myPhotos = photos.filter((p) => p.spaceIds.includes(sp.id)).length;
    const myItems = items.filter((i) => i.spaceIds.includes(sp.id)).length;
    return (
      <Screen edges={['top', 'bottom']} header={header} contentStyle={{ paddingTop: 8 }}>
        <Card padded style={{ gap: 8 }}>
          <T v="bodyStrong">나만 볼 수 있는 개인 공간이에요</T>
          <T v="caption" muted>
            일정이나 사진을 올릴 때 &apos;나만 보기&apos;를 고르면 여기에 들어가요. 다른 사람을 초대하거나 나갈 수 없어요.
          </T>
          <T v="caption" color={c.inkSoft}>
            일정·기념일 {myItems}개 · 사진 {myPhotos}장
          </T>
        </Card>
      </Screen>
    );
  }

  // ── 초대 ──
  const doInvite = async (mode: 'share' | 'copy', target?: Member) => {
    setInviting(mode);
    try {
      const inv = await createInvite(backend, sp.id, target?.id);
      if (mode === 'copy') {
        await copyInvite(inv.url);
        flash('초대 링크를 복사했어요');
      } else {
        const r = await sendInvite(inviteText(sp.name, inv.url, target?.displayName), inv.url);
        if (r === 'copied') flash('초대 문구를 복사했어요. 카카오톡 대화창에 붙여넣어 보내세요.');
      }
    } catch (e) {
      flash(errorText(e));
    } finally {
      setInviting(null);
    }
  };

  // ── 구성원 관리 (관리자) ──
  const addProfile = async () => {
    const n = await dialog.prompt({ title: '앱 없이 가족 추가하기', message: '앱을 쓰지 않는 가족도 이름을 등록하면 일정에 표시할 수 있어요.', placeholder: '예: 외할머니', maxLength: 20, confirmLabel: '추가' });
    if (!n) return;
    try {
      await backend.addProfileMember(sp.id, n, uid);
    } catch (e) {
      flash(errorText(e));
    }
  };

  const memberActions = async (m: Member) => {
    if (!admin || m.uid === uid) return;
    if (!m.uid) {
      const v = await dialog.ask<'rename' | 'invite' | 'delete'>({
        title: m.displayName,
        message: '앱을 쓰지 않는 가족이에요. 초대 링크로 가입하면 이 프로필과 그대로 이어져요.',
        options: [
          { label: '초대 링크 보내기', value: 'invite', kind: 'primary' },
          { label: '이름 바꾸기', value: 'rename' },
          { label: '삭제', value: 'delete', kind: 'danger' },
        ],
      });
      if (v === 'invite') await doInvite('share', m);
      if (v === 'rename') {
        const n = await dialog.prompt({ title: '이름 바꾸기', initial: m.displayName, maxLength: 20, confirmLabel: '저장' });
        if (n) await backend.renameProfileMember(sp.id, m.id, n).catch((e) => flash(errorText(e)));
      }
      if (v === 'delete') {
        const ok = await dialog.ask({
          title: `${m.displayName}님을 삭제할까요?`,
          message: '일정의 참석자 표시에서도 빠져요.',
          options: [
            { label: '삭제', value: true, kind: 'danger' },
            { label: '취소', value: false, kind: 'ghost' },
          ],
        });
        if (ok) await backend.deleteProfileMember(sp.id, m.id).catch((e) => flash(errorText(e)));
      }
      return;
    }
    const isMemberAdmin = m.role === 'admin' || sp.adminUids.includes(m.uid);
    const v = await dialog.ask<'role' | 'remove'>({
      title: m.displayName,
      options: [
        { label: isMemberAdmin ? '관리자 해제' : '관리자로 지정', value: 'role', kind: 'secondary' },
        { label: '공간에서 내보내기', value: 'remove', kind: 'danger' },
      ],
    });
    try {
      if (v === 'role') {
        await backend.api('POST', `/spaces/${sp.id}/members/${m.id}/role`, { role: isMemberAdmin ? 'member' : 'admin' } satisfies SetRoleRequest);
        flash(isMemberAdmin ? `${m.displayName}님을 관리자에서 해제했어요` : `${m.displayName}님을 관리자로 지정했어요`);
      }
      if (v === 'remove') {
        const rule =
          sp.rules.onLeave === 'keep' ? '올린 사진은 공간에 남고 관리자에게 넘어가요.' : sp.rules.onLeave === 'remove' ? '올린 사진도 이 공간에서 빠져요.' : '올린 사진은 공간에 남아요.';
        const ok = await dialog.ask({
          title: `${m.displayName}님을 내보낼까요?`,
          message: `이 공간에 공유한 일정이 빠지고 ${rule}`,
          options: [
            { label: '내보내기', value: true, kind: 'danger' },
            { label: '취소', value: false, kind: 'ghost' },
          ],
        });
        if (ok) await backend.api('DELETE', `/spaces/${sp.id}/members/${m.id}`);
      }
    } catch (e) {
      flash(errorText(e));
    }
  };

  // ── 이름·색·규칙 ──
  const nameChanged = name.trim() !== sp.name || color !== sp.color;
  const saveName = async () => {
    if (!name.trim() || name.trim().length > 20) return;
    setSavingName(true);
    try {
      await backend.updateSpace(sp.id, { name: name.trim(), color });
      flash('저장했어요');
    } catch (e) {
      flash(errorText(e));
    } finally {
      setSavingName(false);
    }
  };
  const saveRules = async (rules: SpaceRules) => {
    try {
      await backend.updateSpace(sp.id, { rules });
    } catch (e) {
      flash(errorText(e));
    }
  };

  // ── 나가기 ──
  const leave = async () => {
    const otherAccounts = accountMembers.filter((m) => m.uid !== uid);
    const otherAdmins = sp.adminUids.filter((a) => a !== uid);
    if (admin && otherAdmins.length === 0 && otherAccounts.length > 0) {
      await dialog.ask({
        title: '다른 관리자를 먼저 지정해 주세요',
        message: '마지막 관리자는 나갈 수 없어요. 구성원을 눌러 관리자로 지정한 뒤 나가세요.',
        options: [{ label: '확인', value: true, kind: 'primary' }],
      });
      return;
    }
    const alone = otherAccounts.length === 0;
    let photoChoice: LeaveSpaceRequest['photoChoice'];
    if (!alone && sp.rules.onLeave === 'ask') {
      const v = await dialog.ask<'keep' | 'remove'>({
        title: `${sp.name}에서 나갈까요?`,
        message: '내가 올린 사진은 어떻게 할까요? 이 공간에 공유한 내 일정은 빠지고, 다른 공간에도 공유된 항목은 그대로 남아요.',
        options: [
          { label: '사진은 공간에 남기기', value: 'keep', kind: 'secondary' },
          { label: '사진도 함께 지우기', value: 'remove', kind: 'danger' },
        ],
      });
      if (!v) return;
      photoChoice = v;
    } else {
      const rule = sp.rules.onLeave === 'keep' ? '내가 올린 사진은 공간에 남고 관리자에게 넘어가요.' : sp.rules.onLeave === 'remove' ? '내가 올린 사진도 이 공간에서 빠져요.' : '';
      const ok = await dialog.ask({
        title: `${sp.name}에서 나갈까요?`,
        message: alone ? '혼자 남은 공간이라 나가면 공간이 삭제돼요.' : `이 공간에 공유한 내 일정은 빠지고, 다른 공간에도 공유된 항목은 그대로 남아요. ${rule}`,
        options: [
          { label: alone ? '나가고 공간 삭제' : '나가기', value: true, kind: 'danger' },
          { label: '취소', value: false, kind: 'ghost' },
        ],
      });
      if (!ok) return;
    }
    try {
      await backend.api('POST', `/spaces/${sp.id}/leave`, (photoChoice ? { photoChoice } : {}) satisfies LeaveSpaceRequest);
      await refreshMembership();
      router.replace('/');
    } catch (e) {
      flash(errorText(e));
    }
  };

  return (
    <Screen edges={['top', 'bottom']} header={header} contentStyle={{ paddingTop: 8, gap: 20 }}>
      {message ? (
        <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.primaryTint, borderRadius: radius.md, padding: 12 }}>
          <T v="label" color={c.primary} style={{ fontSize: 13 }}>
            {message}
          </T>
        </View>
      ) : null}

      {admin ? (
        <Card padded style={{ gap: 10 }}>
          <T v="bodyStrong">가족 초대</T>
          <Button label="카카오톡으로 초대 보내기" kind="kakao" icon="message-circle" onPress={() => doInvite('share')} loading={inviting === 'share'} />
          <Button label="초대 링크 복사" kind="secondary" onPress={() => doInvite('copy')} loading={inviting === 'copy'} style={{ minHeight: 44 }} />
          <Note>링크를 누르면 가입과 동시에 이 공간에 들어와요. 링크는 7일 동안 유효합니다.</Note>
        </Card>
      ) : (
        <Note>가족 초대와 구성원 관리는 관리자만 할 수 있어요.</Note>
      )}

      <View style={{ gap: 8 }}>
        <FieldLabel>구성원</FieldLabel>
        <Card>
          {spaceMembers.map((m, i) => (
            <MemberRow
              key={m.id}
              member={m}
              first={i === 0}
              isAdminMember={!!m.uid && (m.role === 'admin' || sp.adminUids.includes(m.uid))}
              me={m.uid === uid}
              color={sp.color}
              managerName={m.managedByUid ? personName(members, m.managedByUid, uid, meName) : null}
              canManage={admin && m.uid !== uid}
              onPress={() => memberActions(m)}
              onInvite={admin && !m.uid ? () => doInvite('share', m) : undefined}
            />
          ))}
          {admin ? (
            <Pressable
              accessibilityRole="button"
              onPress={addProfile}
              style={({ pressed }) => ({ minHeight: 52, borderTopWidth: 1, borderTopColor: c.line, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <T v="label" color={c.primary} style={{ fontFamily: fonts.semibold }}>
                + 앱 없이 가족 추가하기
              </T>
            </Pressable>
          ) : null}
        </Card>
        <Note>앱을 쓰지 않는 가족도 이름을 등록하면 일정과 사진에 표시할 수 있어요. 나중에 초대하면 그대로 이어집니다.</Note>
      </View>

      {admin ? (
        <View style={{ gap: 8 }}>
          <FieldLabel>이름과 색</FieldLabel>
          <Card padded style={{ gap: 12 }}>
            <Field value={name} onChangeText={setName} maxLength={20} accessibilityLabel="공간 이름" />
            <ColorPicker value={color} onChange={setColor} />
            {nameChanged ? <Button label="저장" onPress={saveName} loading={savingName} disabled={!name.trim()} /> : null}
          </Card>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <FieldLabel>공간 규칙 · 관리자만 바꿀 수 있어요</FieldLabel>
        <RulesEditor rules={sp.rules} onChange={saveRules} disabled={!admin} />
      </View>

      <TextButton label="이 공간에서 나가기" danger onPress={leave} />
      {dialog.element}
    </Screen>
  );
}

function MemberRow({
  member,
  first,
  isAdminMember,
  me,
  color,
  managerName,
  canManage,
  onPress,
  onInvite,
}: {
  member: Member;
  first: boolean;
  isAdminMember: boolean;
  me: boolean;
  color: string;
  managerName: string | null;
  canManage: boolean;
  onPress: () => void;
  onInvite?: () => void;
}) {
  const { c } = useTheme();
  const status = member.uid ? `앱 사용 중${me ? ' · 나' : ''}` : `앱 없음${managerName ? ` · ${subject(managerName)} 대신 관리` : ''}`;
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64, borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}>
      <Avatar label={member.displayName} color={color} ghost={!member.uid} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" style={{ fontSize: 15 }}>
          {member.displayName}
        </T>
        <T v="caption" muted style={{ fontSize: 12 }}>
          {status}
        </T>
      </View>
      {onInvite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${member.displayName}님 초대`}
          onPress={onInvite}
          hitSlop={4}
          style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <T v="caption" color={c.primary} style={{ fontFamily: fonts.medium }}>
            초대
          </T>
        </Pressable>
      ) : null}
      {isAdminMember ? (
        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: c.primaryTint }}>
          <T v="tiny" color={c.primary}>
            관리자
          </T>
        </View>
      ) : null}
    </View>
  );
  if (!canManage) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${member.displayName}, ${status}${isAdminMember ? ', 관리자' : ''}. 관리하기`} onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {body}
    </Pressable>
  );
}
