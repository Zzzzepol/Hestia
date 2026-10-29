import Ionicons from '@expo/vector-icons/Ionicons';
import { Children } from 'react';
import { Image, Platform, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import type { Item } from '@/types';
import { BrandWordmark } from '@/components/brand-logo';
import { colors, type Scheme } from '@/theme/colors';

const plum = '#3F2B42';
const cream = '#F3E8E2';

type Props = {
  scheme: Scheme;
  firstName: string;
  spaceName: string;
  attention: Item[];
  low: Item[];
  showLowStock: boolean;
  loans: Item[];
  memberName: (id?: string) => string;
  notificationCount: number;
  itemCount: number;
  loading: boolean;
  loadError: boolean;
  offline: boolean;
  currentUserId: string;
  refreshing: boolean;
  onRefresh: () => void;
  onNotifications: () => void;
  onSearch: () => void;
  onSpace: () => void;
  onItem: (item: Item) => void;
  onReview: (item: Item) => void;
  onReturn: (item: Item) => void;
  onRestock: (item: Item) => void;
  onAdd: () => void;
};

function ItemThumb({ item, scheme }: { item: Item; scheme: Scheme }) {
  const c = colors[scheme];
  return <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    {item.photoUri ? <Image source={{ uri: item.photoUri }} style={{ width: 42, height: 42 }} /> : <Ionicons name={item.kind === 'consumable' ? 'basket-outline' : 'cube-outline'} size={20} color={c.muted} />}
  </View>;
}

function Row({ item, detail, action, onPress, onAction, progress, scheme }: { item: Item; detail: string; action?: string; onPress: () => void; onAction?: () => void; progress?: number; scheme: Scheme }) {
  const c = colors[scheme];
  return <View style={{ minHeight: 60, paddingHorizontal: 14, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <ItemThumb item={item} scheme={scheme} />
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name}. ${detail}`} onPress={onPress} style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' }}>
      <Text numberOfLines={1} style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{item.name}</Text>
      <Text numberOfLines={2} style={{ color: c.muted, fontSize: 13 }}>{detail}</Text>
      {progress !== undefined && <View style={{ width: '74%', height: 5, borderRadius: 3, backgroundColor: c.border, marginTop: 5, overflow: 'hidden' }}><View style={{ width: `${Math.max(4, Math.min(100, progress * 100))}%`, height: 5, borderRadius: 3, backgroundColor: c.nav }} /></View>}
    </Pressable>
    {action && onAction && <Pressable accessibilityRole="button" accessibilityLabel={`${action} ${item.name}`} onPress={onAction} style={({ pressed }) => ({ minHeight: 44, minWidth: 75, paddingHorizontal: 13, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: action === 'Restock' ? 1.5 : 0, borderColor: c.nav, backgroundColor: action === 'Restock' ? c.surface : c.nav, opacity: pressed ? .78 : 1 })}><Text style={{ color: action === 'Restock' ? c.text : c.navText, fontSize: 13, fontWeight: '700' }}>{action}</Text></Pressable>}
  </View>;
}

function Group({ title, children, empty, scheme }: { title: string; children?: React.ReactNode; empty: string; scheme: Scheme }) {
  const c = colors[scheme];
  return <View style={{ gap: 7 }}><Text accessibilityRole="header" style={{ color: c.text, fontSize: 24, lineHeight: 29, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>{title}</Text><View style={{ borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>{Children.count(children) ? children : <Text style={{ color: c.muted, fontSize: 14, padding: 17 }}>{empty}</Text>}</View></View>;
}

export function HomeScreen({ scheme, firstName, spaceName, attention, low, showLowStock, loans, memberName, notificationCount, itemCount, loading, loadError, offline, currentUserId, refreshing, onRefresh, onNotifications, onSearch, onSpace, onItem, onReview, onReturn, onRestock, onAdd }: Props) {
  const insets = useSafeAreaInsets();
  const c = colors[scheme];
  const { width, fontScale } = useWindowDimensions();
  const heroHeight = Math.max(fontScale > 1.25 ? 245 : 215, insets.top + (fontScale > 1.25 ? 205 : 175));
  const brandWidth = width < 350 ? 58 : width < 390 ? 80 : 98;
  const side = Math.max(23, (width - 900) / 2 + 23);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} />} showsVerticalScrollIndicator={false}>
    <View style={{ height: heroHeight, backgroundColor: plum }}>
      <Svg width="100%" height={heroHeight} viewBox="0 0 390 250" preserveAspectRatio="none" style={{ position: 'absolute' }}>
        <Rect width="390" height="250" fill={plum} />
        <Circle cx="335" cy="5" r="105" fill="#59415D" />
        <Circle cx="20" cy="165" r="68" fill="#302036" />
        <Ellipse cx="73" cy="43" rx="10" ry="9" fill="#302036" />
        <Ellipse cx="340" cy="170" rx="20" ry="15" fill="#59415D" />
        <Path d="M0 222 C85 176 159 191 226 222 C294 257 341 257 390 219 L390 250 L0 250 Z" fill={c.background} />
      </Svg>
      <BrandWordmark width={brandWidth} style={{ position: 'absolute', top: insets.top + 16, left: side, borderRadius: 4 }} />
      <View style={{ position: 'absolute', top: insets.top + 13, left: side, right: side, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={notificationCount ? `Notifications, ${notificationCount} need attention` : 'Notifications'} onPress={onNotifications} style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .72 : 1 })}>
          <Ionicons name="notifications-outline" size={26} color={cream} />
          {notificationCount > 0 && <View style={{ position: 'absolute', top: 0, right: 0, minWidth: 19, height: 19, paddingHorizontal: 3, borderRadius: 10, backgroundColor: '#D9952A', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: plum, fontSize: 11, fontWeight: '800' }}>{notificationCount > 99 ? '99+' : notificationCount}</Text></View>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Space: ${spaceName}`} onPress={onSpace} style={({ pressed }) => ({ minHeight: 44, maxWidth: Math.min(width * .45, 180), borderColor: '#BFAEBF', borderWidth: 1.5, borderRadius: 25, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? .75 : 1 })}><Text numberOfLines={1} style={{ flexShrink: 1, color: cream, fontWeight: '700', fontSize: 14 }}>{spaceName}</Text><Ionicons name="chevron-down" size={13} color={cream} /></Pressable>
      </View>
      <View style={{ position: 'absolute', left: side, right: side, bottom: 61 }}><Text style={{ color: cream, fontSize: 14, fontWeight: '600' }}>{greeting}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: cream, fontSize: 40, lineHeight: 46, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>{firstName}</Text></View>
    </View>
    <View style={{ width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 5, gap: 17 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Find an item" onPress={onSearch} style={({ pressed }) => ({ minHeight: 55, borderRadius: 17, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? .76 : 1 })}><Ionicons name="search" size={21} color={c.text} /><Text style={{ color: c.muted, fontSize: 15, fontWeight: '600' }}>Find an item</Text></Pressable>
      {itemCount === 0 && !loading && <View style={{ borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 20, gap: 10 }}><Ionicons name={offline ? 'cloud-offline-outline' : loadError ? 'alert-circle-outline' : 'cube-outline'} size={29} color={c.text} /><Text style={{ color: c.text, fontSize: 23, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>{offline ? 'Items unavailable offline' : loadError ? 'Could not load items' : 'Start with your first item'}</Text><Text style={{ color: c.muted, fontSize: 14, lineHeight: 20 }}>{offline ? 'Reconnect to load your Space items.' : loadError ? 'Check your connection and try again.' : 'Add something you keep at home, then track stock or borrowing with your Space.'}</Text>{!offline && <Pressable accessibilityRole="button" accessibilityLabel={loadError ? 'Try loading items again' : 'Add your first item'} onPress={loadError ? onRefresh : onAdd} style={({ pressed }) => ({ minHeight: 48, borderRadius: 14, backgroundColor: c.nav, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .75 : 1 })}><Text style={{ color: c.navText, fontSize: 15, fontWeight: '700' }}>{loadError ? 'Try again' : 'Add your first item'}</Text></Pressable>}</View>}
      {itemCount > 0 && <>
      <Group title="Needs you" empty="All settled. Nothing needs you right now." scheme={scheme}>
        {attention.map((item, index) => <View key={item.id}>{index > 0 && <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: 14 }} />}<Row item={item} scheme={scheme} detail={item.loan?.state === 'Requested' ? `${memberName(item.loan.borrowerId)} wants to borrow` : item.loan?.state === 'Borrowed' && item.loan.dueAt ? `Return by ${new Date(item.loan.dueAt).toLocaleDateString(undefined, { weekday: 'long' })}` : item.loan?.state === 'Ready to return' ? 'Ready for return' : 'Ready to return'} action={item.loan?.state === 'Requested' ? 'Review' : item.loan?.state === 'Ready to return' && item.loan.borrowerId === currentUserId ? 'View' : item.loan?.state === 'Ready to return' ? 'Receive' : 'Return'} onPress={() => onItem(item)} onAction={() => item.loan?.state === 'Requested' ? onReview(item) : onReturn(item)} /></View>)}
      </Group>
      {showLowStock && <Group title="Running low" empty="Everything is well stocked." scheme={scheme}>
        {low.map((item, index) => <View key={item.id}>{index > 0 && <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: 14 }} />}<Row item={item} scheme={scheme} detail={`${item.quantity ?? 0} of ${Math.max(item.lowThreshold ?? 0, (item.quantity ?? 0) + 1)} left`} action="Restock" onPress={() => onItem(item)} onAction={() => onRestock(item)} progress={(item.quantity ?? 0) / Math.max(item.lowThreshold ?? 0, (item.quantity ?? 0) + 1, 1)} /></View>)}
      </Group>}
      <Group title="Who has what" empty="Everything is home." scheme={scheme}>
        {loans.map((item, index) => <View key={item.id}>{index > 0 && <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: 14 }} />}<Row item={item} scheme={scheme} detail={`${memberName(item.loan?.borrowerId)}${item.loan?.dueAt ? ` · due ${new Date(item.loan.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`} onPress={() => onItem(item)} /></View>)}
      </Group>
      </>}
    </View>
  </ScrollView>;
}
