import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const NOW = 1_760_000_000_000;

function item(over: Record<string, unknown> = {}) {
  return {
    kind: 'event',
    title: '외가 저녁 모임',
    memo: '',
    spaceIds: ['home', 'mom'],
    ownerUid: 'mother',
    coEdit: false,
    participants: [],
    date: '2026-10-18',
    allDay: false,
    time: '17:00',
    endDate: null,
    endTime: null,
    repeat: 'none',
    lunar: null,
    mode: 'countdown',
    countFromOne: true,
    milestones: false,
    reminders: [],
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'mother',
    ...over,
  };
}

// 엄마: 우리집·외가 관리자 / 아빠: 우리집·외가·시댁 / 외삼촌: 외가만 / 고모: 시댁만
const users = {
  mother: ['personal_mother', 'home', 'mom'],
  father: ['personal_father', 'home', 'mom', 'dad'],
  uncle: ['personal_uncle', 'mom'],
  aunt: ['personal_aunt', 'dad'],
};

const as = (uid: keyof typeof users) => env.authenticatedContext(uid, { spaces: users[uid] }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hanjibung',
    firestore: { rules: readFileSync(resolve(__dirname, '../../../firebase/firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const space = (id: string, admins: string[], members: string[]) =>
      setDoc(doc(db, 'spaces', id), {
        name: id,
        color: '#0B3040',
        kind: 'shared',
        ownerUid: admins[0],
        adminUids: admins,
        memberUids: members,
        rules: { photoDelete: 'owner', onLeave: 'ask', eventEditDefault: 'owner' },
        createdAt: NOW,
      });
    await space('home', ['mother'], ['mother', 'father']);
    await space('mom', ['mother'], ['mother', 'father', 'uncle']);
    await space('dad', ['father'], ['father', 'aunt']);
    await setDoc(doc(db, 'items', 'dinner'), item());
    await setDoc(doc(db, 'items', 'shared'), item({ coEdit: true, title: '시댁 점심', spaceIds: ['dad', 'home'], ownerUid: 'father', updatedBy: 'father' }));
    await setDoc(doc(db, 'users', 'mother'), { displayName: '엄마', spaceIds: users.mother, settings: { theme: 'system' } });
    const photo = (id: string, over: Record<string, unknown>) =>
      setDoc(doc(db, 'photos', id), { ownerUid: 'mother', spaceIds: ['mom'], albumIds: [], status: 'active', createdAt: NOW, ...over });
    await photo('p1', {});
    await photo('p2', { status: 'uploading', spaceIds: [] });
    await setDoc(doc(db, 'dedupeGroups', 'g1'), { spaceId: 'mom', kind: 'copy', photoIds: ['p1'], keepPhotoId: 'p1', status: 'open', updatedAt: NOW });
  });
});

describe('항목', () => {
  it('공유된 공간 구성원만 읽는다', async () => {
    await assertSucceeds(getDoc(doc(as('uncle'), 'items', 'dinner')));
    await assertFails(getDoc(doc(as('aunt'), 'items', 'dinner')));
  });

  it('내 공간 범위로 목록 조회', async () => {
    const q = query(collection(as('uncle'), 'items'), where('spaceIds', 'array-contains-any', users.uncle));
    await assertSucceeds(getDocs(q));
    const bad = query(collection(as('uncle'), 'items'), where('spaceIds', 'array-contains-any', ['dad']));
    await assertFails(getDocs(bad));
  });

  it('내가 속하지 않은 공간에는 공유할 수 없다', async () => {
    await assertSucceeds(setDoc(doc(as('uncle'), 'items', 'n1'), item({ ownerUid: 'uncle', updatedBy: 'uncle', spaceIds: ['mom'] })));
    await assertFails(setDoc(doc(as('uncle'), 'items', 'n2'), item({ ownerUid: 'uncle', updatedBy: 'uncle', spaceIds: ['dad'] })));
    await assertFails(setDoc(doc(as('uncle'), 'items', 'n3'), item({ ownerUid: 'mother', updatedBy: 'uncle', spaceIds: ['mom'] })));
  });

  it('만든 사람만 수정·삭제 (공동 편집이 꺼져 있을 때)', async () => {
    await assertFails(updateDoc(doc(as('uncle'), 'items', 'dinner'), { title: '바꿈', updatedAt: NOW + 1, updatedBy: 'uncle' }));
    await assertSucceeds(updateDoc(doc(as('mother'), 'items', 'dinner'), { title: '바꿈', updatedAt: NOW + 1, updatedBy: 'mother' }));
    await assertFails(deleteDoc(doc(as('father'), 'items', 'dinner')));
    await assertSucceeds(deleteDoc(doc(as('mother'), 'items', 'dinner')));
  });

  it('공동 편집: 내용은 고칠 수 있지만 공유 범위는 못 바꾼다', async () => {
    await assertSucceeds(updateDoc(doc(as('aunt'), 'items', 'shared'), { title: '시댁 점심 (변경)', updatedAt: NOW + 1, updatedBy: 'aunt' }));
    await assertFails(updateDoc(doc(as('aunt'), 'items', 'shared'), { spaceIds: ['dad'], updatedAt: NOW + 1, updatedBy: 'aunt' }));
    await assertFails(updateDoc(doc(as('aunt'), 'items', 'shared'), { ownerUid: 'aunt', updatedAt: NOW + 1, updatedBy: 'aunt' }));
  });

  it('공간 관리자는 자기 공간에서 빼기만 할 수 있다', async () => {
    // 엄마는 우리집 관리자 → '시댁 점심'에서 우리집을 뺄 수 있다
    await assertSucceeds(updateDoc(doc(as('mother'), 'items', 'shared'), { spaceIds: ['dad'], updatedAt: NOW + 1, updatedBy: 'mother' }));
  });

  it('관리자가 아니면 공간을 뺄 수 없다', async () => {
    await assertFails(updateDoc(doc(as('uncle'), 'items', 'dinner'), { spaceIds: ['home'], updatedAt: NOW + 1, updatedBy: 'uncle' }));
  });
});

