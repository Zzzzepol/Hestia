import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import type { Item } from '@/types';
import { colors, type Scheme } from '@/theme/colors';

export const core = { plum: '#3F2B42', cream: '#F3E8E2', gold: '#D8942F' };

// Each core screen follows the next portion of the wave in the reference.
// Matching edge heights keep the cream/plum boundary connected across screens.
const wavePath = {
  space: 'M0 174 C55 157 104 150 145 161 C193 175 219 199 274 200 C324 200 360 182 390 174 L390 210 H0 Z',
  items: 'M0 174 C54 194 105 202 160 195 C222 186 264 159 320 158 C353 157 376 164 390 174 L390 210 H0 Z',
  add: 'M0 174 C75 174 137 183 193 198 C245 211 288 196 332 180 C353 173 374 177 390 182 L390 210 H0 Z',
  detail: 'M0 182 C57 182 116 166 178 164 C248 160 311 180 390 182 L390 210 H0 Z',
  requests: 'M0 182 C64 201 115 199 179 183 C249 165 308 153 350 160 C369 164 381 170 390 174 L390 210 H0 Z',
  profile: 'M0 181 C67 205 128 210 194 192 C266 166 312 150 390 196 L390 210 H0 Z',
  'my-requests': 'M0 174 C61 202 110 206 164 190 C223 171 278 151 333 156 C360 158 379 169 390 174 L390 210 H0 Z',
  consumable: 'M0 174 C58 174 96 157 155 153 C211 150 246 168 294 177 C339 187 367 181 390 170 L390 210 H0 Z',
  reminders: 'M0 174 C70 197 127 202 184 183 C246 163 295 156 347 160 C368 164 381 171 390 176 L390 210 H0 Z',
  'new-space': 'M0 174 C55 157 104 150 145 161 C193 175 219 199 274 200 C324 200 360 182 390 174 L390 210 H0 Z',
  'join-space': 'M0 174 C54 194 105 202 160 195 C222 186 264 159 320 158 C353 157 376 164 390 174 L390 210 H0 Z',
} as const;

type CoreVariant = 'space' | 'items' | 'add' | 'detail' | 'requests' | 'profile' | 'my-requests' | 'consumable' | 'reminders' | 'new-space' | 'join-space';

