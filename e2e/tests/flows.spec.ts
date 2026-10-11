// 데모 모드 웹에서 가족이 실제로 하는 흐름을 처음부터 끝까지 눌러 본다.
// 데모 데이터는 메모리에만 있어 새로고침하면 처음으로 돌아가므로, 로그인 뒤에는 화면 안에서만 이동한다.
import { deflateSync } from 'node:zlib';

import { expect, type Page, test } from '@playwright/test';

/** 콘솔 오류·페이지 오류를 모아 두었다가 테스트 끝에 0개인지 본다 */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function signIn(page: Page) {
  await page.goto('/');
  await expect(page.getByText('지금은 데모 모드예요')).toBeVisible();
  await page.getByRole('button', { name: '카카오로 계속하기' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(visible(page, page.getByText('다가오는 기념일'))).toBeVisible();
}

const visible = (_page: Page, locator: ReturnType<Page['getByText']>) => locator.locator('visible=true').first();
const tab = (page: Page, name: string) => page.locator(`a[role=tab][aria-label="${name}"]`).click();
const button = (page: Page, name: string, exact = false) => visible(page, page.getByRole('button', { name, exact }));

/** 공유 범위 체크박스를 켜진 상태로 맞춘다 (이미 켜져 있으면 그대로 둔다) */
async function ensureChecked(page: Page, name: string) {
  const box = visible(page, page.getByRole('checkbox', { name, exact: true }));
  if ((await box.getAttribute('aria-checked')) !== 'true') await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
}

/** 테스트용 64x64 PNG (세로 줄무늬) */
function samplePng(seed: number): Buffer {
  const w = 64;
  const h = 64;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const on = ((x + seed) >> 3) % 2 === 0;
      raw[o] = on ? 200 : 30;
      raw[o + 1] = (y * 4 + seed * 40) & 255;
      raw[o + 2] = on ? 60 : 220;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let errors: string[] = [];
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, errors.join('\n')).toEqual([]);
});

test('로그인 화면 문구와 데모 로그인', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('약수집, 옥수집, 진주집… 집마다 공간을 만들고 필요한 만큼만 함께 봐요.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Google로 계속하기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '이메일로 계속하기' })).toBeVisible();
  await signIn(page);
  for (const name of ['약수집', '옥수집', '진주집']) await expect(button(page, name, true)).toBeVisible();
});

test('하단 탭을 모두 돌아본다', async ({ page }) => {
  await signIn(page);
  for (const [name, path, text] of [
    ['캘린더', '/calendar', '일정 추가'],
    ['기념일', '/anniversaries', '기념일 추가'],
    ['앨범', '/album', '올리기'],
    ['나', '/me', '로그아웃'],
    ['홈', '/', '다가오는 일정'],
  ] as const) {
    await tab(page, name);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(visible(page, page.getByRole('button', { name: text }).or(page.getByText(text)))).toBeVisible();
  }
});

test('D-Day 기념일을 매년 반복으로 추가한다', async ({ page }) => {
  await signIn(page);
  await tab(page, '기념일');
  await button(page, '기념일 추가').click();
  await expect(page).toHaveURL(/\/item\/new/);
  await page.getByLabel('제목').fill('E2E 결혼기념일');
  await visible(page, page.getByRole('radio', { name: '반복 매년' })).click();
  await ensureChecked(page, '약수집');
  await button(page, '저장', true).click();
  await expect(page).toHaveURL(/\/anniversaries$/);
  await expect(visible(page, page.getByText('E2E 결혼기념일'))).toBeVisible();
});

test('지난 날부터 세는 기념일을 추가한다', async ({ page }) => {
  await signIn(page);
  await tab(page, '기념일');
  await button(page, '기념일 추가').click();
  await page.getByLabel('제목').fill('E2E 처음 만난 날');
  await visible(page, page.getByRole('tab', { name: /지난 날부터 세기/ })).click();
  await button(page, '저장', true).click();
  await expect(page).toHaveURL(/\/anniversaries$/);
  await expect(visible(page, page.getByText('E2E 처음 만난 날'))).toBeVisible();
});

