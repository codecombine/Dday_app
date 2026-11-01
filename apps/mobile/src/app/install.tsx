// 앱 설치 안내. 로그인 없이 열리니 가족에게 hanjibung.pages.dev/install 주소만 보내면 된다.
// 안드로이드는 APK 받기와 설치 순서, 아이폰은 홈 화면에 추가하는 방법. 지금 기기에 맞는 안내를 먼저 보여준다.
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button, Card, FieldLabel, Icon, IconButton, Note, Screen, T, TopBar, type IconName } from '@/components/ui';
import { config } from '@/lib/config';
import { downloadApk, fetchLatestRelease, openOutsideKakao, webDevice, type LatestRelease } from '@/lib/install';
import { fonts, radius, useTheme } from '@/theme';

const PAGE_URL = `${config.webOrigin}/install`;

export default function Install() {
  const [latest, setLatest] = useState<LatestRelease | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchLatestRelease().then((r) => alive && setLatest(r));
    return () => {
      alive = false;
    };
  }, []);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const copy = async () => {
    await Clipboard.setStringAsync(PAGE_URL);
    setCopied(true);
  };

  const android = <AndroidGuide key="android" latest={latest} />;
  const iphone = <IphoneGuide key="ios" />;

  return (
    <Screen
      edges={['top', 'bottom']}
      header={<TopBar title="앱 설치 안내" left={<IconButton name="chevron-left" label="뒤로" onPress={back} />} />}
      contentStyle={{ paddingTop: 8, gap: 20 }}>
      <T muted>웹에서도 다 쓸 수 있어요. 안드로이드 폰은 앱을 깔면 알림과 사진 자동 올리기까지 되고, 아이폰은 홈 화면에 추가하면 앱처럼 열려요.</T>

      {webDevice.kakaotalk ? <KakaoNotice /> : null}

      {webDevice.ios ? [iphone, android] : [android, iphone]}

      <View style={{ gap: 8 }}>
        <FieldLabel>가족에게 보내기</FieldLabel>
        <Card padded style={{ gap: 12 }}>
          <T>이 페이지 주소를 카카오톡으로 보내면 각자 폰에 맞는 안내를 볼 수 있어요.</T>
          <T v="bodyStrong">{PAGE_URL.replace('https://', '')}</T>
          <Button label={copied ? '복사했어요' : '주소 복사'} kind="secondary" icon={copied ? 'check' : 'copy'} onPress={() => void copy()} />
        </Card>
      </View>
    </Screen>
  );
}