export function CoreHeader({ title, onBack, scheme, variant = 'items' }: { title: string; onBack: () => void; scheme: Scheme; variant?: CoreVariant }) {
  const insets = useSafeAreaInsets();
  const height = insets.top + 146;
  return <View style={{ height, backgroundColor: core.plum }}>
    <Svg width="100%" height={height} viewBox="0 0 390 210" preserveAspectRatio="none" style={{ position: 'absolute' }}>
      <Rect width="390" height="210" fill={core.plum} />
      <Circle cx={variant === 'items' ? 380 : 24} cy="25" r={variant === 'items' ? 76 : 87} fill="#59435D" />
      <Ellipse cx="72" cy="45" rx="20" ry="16" fill="#302036" />
      {variant === 'space' && <><Path d="M240 193 V88 a26 26 0 0 1 52 0 V193 M296 193 V88 a26 26 0 0 1 52 0 V193 M352 193 V88 a26 26 0 0 1 52 0 V193" fill="none" stroke={core.gold} strokeWidth="2" /></>}
      {variant === 'items' && <><Rect x="230" y="72" width="27" height="36" rx="7" fill="#624A64" /><Rect x="263" y="62" width="25" height="46" rx="7" fill="#735B70" /><Rect x="294" y="77" width="26" height="31" rx="7" fill="#624A64" /><Rect x="327" y="69" width="26" height="39" rx="7" fill="#735B70" /><Path d="M215 109 H390" stroke={core.gold} strokeWidth="2" /></>}
      {variant === 'add' && <><Circle cx="354" cy="168" r="63" fill="none" stroke={core.gold} strokeWidth="1.5" strokeDasharray="2 9" /><Path d="M354 53 V97 M316 64 L333 105 M284 88 L318 120 M390 69 L374 107" stroke={core.gold} strokeWidth="1.5" /></>}
      {variant === 'detail' && <><Path d="M276 164 Q326 110 390 72" fill="none" stroke={core.gold} strokeWidth="2" strokeDasharray="2 8" /><Circle cx="292" cy="150" r="9" fill={core.gold} stroke={core.cream} strokeWidth="2" /><Circle cx="342" cy="112" r="5" fill="none" stroke={core.cream} strokeWidth="1.5" /></>}
      {variant === 'requests' && <><Circle cx="318" cy="120" r="32" fill="none" stroke={core.gold} strokeWidth="1.5" /><Circle cx="350" cy="120" r="32" fill="none" stroke={core.gold} strokeWidth="1.5" /><Path d="M100 47 h245" stroke={core.gold} strokeWidth="2" strokeDasharray="8 5" /></>}
      {variant === 'my-requests' && <><Circle cx="324" cy="104" r="24" fill="none" stroke={core.gold} strokeWidth="1.5" /><Path d="M324 58 V71 M324 137 V150 M278 104 H291 M357 104 H370 M292 72 L302 82 M346 126 L356 136 M292 136 L302 126 M346 82 L356 72" stroke={core.gold} strokeWidth="1.5" /></>}
      {variant === 'consumable' && <><Path d="M320 79 C313 90 306 99 306 109 C306 119 312 124 320 124 C328 124 334 119 334 109 C334 99 327 90 320 79 Z M360 66 C355 74 351 81 351 87 C351 94 355 98 360 98 C365 98 369 94 369 87 C369 81 365 74 360 66 Z M370 129 C366 135 364 139 364 144 C364 149 367 152 371 152 C375 152 378 149 378 144 C378 139 375 135 370 129 Z" fill="none" stroke={core.gold} strokeWidth="2" /></>}
      {variant === 'reminders' && <><Path d="M305 102 C305 85 313 76 324 76 C335 76 343 85 343 102 V114 L350 122 H298 L305 114 Z M317 128 C319 134 329 134 331 128" fill="none" stroke={core.gold} strokeWidth="2" /><Path d="M292 73 L283 63 M355 73 L364 63" stroke={core.gold} strokeWidth="1.5" /></>}
      {variant === 'profile' && <><Circle cx="334" cy="112" r="37" fill="#302036" /><Circle cx="334" cy="112" r="46" fill="none" stroke={core.gold} strokeWidth="7" strokeDasharray="15 8" strokeLinecap="round" /><Path d="M339 83 C345 98 346 100 350 108 C359 121 351 135 335 136 C320 136 313 122 320 110 C325 101 333 93 339 83 Z" fill={core.cream} /><Path d="M336 110 C341 116 344 121 341 128 C339 134 331 135 328 128 C326 123 332 115 336 110 Z" fill={core.gold} stroke={core.plum} strokeWidth="2" /></>}
      {variant === 'new-space' && <><Path d="M266 200 V96 a53 53 0 0 1 106 0 V200 M289 200 V100 a30 30 0 0 1 60 0 V200" fill="none" stroke={core.gold} strokeWidth="2" /><Path d="M319 122 C306 141 307 151 319 158 C331 151 332 141 319 122" fill={core.gold} /></>}
      {variant === 'join-space' && <><Circle cx="310" cy="95" r="24" fill="none" stroke={core.gold} strokeWidth="2" /><Circle cx="310" cy="95" r="6" fill={core.gold} /><Path d="M334 95 H390 M365 95 V115 M380 95 V111" fill="none" stroke={core.gold} strokeWidth="2" /></>}
      <Path d={wavePath[variant]} fill={colors[scheme].background} />
    </Svg>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={({ pressed }) => ({ position: 'absolute', top: insets.top + 10, left: 18, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .55 : 1 })}><Ionicons name="chevron-back" size={25} color={core.cream} /></Pressable>
    <Text accessibilityRole="header" numberOfLines={2} style={{ position: 'absolute', left: title.length > 24 ? 74 : 24, right: 24, bottom: 53, color: core.cream, fontSize: 30, lineHeight: 36, letterSpacing: -.8, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>{title}</Text>
  </View>;
}

export function CoreScreen({ title, variant, onBack, scheme, children }: { title: string; variant?: CoreVariant; onBack: () => void; scheme: Scheme; children: ReactNode }) {
  return <ScrollView style={{ flex: 1, backgroundColor: colors[scheme].background }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 122 }}>
    <CoreHeader title={title} variant={variant} onBack={onBack} scheme={scheme} />
    <View style={{ paddingHorizontal: 20, paddingTop: 10, gap: 18 }}>{children}</View>
  </ScrollView>;
}

export function CoreCard({ children, scheme, inset = 0 }: { children: ReactNode; scheme: Scheme; inset?: number }) {
  const c = colors[scheme];
  return <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: scheme === 'light' ? '#DDCEC9' : c.border, borderRadius: 20, padding: inset, overflow: 'hidden' }}>{children}</View>;
}

