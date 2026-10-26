import { useEffect } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

const background = '#30212E';
const cream = '#F3E8E2';
const gold = '#D8942F';

export function StartupLoader({ onReady }: { onReady: () => void }) {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const glow = useSharedValue(0);
  const ember = useSharedValue(0);
  const logoWidth = Math.min(width - 48, 330);
  const logoHeight = logoWidth * 296 / 628;

  useEffect(() => {
    if (reducedMotion) return;
    glow.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }), -1, true);
    ember.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.cubic) }), -1, true);
    return () => { cancelAnimation(glow); cancelAnimation(ember); };
  }, [reducedMotion, glow, ember]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 1 : 0.94 + glow.value * 0.06,
    transform: [{ scale: reducedMotion ? 1 : 1 + glow.value * 0.018 }],
  }));
  const emberStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 1 : 0.5 + glow.value * 0.5,
    transform: [{ translateX: reducedMotion ? 54 : ember.value * 108 }, { scale: reducedMotion ? 1 : 0.8 + glow.value * 0.35 }],
  }));

  return <Animated.View exiting={FadeOut.duration(reducedMotion ? 100 : 220)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
    <View accessibilityRole="progressbar" accessibilityLabel="Loading Hestia" style={{ alignItems: 'center' }}>
      <Animated.Image
        source={require('../../assets/images/hestia-wordmark-transparent.png')}
        resizeMode="contain"
        onLoadEnd={onReady}
        style={[{ width: logoWidth, height: logoHeight }, logoStyle]}
      />
      <View style={{ marginTop: 24, alignItems: 'center' }}>
        <View style={{ width: 120, height: 20, justifyContent: 'center' }}>
          <View style={{ width: 120, height: 1, backgroundColor: cream, opacity: 0.32 }} />
          <Animated.View style={[{ position: 'absolute', top: 6, left: 0, width: 12, height: 8, borderRadius: 5, backgroundColor: gold }, emberStyle]} />
        </View>
        <Text style={{ color: cream, opacity: 0.78, fontSize: 13, letterSpacing: 1.2, marginTop: 14 }}>Opening Hestia</Text>
      </View>
    </View>
  </Animated.View>;
}