function AndroidGuide({ latest }: { latest: LatestRelease | null }) {
  const meta = ['안드로이드 8 이상', latest ? `최신 버전 ${latest.version}` : null, latest?.sizeMB ? `${latest.sizeMB}MB` : null].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>안드로이드</FieldLabel>
      <Card padded style={{ gap: 16 }}>
        <View style={{ gap: 10 }}>
          <Perk icon="bell" text="가족이 일정·사진을 올리면 알림" />
          <Perk icon="upload-cloud" text="새로 찍은 사진 자동 올리기" />
          <Perk icon="smartphone" text="폰 사진첩·캘린더 가져오기" />
          <Perk icon="grid" text="홈 화면 D-Day 위젯" />
        </View>
        {webDevice.android ? (
          <View style={{ gap: 8 }}>
            <Button label="앱 받기" icon="download" onPress={downloadApk} />
            <Note>{meta} · 용량이 커서 와이파이에서 받는 걸 권해요</Note>
          </View>
        ) : (
          <Note>{meta}. 안드로이드 폰에서 이 페이지를 열면 받기 버튼이 나와요.</Note>
        )}
      </Card>

      <Card padded style={{ gap: 14 }}>
        <T v="heading">설치 순서</T>
        <Step n={1}>
          <B>앱 받기</B>를 눌러요. 위험할 수 있는 파일이라고 물으면 <B>다운로드</B>를 눌러요.
        </Step>
        <Step n={2}>
          다 받아지면 <B>열기</B>를 눌러요. 놓쳤다면 알림창이나 <B>내 파일 → 다운로드</B>에서 hanjibung.apk를 눌러요.
        </Step>
        <Step n={3}>
          &quot;출처를 알 수 없는 앱&quot; 안내가 나오면 <B>설정</B>에서 <B>이 출처 허용</B>을 켜고 뒤로 가요. 처음 한 번만 하면 돼요.
        </Step>
        <Step n={4}>
          <B>설치</B>를 눌러요. <B>Play 프로텍트</B> 경고가 나오면 <B>세부정보 더보기 → 무시하고 설치</B>를 눌러요. 플레이 스토어에 올리지 않은
          가족용 앱이라 나오는 경고예요.
        </Step>
        <Step n={5}>앱을 열고 웹에서 쓰던 것과 같은 방법(카카오·Google·이메일)으로 로그인해요. 일정과 사진이 그대로 있어요.</Step>
        <Step n={6}>
          알림은 <B>허용</B>을 눌러요. 사진 자동 올리기를 쓰려면 사진 권한은 <B>모두 허용</B>을 골라요.
        </Step>
      </Card>

      <Card padded style={{ gap: 10 }}>
        <T v="heading">설치가 막힐 때</T>
        <T>
          삼성 폰에서 <B>자동 차단</B> 때문에 설치할 수 없다고 나오면 <B>설정 → 보안 및 개인정보 보호 → 자동 차단</B>을 끄고 설치해요. 설치한 뒤
          다시 켜도 돼요.
        </T>
        <T>&quot;앱이 설치되지 않았습니다&quot;가 나오면 폰 저장 공간을 비우고 다시 받아 보세요.</T>
      </Card>

      <Card padded style={{ gap: 10 }}>
        <T v="heading">새 버전으로 바꾸기</T>
        <T>
          같은 방법으로 다시 받아 <B>업데이트</B>를 누르면 돼요. 앱을 지우지 않아도 되고 일정·사진도 그대로예요.
        </T>
        <T>
          앱의 <B>나 → 버전</B>이 {latest ? `${latest.version}보다` : '최신 버전보다'} 낮으면 업데이트할 때예요.
        </T>
      </Card>
    </View>
  );
}

function IphoneGuide() {
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>아이폰</FieldLabel>
      <Card padded style={{ gap: 14 }}>
        <T>아이폰은 따로 깔 앱 없이 웹으로 써요. 홈 화면에 추가하면 앱처럼 바로 열려요.</T>
        <Step n={1}>
          <B>Safari</B>로 {config.webOrigin.replace('https://', '')}를 열어요.
        </Step>
        <Step n={2}>
          주소창 옆 <B>공유</B> 버튼(네모에 위쪽 화살표)을 눌러요. 안 보이면 <B>⋯</B>을 먼저 눌러요.
        </Step>
        <Step n={3}>
          <B>홈 화면에 추가</B>를 누르고 <B>추가</B>를 눌러요.
        </Step>
        <Note>아이폰 웹에서는 알림과 사진 자동 올리기가 안 돼요. 사진은 앨범에서 직접 골라 올려요.</Note>
      </Card>
    </View>
  );
}

/** 카카오톡 안 브라우저에서는 파일 받기·홈 화면 추가가 잘 안 되므로 기본 브라우저로 넘긴다 */
function KakaoNotice() {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.primaryTint, borderRadius: radius.md, padding: 14, gap: 10 }}>
      <T v="label" color={c.primary} style={{ fontFamily: fonts.semibold }}>
        카카오톡 안에서 열었어요
      </T>
      <T v="caption" color={c.ink}>
        카카오톡 안에서는 앱 받기와 홈 화면 추가가 잘 안 돼요. Chrome이나 Safari로 열어 주세요.
      </T>
      <Button label="브라우저로 열기" kind="secondary" icon="external-link" onPress={() => openOutsideKakao(window.location.href)} />
    </View>
  );
}

function Perk({ icon, text }: { icon: IconName; text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name={icon} size={18} color={c.primary} />
      <T style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
        <T v="tiny" color={c.primary} style={{ fontFamily: fonts.bold }}>
          {n}
        </T>
      </View>
      <T style={{ flex: 1 }}>{children}</T>
    </View>
  );
}

function B({ children }: { children: ReactNode }) {
  return <T v="bodyStrong">{children}</T>;
}
