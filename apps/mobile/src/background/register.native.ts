// 백그라운드 작업 정의 (앱 화면보다 먼저 불러온다: index.ts)
// - 사진 자동 올리기: expo-background-task가 주기적으로 깨운다 (등록·해제는 자동 올리기 설정에서)
// - 무음 푸시: 앱이 꺼져 있어도 {type:'items-changed'} 등을 받아 처리한다
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { getBackend } from '@/lib/backend';
import { AUTO_UPLOAD_TASK, runAutoUploadHeadless } from '@/lib/photos/auto-upload';
import { handleBackgroundPush, PUSH_TASK } from '@/lib/push';

TaskManager.defineTask(AUTO_UPLOAD_TASK, async () => {
  try {
    await runAutoUploadHeadless(getBackend());
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn('[auto-upload] 백그라운드 실행 실패', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

TaskManager.defineTask(PUSH_TASK, async ({ data, error }) => {
  if (error) return;
  try {
    await handleBackgroundPush(data);
  } catch (e) {
    console.warn('[push] 백그라운드 처리 실패', e);
  }
});

Notifications.registerTaskAsync(PUSH_TASK).catch(() => {
  // 개발 빌드가 아니거나 FCM 설정이 없으면 등록되지 않는다
});
