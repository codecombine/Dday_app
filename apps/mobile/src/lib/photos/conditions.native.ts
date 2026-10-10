// 자동 올리기·전체 가져오기 조건 확인 (Wi-Fi·충전 중)
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';

/** 조건을 만족하면 null, 아니면 이유 */
export async function unmetCondition(opts: { wifiOnly: boolean; chargingOnly: boolean }): Promise<string | null> {
  if (opts.wifiOnly) {
    try {
      const net = await Network.getNetworkStateAsync();
      if (net.type !== Network.NetworkStateType.WIFI && net.type !== Network.NetworkStateType.ETHERNET) return 'Wi-Fi에 연결되면 이어서 올려요';
    } catch {
      return 'Wi-Fi에 연결되면 이어서 올려요';
    }
  }
  if (opts.chargingOnly) {
    try {
      const s = await Battery.getBatteryStateAsync();
      if (s !== Battery.BatteryState.CHARGING && s !== Battery.BatteryState.FULL) return '충전을 시작하면 이어서 올려요';
    } catch {
      // 배터리 정보를 모르면 막지 않는다
    }
  }
  return null;
}