export function CoreSectionTitle({ children, scheme }: { children: ReactNode; scheme: Scheme }) {
  return <Text accessibilityRole="header" style={{ color: colors[scheme].text, fontSize: 24, lineHeight: 30, letterSpacing: -.4, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>{children}</Text>;
}

export function CoreStatus({ status, scheme }: { status: string; scheme: Scheme }) {
  const danger = status === 'Low stock' || status === 'Overdue' || status === 'Lost or damaged';
  const good = status === 'Available' || status === 'Returned';
  const warm = status === 'Ready to return';
  return <View style={{ maxWidth: '100%', alignSelf: 'flex-start', borderRadius: 12, backgroundColor: scheme === 'dark' ? '#6D566F' : danger ? '#F1DCCB' : good ? '#DCEBDD' : warm ? '#F4E0CB' : '#E7DBEB', paddingHorizontal: 9, paddingVertical: 4 }}><Text numberOfLines={1} style={{ color: scheme === 'dark' ? core.cream : core.plum, fontSize: 11, fontWeight: '700' }}>{status}</Text></View>;
}

export function CoreItemRow({ item, status, scheme, onPress, subtitle }: { item: Item; status: string; scheme: Scheme; onPress: () => void; subtitle?: string }) {
  const c = colors[scheme];
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}, ${status}`} onPress={onPress} style={({ pressed }) => ({ minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, opacity: pressed ? .68 : 1 })}>
    <View style={{ width: 50, height: 50, backgroundColor: c.surfaceAlt, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{item.photoUri ? <Image source={{ uri: item.photoUri }} style={{ width: 50, height: 50 }} /> : <Ionicons name={item.kind === 'consumable' ? 'basket-outline' : 'cube-outline'} size={23} color={c.muted} />}</View>
    <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{item.name}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>{subtitle ?? `${item.location || item.category || 'No location'}`}</Text></View>
    <CoreStatus status={status} scheme={scheme} />
  </Pressable>;
}

export function CoreSegment({ options, value, onChange, scheme }: { options: { label: string; value: string }[]; value: string; onChange: (value: string) => void; scheme: Scheme }) {
  const c = colors[scheme];
  const select = (next: string) => { if (next === value) return; if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {}); onChange(next); };
  return <View style={{ flexDirection: 'row', padding: 3, borderRadius: 15, backgroundColor: c.surfaceAlt, minHeight: 50 }}>
    {options.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: value === option.value }} onPress={() => select(option.value)} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 44, borderRadius: 12, backgroundColor: value === option.value ? c.nav : 'transparent', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5, opacity: pressed ? .78 : 1 })}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.83} style={{ color: value === option.value ? c.navText : c.text, fontSize: 13, fontWeight: '700' }}>{option.label}</Text></Pressable>)}
  </View>;
}

export function CoreField({ label, value, onChangeText, placeholder, scheme, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; scheme: Scheme; keyboardType?: 'default' | 'decimal-pad' }) {
  const c = colors[scheme];
  return <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 58, borderBottomWidth: 1, borderBottomColor: c.border, gap: 12 }}><Text style={{ width: 100, color: c.text, fontSize: 14, fontWeight: '700' }}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType ?? 'default'} style={{ flex: 1, minWidth: 0, color: c.text, fontSize: 16, minHeight: 52, paddingVertical: 10 }} /></View>;
}

export function CoreSwitchRow({ title, detail, value, onChange, scheme }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void; scheme: Scheme }) {
  const c = colors[scheme];
  return <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{title}</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>{detail}</Text></View><Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ false: c.border, true: c.nav }} thumbColor={core.cream} /></View>;
}
