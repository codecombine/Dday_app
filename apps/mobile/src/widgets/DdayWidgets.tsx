// 안드로이드 위젯 화면 (react-native-android-widget). 누르면 hanjibung://item/<id> 로 상세 화면을 연다.
import { FlexWidget, TextWidget, type ColorProp, type WidgetInfo, type WidgetRepresentation } from 'react-native-android-widget';

import { dark, light, type Palette } from '@/theme/colors';

import type { WidgetRow } from './cache';

const hex = (s: string) => s as ColorProp;
const itemUri = (id: string) => ({ uri: `hanjibung://item/${id}` });

function SmallView({ row, p, scheme }: { row: WidgetRow | null; p: Palette; scheme: 'light' | 'dark' }) {
  const bg = scheme === 'dark' ? p.primaryTint : p.primary;
  if (!row) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{ height: 'match_parent', width: 'match_parent', backgroundColor: hex(bg), borderRadius: 22, padding: 14, justifyContent: 'center' }}>
        <TextWidget text="한지붕" style={{ fontSize: 12, color: hex(p.primaryCardMuted) }} />
        <TextWidget text="기념일을 추가해 보세요" maxLines={2} style={{ fontSize: 14, color: hex(p.primaryCardText), fontWeight: '600' }} />
      </FlexWidget>
    );
  }
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={itemUri(row.id)}
      accessibilityLabel={`${row.title} ${row.headline}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: hex(bg),
        borderRadius: 22,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
      <TextWidget text={row.title} maxLines={2} truncate="END" style={{ fontSize: 13, color: hex(p.primaryCardMuted), fontWeight: '500' }} />
      <TextWidget text={row.headline} maxLines={1} style={{ adjustsFontSizeToFit: true, fontSize: 30, color: hex(p.primaryCardText), fontWeight: '700' }} />
      <TextWidget text={row.sub} maxLines={1} truncate="END" style={{ fontSize: 11, color: hex(p.primaryCardMuted) }} />
    </FlexWidget>
  );
}

function ListView({ rows, p, maxRows }: { rows: WidgetRow[]; p: Palette; maxRows: number }) {
  const shown = rows.slice(0, maxRows);
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: hex(p.surface),
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'column',
      }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 4 }}>
        <TextWidget text="한지붕" style={{ fontSize: 12, color: hex(p.primary), fontWeight: '600' }} />
        <TextWidget text="다가오는 날" style={{ fontSize: 12, color: hex(p.muted) }} />
      </FlexWidget>
      {shown.length === 0 ? (
        <TextWidget text="기념일을 추가하면 여기에 보여요" style={{ fontSize: 14, color: hex(p.muted), paddingTop: 8 }} />
      ) : (
        shown.map((r, i) => (
          <FlexWidget
            key={r.id}
            clickAction="OPEN_URI"
            clickActionData={itemUri(r.id)}
            accessibilityLabel={`${r.title} ${r.headline}`}
            style={{
              width: 'match_parent',
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: hex(p.line),
            }}>
            <FlexWidget style={{ flex: 1, flexDirection: 'column', paddingRight: 8 }}>
              <TextWidget text={r.title} maxLines={1} truncate="END" style={{ fontSize: 14, color: hex(p.ink), fontWeight: '600' }} />
              <TextWidget text={r.sub} maxLines={1} truncate="END" style={{ fontSize: 11, color: hex(p.muted) }} />
            </FlexWidget>
            <TextWidget text={r.headline} maxLines={1} style={{ fontSize: 18, color: hex(p.primary), fontWeight: '700' }} />
          </FlexWidget>
        ))
      )}
    </FlexWidget>
  );
}

export function renderSmall(row: WidgetRow | null): WidgetRepresentation {
  return { light: <SmallView row={row} p={light} scheme="light" />, dark: <SmallView row={row} p={dark} scheme="dark" /> };
}

export function renderList(rows: WidgetRow[], info: Pick<WidgetInfo, 'height'>): WidgetRepresentation {
  // 높이에 맞춰 줄 수를 정한다 (머리줄 약 28dp, 한 줄 약 40dp)
  const maxRows = Math.max(1, Math.min(4, Math.floor((info.height - 36) / 40)));
  return { light: <ListView rows={rows} p={light} maxRows={maxRows} />, dark: <ListView rows={rows} p={dark} maxRows={maxRows} /> };
}
