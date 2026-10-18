import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { sizes } from '@demolab/shared';

const MAX = 6;

/** ピンチで拡大縮小・ドラッグで移動・ダブルタップで拡大／元に戻す、ができる写真表示 */
function ZoomableImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      scale.value = Math.min(MAX, Math.max(1, savedScale.value * e.scale));
    },
    onDeactivate: () => {
      'worklet';
      savedScale.value = scale.value;
      if (scale.value <= 1.01) reset();
    },
  });
  const pan = usePanGesture({
    onUpdate: (e) => {
      'worklet';
      if (scale.value <= 1) return;
      x.value = savedX.value + e.translationX;
      y.value = savedY.value + e.translationY;
    },
    onDeactivate: () => {
      'worklet';
      savedX.value = x.value;
      savedY.value = y.value;
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: () => {
      'worklet';
      if (scale.value > 1) reset();
      else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    },
  });
  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));

  const zoomBy = (f: number) => {
    const next = Math.min(MAX, Math.max(1, savedScale.value * f));
    scale.value = withTiming(next);
    savedScale.value = next;
    if (next === 1) reset();
  };

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ flex: 1, overflow: 'hidden' }]} collapsable={false}>
          <Animated.Image source={{ uri }} resizeMode="contain" style={[{ flex: 1 }, style]} accessibilityLabel="領収書の写真" />
        </Animated.View>
      </GestureDetector>
      <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center', padding: 12 }}>
        <ZoomButton label="－" onPress={() => zoomBy(1 / 1.5)} a11y="縮小" />
        <ZoomButton label="元の大きさ" onPress={() => reset()} a11y="元の大きさに戻す" />
        <ZoomButton label="＋" onPress={() => zoomBy(1.5)} a11y="拡大" />
      </View>
    </View>
  );
}

function ZoomButton({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={({ pressed }) => ({ minWidth: 64, minHeight: 52, paddingHorizontal: 14, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: '#fff', fontSize: label.length > 1 ? 16 : 26, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/** タップで全画面ビューアを開くサムネイル */
export function PhotoThumb({ uri, height = 220, children }: { uri: string; height?: number; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="写真を拡大して見る">
        <Image source={{ uri }} resizeMode="contain" style={{ width: '100%', height, backgroundColor: '#0d1726', borderRadius: 12 }} />
        <View style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>🔍 タップで拡大</Text>
        </View>
      </Pressable>
      {children}
      <PhotoViewer uri={uri} visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

export function PhotoViewer({ uri, visible, onClose }: { uri: string; visible: boolean; onClose: () => void }) {
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (visible) setKey((k) => k + 1); // 開くたびに拡大率をリセット
  }, [visible]);
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 44, paddingHorizontal: 12 }}>
          <Text style={{ color: '#ddd', fontSize: sizes.small }}>2本指で拡大・ダブルタップでも拡大</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="閉じる" style={{ minWidth: 72, minHeight: 52, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>閉じる</Text>
          </Pressable>
        </View>
        <ZoomableImage key={key} uri={uri} />
      </GestureHandlerRootView>
    </Modal>
  );
}

