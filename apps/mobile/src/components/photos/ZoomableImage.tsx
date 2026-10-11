// 확대할 수 있는 사진 (두 손가락으로 벌리기, 두 번 눌러 2.5배, 확대 중에는 끌어서 이동)
// 한 번 누르면 onTap (위·아래 막대 숨기기). 확대 상태가 바뀌면 onZoomChange (넘기기 막기)
import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MAX = 4;

export function ZoomableImage({
  uri,
  width,
  height,
  label,
  onZoomChange,
  onTap,
}: {
  uri: string | undefined;
  width: number;
  height: number;
  label: string;
  onZoomChange?: (zoomed: boolean) => void;
  onTap?: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);

  const report = (z: boolean) => {
    setZoomed(z);
    onZoomChange?.(z);
  };
  const tap = () => onTap?.();

  const clampX = (x: number, s: number) => {
    'worklet';
    const max = ((s - 1) * width) / 2;
    return Math.min(max, Math.max(-max, x));
  };
  const clampY = (y: number, s: number) => {
    'worklet';
    const max = ((s - 1) * height) / 2;
    return Math.min(max, Math.max(-max, y));
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        saved.value = 1;
        sx.value = 0;
        sy.value = 0;
        scheduleOnRN(report, false);
      } else {
        saved.value = scale.value;
        tx.value = clampX(tx.value, scale.value);
        ty.value = clampY(ty.value, scale.value);
        sx.value = tx.value;
        sy.value = ty.value;
        scheduleOnRN(report, true);
      }
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((e) => {
      tx.value = clampX(sx.value + e.translationX, scale.value);
      ty.value = clampY(sy.value + e.translationY, scale.value);
    })
    .onEnd(() => {
      sx.value = tx.value;
      sy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = saved.value > 1 ? 1 : 2.5;
      scale.value = withTiming(next);
      saved.value = next;
      tx.value = withTiming(0);
      ty.value = withTiming(0);
      sx.value = 0;
      sy.value = 0;
      scheduleOnRN(report, next > 1);
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      scheduleOnRN(tap);
    });

  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, overflow: 'hidden' }} accessible accessibilityRole="image" accessibilityLabel={label} accessibilityHint="두 번 누르면 확대돼요">
        <Animated.View style={[{ width, height }, style]}>
          {uri ? <Image source={{ uri }} style={{ width, height }} contentFit="contain" transition={150} accessible={false} /> : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
