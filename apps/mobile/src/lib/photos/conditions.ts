// 웹은 Wi-Fi·충전 상태를 확인하지 않는다. 네이티브 구현은 conditions.native.ts
export async function unmetCondition(_opts: { wifiOnly: boolean; chargingOnly: boolean }): Promise<string | null> {
  return null;
}
