// 앱(안드로이드): 글꼴 파일을 앱에 넣어 쓴다
import {
  IBMPlexSansKR_400Regular,
  IBMPlexSansKR_500Medium,
  IBMPlexSansKR_600SemiBold,
  IBMPlexSansKR_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-kr';

export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    IBMPlexSansKR_400Regular,
    IBMPlexSansKR_500Medium,
    IBMPlexSansKR_600SemiBold,
    IBMPlexSansKR_700Bold,
  });
  return loaded;
}
