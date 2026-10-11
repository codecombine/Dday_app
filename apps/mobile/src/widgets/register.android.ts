// 안드로이드 위젯 처리기와 작은 위젯 설정 화면 등록 (index.ts에서 앱 화면보다 먼저 불린다)
import { registerWidgetConfigurationScreen, registerWidgetTaskHandler } from 'react-native-android-widget';

import { WidgetConfigScreen } from './ConfigScreen';
import { widgetTaskHandler } from './handler';

registerWidgetTaskHandler(widgetTaskHandler);
registerWidgetConfigurationScreen(WidgetConfigScreen);
