import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const plum = '#3F2B42';
const overlay = '#4B374E';
const cream = '#F3E8E2';
const gold = '#D8942F';
type MenuTab = 'Home' | 'Items' | 'Add' | 'Requests' | 'Reminders' | 'Space' | 'Profile';
type NavTab = Exclude<MenuTab, 'Add'>;
const entries: { tab: NavTab; icon: keyof typeof Ionicons.glyphMap }[] = [
  { tab: 'Home', icon: 'home-outline' },
  { tab: 'Items', icon: 'cube-outline' },
  { tab: 'Requests', icon: 'chatbox-outline' },
  { tab: 'Space', icon: 'people-outline' },
  { tab: 'Profile', icon: 'person-outline' },
];

export function Flame() {
  return <Svg width={29} height={36} viewBox="0 0 32 40"><Path d="M19 0 C23 8 23 12 24 15 C31 19 33 27 29 33 C26 38 21 40 16 40 C6 40 0 33 1 25 C2 20 5 17 9 15 C10 10 14 5 19 0 Z" fill={cream} /><Path d="M16 18 C19 23 23 27 22 32 C21 36 19 38 16 38 C11 38 9 35 10 31 C11 27 14 22 16 18 Z" fill={gold} stroke={plum} strokeWidth="2" /></Svg>;
}

export function BubbleMenu({ activeTab, onSelect, onOpenChange, home }: { activeTab: MenuTab; onSelect: (tab: MenuTab) => void; onOpenChange?: (open: boolean) => void; home: boolean }) {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(800);
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const reveal = useSharedValue(0);
  const face = useSharedValue(0);
  const diameter = Math.ceil(Math.hypot(width, height) * 2.1);
  const bubbleBottom = 18;
  const centerY = height - bubbleBottom - 34;
  const circle = useAnimatedStyle(() => ({ opacity: reduced ? reveal.get() : 1, transform: [{ scale: reduced ? 1 : interpolate(reveal.get(), [0, 1], [68 / diameter, 1]) }] }));
  const menu = useAnimatedStyle(() => ({ opacity: interpolate(reveal.get(), [0, .35, 1], [0, 0, 1]), transform: [{ translateY: reduced ? 0 : interpolate(reveal.get(), [0, 1], [15, 0]) }] }));
  const logoStyle = useAnimatedStyle(() => ({ opacity: (1 - reveal.get()) * (1 - face.get()), transform: [{ scale: interpolate(face.get(), [0, 1], [1, .86]) }] }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: (1 - reveal.get()) * face.get(), transform: [{ scale: interpolate(face.get(), [0, 1], [.86, 1]) }] }));
  const closeStyle = useAnimatedStyle(() => ({ opacity: reveal.get(), transform: [{ rotate: `${interpolate(reveal.get(), [0, 1], [-45, 0])}deg` }] }));

  useEffect(() => {
    if (open) return;
    if (reduced) { face.set(1); return; }
    face.set(withTiming(0, { duration: 180 }));
    const first = setTimeout(() => face.set(withTiming(1, { duration: 320 })), 2600);
    const cycle = setInterval(() => face.set(withTiming(face.get() > .5 ? 0 : 1, { duration: 320 })), 5200);
    return () => { clearTimeout(first); clearInterval(cycle); };
  }, [open, reduced, face]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
    reveal.set(withTiming(next ? 1 : 0, { duration: reduced ? 160 : next ? 340 : 280, easing: next ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic) }));
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  const select = (tab: MenuTab) => { toggle(); onSelect(tab); };

  return <View pointerEvents="box-none" onLayout={event => setHeight(event.nativeEvent.layout.height)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
    <StatusBar style={open || home ? 'light' : 'auto'} />
    <View pointerEvents={open ? 'auto' : 'none'} aria-hidden={!open} accessibilityElementsHidden={!open} accessibilityViewIsModal={open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' }}>
      <Animated.View style={[{ position: 'absolute', width: diameter, height: diameter, borderRadius: diameter / 2, left: (width - diameter) / 2, top: centerY - diameter / 2, backgroundColor: overlay }, circle]} />
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 32, paddingBottom: 114 }, menu]}>
        <View style={{ width: '100%', maxWidth: 310, borderRadius: 27, backgroundColor: cream, padding: 6 }}>
          {entries.map(({ tab, icon }) => <Pressable key={tab} accessibilityRole="button" accessibilityLabel={tab} accessibilityState={{ selected: activeTab === tab }} onPress={() => select(tab)} style={({ pressed }) => ({ minHeight: 55, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 17, paddingHorizontal: 18, backgroundColor: activeTab === tab ? plum : pressed ? '#E7DAD4' : 'transparent' })}><Ionicons name={icon} size={21} color={activeTab === tab ? cream : plum} /><Text style={{ color: activeTab === tab ? cream : plum, fontSize: 17, fontWeight: '700' }}>{tab}</Text></Pressable>)}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Add item" onPress={() => select('Add')} style={({ pressed }) => ({ marginTop: 11, width: '100%', maxWidth: 310, minHeight: 58, borderRadius: 32, backgroundColor: gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: pressed ? .8 : 1 })}><Ionicons name="add" size={26} color={plum} /><Text style={{ color: plum, fontSize: 18, fontWeight: '700' }}>Add item</Text></Pressable>
      </Animated.View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Close menu' : 'Open menu'} accessibilityState={{ expanded: open }} onPress={toggle} style={{ position: 'absolute', bottom: bubbleBottom, left: '50%', marginLeft: -34, width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: gold, backgroundColor: plum, alignItems: 'center', justifyContent: 'center', shadowColor: '#1C1020', shadowOpacity: .28, shadowRadius: 16, shadowOffset: { width: 0, height: 11 }, elevation: 9 }}>
      <Animated.View style={[{ position: 'absolute' }, logoStyle]}><Flame /></Animated.View>
      <Animated.View style={[{ position: 'absolute', alignItems: 'center' }, labelStyle]}><Text style={{ color: cream, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }}>MENU</Text><View style={{ width: 17, height: 2, backgroundColor: gold, marginTop: 4 }} /></Animated.View>
      <Animated.View style={[{ position: 'absolute' }, closeStyle]}><Ionicons name="close" size={27} color={cream} /></Animated.View>
    </Pressable>
  </View>;
}