describe('사진', () => {
  it('공유된 활성 사진만 읽고, 올리는 중인 사진은 주인만 본다', async () => {
    await assertSucceeds(getDoc(doc(as('uncle'), 'photos', 'p1')));
    await assertFails(getDoc(doc(as('aunt'), 'photos', 'p1')));
    await assertFails(getDoc(doc(as('uncle'), 'photos', 'p2')));
    await assertSucceeds(getDoc(doc(as('mother'), 'photos', 'p2')));
  });

  it('앱은 사진 문서를 직접 쓸 수 없다', async () => {
    await assertFails(updateDoc(doc(as('mother'), 'photos', 'p1'), { spaceIds: ['mom', 'home'] }));
    await assertFails(setDoc(doc(as('mother'), 'photos', 'p9'), { ownerUid: 'mother', spaceIds: ['mom'], status: 'active' }));
  });
});

describe('사용자·공간', () => {
  it('설정은 바꿀 수 있지만 공간 목록은 못 바꾼다', async () => {
    await assertSucceeds(updateDoc(doc(as('mother'), 'users', 'mother'), { settings: { theme: 'dark' } }));
    await assertFails(updateDoc(doc(as('mother'), 'users', 'mother'), { spaceIds: [...users.mother, 'dad'] }));
    await assertFails(getDoc(doc(as('father'), 'users', 'mother')));
  });

  it('관리자는 공간 규칙을 바꾸고 프로필 구성원을 추가한다', async () => {
    await assertSucceeds(
      updateDoc(doc(as('mother'), 'spaces', 'mom'), {
        rules: { photoDelete: 'ownerOrAdmin', onLeave: 'keep', eventEditDefault: 'all' },
      }),
    );
    await assertFails(updateDoc(doc(as('uncle'), 'spaces', 'mom'), { name: '외갓집' }));
    await assertFails(updateDoc(doc(as('mother'), 'spaces', 'mom'), { memberUids: ['mother'] }));
    const grandma = { spaceId: 'mom', displayName: '외할머니', role: 'member', uid: null, managedByUid: 'mother', joinedAt: NOW };
    await assertSucceeds(setDoc(doc(as('mother'), 'spaces', 'mom', 'members', 'grandma'), grandma));
    await assertFails(setDoc(doc(as('uncle'), 'spaces', 'mom', 'members', 'grandpa'), { ...grandma, displayName: '외할아버지' }));
    await assertFails(setDoc(doc(as('mother'), 'spaces', 'mom', 'members', 'x'), { ...grandma, uid: 'aunt' }));
  });

  it('중복 정리 묶음은 그 공간 관리자만 본다', async () => {
    await assertSucceeds(getDoc(doc(as('mother'), 'dedupeGroups', 'g1')));
    await assertFails(getDoc(doc(as('uncle'), 'dedupeGroups', 'g1')));
    await assertSucceeds(getDocs(query(collection(as('mother'), 'dedupeGroups'), where('spaceId', '==', 'mom'))));
  });
});