test('캘린더에서 일정을 추가한다', async ({ page }) => {
  await signIn(page);
  await tab(page, '캘린더');
  await button(page, '일정 추가').click();
  await expect(page).toHaveURL(/\/item\/new/);
  await page.getByLabel('제목').fill('E2E 진주집 저녁');
  await ensureChecked(page, '진주집');
  await button(page, '저장', true).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(visible(page, page.getByText('E2E 진주집 저녁'))).toBeVisible();
});

test('새 공간을 만들고 초대 링크를 복사한다', async ({ page }) => {
  await signIn(page);
  await tab(page, '나');
  await visible(page, page.getByText('+ 새 공간 만들기')).click();
  await expect(page).toHaveURL(/\/space\/new/);
  await expect(page.getByPlaceholder('예: 약수집, 옥수집, 진주집')).toBeVisible();
  await page.getByPlaceholder('예: 약수집, 옥수집, 진주집').fill('테스트집');
  await button(page, '공간 만들기', true).click();
  await expect(page).toHaveURL(/\/space\/(?!new)/);
  await expect(button(page, '카카오톡으로 초대 보내기')).toBeVisible();
  await button(page, '초대 링크 복사').click();
  await expect(visible(page, page.getByText('초대 링크를 복사했어요'))).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // 데모는 고정 토큰(demo-invite)을 쓰므로 주소 모양만 본다
  expect(copied).toMatch(/^https:\/\/hanjibung\.pages\.dev\/invite\/[A-Za-z0-9_-]+$/);
});

test('앱 없이 쓰는 가족을 공간에 추가한다', async ({ page }) => {
  await signIn(page);
  await tab(page, '나');
  await visible(page, page.getByRole('button', { name: /^약수집, / })).click();
  await expect(page).toHaveURL(/\/space\/home$/);
  await button(page, '+ 앱 없이 가족 추가하기').click();
  await visible(page, page.getByPlaceholder('예: 외할머니')).fill('E2E 할아버지');
  await button(page, '추가', true).click();
  await expect(visible(page, page.getByText('E2E 할아버지'))).toBeVisible();
});

test('사진을 올린다', async ({ page }) => {
  await signIn(page);
  await tab(page, '앨범');
  await button(page, '사진 올리기', true).click();
  await expect(page).toHaveURL(/\/photo\/upload/);
  const chooser = page.waitForEvent('filechooser');
  await button(page, '사진 고르기').click();
  await (await chooser).setFiles([
    { name: 'e2e-1.png', mimeType: 'image/png', buffer: samplePng(1) },
    { name: 'e2e-2.png', mimeType: 'image/png', buffer: samplePng(5) },
  ]);
  await expect(button(page, '사진 2장 올리기')).toBeVisible();
  await button(page, '사진 2장 올리기').click();
  await expect(visible(page, page.getByText('다 올렸어요'))).toBeVisible({ timeout: 20_000 });
});

test('설정 화면들이 열린다', async ({ page }) => {
  await signIn(page);
  await tab(page, '나');
  await visible(page, page.getByText('Google 캘린더')).click();
  await expect(page).toHaveURL(/\/settings\/google-calendar/);
  await expect(visible(page, page.getByText('앱이 만든 캘린더에만 접근해요').or(page.getByText('연결됨')))).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/me$/);
  await visible(page, page.getByText('계정 삭제', { exact: true })).click();
  await expect(page).toHaveURL(/\/settings\/delete-account/);
  await expect(visible(page, page.getByText('계정을 삭제하면 되돌릴 수 없어요'))).toBeVisible();
});

test('로그아웃하면 로그인 화면으로 간다', async ({ page }) => {
  await signIn(page);
  await tab(page, '나');
  await button(page, '로그아웃', true).click();
  // 확인 창이 위에 뜨므로 마지막(맨 위) 버튼을 누른다
  await page.getByRole('button', { name: '로그아웃', exact: true }).locator('visible=true').last().click();
  await expect(page).toHaveURL(/\/login$/);
});

test('초대 링크를 로그인 전에 열면 초대 화면이 보인다', async ({ page }) => {
  await page.goto('/invite/demo-invite-token-0001');
  await expect(visible(page, page.getByText(/초대했어요|초대 링크가 만료됐어요|찾을 수 없어요/))).toBeVisible();
});
