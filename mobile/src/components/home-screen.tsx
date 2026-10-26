import Ionicons from '@expo/vector-icons/Ionicons';
import { Children } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import type { Item } from '@/types';

const plum = '#3F2B42';
const cream = '#F3E8E2';
const muted = '#68536A';

type Props = {
  firstName: string;
  spaceName: string;
  attention: Item[];
  low: Item[];
  showLowStock: boolean;
  loans: Item[];
  memberName: (id?: string) => string;
  notificationCount: number;
  onNotifications: () => void;
  onSearch: () => void;
  onSpace: () => void;
  onItem: (item: Item) => void;
  onReview: (item: Item) => void;
  onReturn: (item: Item) => void;
  onRestock: (item: Item) => void;
};

function ItemThumb({ item }: { item: Item }) {
  return <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: '#E5D6D0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    {item.photoUri ? <Image source={{ uri: item.photoUri }} style={{ width: 42, height: 42 }} /> : <Ionicons name={item.kind === 'consumable' ? 'basket-outline' : 'cube-outline'} size={20} color="#9F8C96" />}
  </View>;
}

function Row({ item, detail, action, onPress, onAction, progress }: { item: Item; detail: string; action?: string; onPress: () => void; onAction?: () => void; progress?: number }) {
  return <View style={{ minHeight: 60, paddingHorizontal: 14, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <ItemThumb item={item} />
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name}. ${detail}`} onPress={onPress} style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' }}>
      <Text numberOfLines={1} style={{ color: plum, fontSize: 16, fontWeight: '700' }}>{item.name}</Text>
      <Text numberOfLines={1} style={{ color: muted, fontSize: 13 }}>{detail}</Text>
      {progress !== undefined && <View style={{ width: '74%', height: 5, borderRadius: 3, backgroundColor: '#DFCEC8', marginTop: 5, overflow: 'hidden' }}><View style={{ width: `${Math.max(4, Math.min(100, progress * 100))}%`, height: 5, borderRadius: 3, backgroundColor: plum }} /></View>}
    </Pressable>
    {action && onAction && <Pressable accessibilityRole="button" accessibilityLabel={`${action} ${item.name}`} onPress={onAction} style={({ pressed }) => ({ minHeight: 40, minWidth: 75, paddingHorizontal: 13, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: action === 'Restock' ? 1.5 : 0, borderColor: plum, backgroundColor: action === 'Restock' ? '#FBF6F3' : plum, opacity: pressed ? .78 : 1 })}><Text style={{ color: action === 'Restock' ? plum : cream, fontSize: 13, fontWeight: '700' }}>{action}</Text></Pressable>}
  </View>;
}

function Group({ title, children, empty }: { title: string; children?: React.ReactNode; empty: string }) {
  return <View style={{ gap: 7 }}><Text accessibilityRole="header" style={{ color: plum, fontSize: 24, lineHeight: 29, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>{title}</Text><View style={{ borderRadius: 20, backgroundColor: '#FBF6F3', borderWidth: 1, borderColor: '#DDCEC9', overflow: 'hidden' }}>{Children.count(children) ? children : <Text style={{ color: muted, fontSize: 14, padding: 17 }}>{empty}</Text>}</View></View>;
}

export function HomeScreen({ firstName, spaceName, attention, low, showLowStock, loans, memberName, notificationCount, onNotifications, onSearch, onSpace, onItem, onReview, onReturn, onRestock }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const heroHeight = Math.max(215, insets.top + 175);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return <ScrollView style={{ flex: 1, backgroundColor: cream }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
    <View style={{ height: heroHeight, backgroundColor: plum }}>
      <Svg width="100%" height={heroHeight} viewBox="0 0 390 250" preserveAspectRatio="none" style={{ position: 'absolute' }}>
        <Rect width="390" height="250" fill={plum} />
        <Circle cx="335" cy="5" r="105" fill="#59415D" />
        <Circle cx="20" cy="165" r="68" fill="#302036" />
        <Ellipse cx="73" cy="43" rx="10" ry="9" fill="#302036" />
        <Ellipse cx="340" cy="170" rx="20" ry="15" fill="#59415D" />
        <Path d="M0 222 C85 176 159 191 226 222 C294 257 341 257 390 219 L390 250 L0 250 Z" fill={cream} />
      </Svg>
      <View style={{ position: 'absolute', top: insets.top + 13, left: 24, right: 24, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={notificationCount ? `Notifications, ${notificationCount} need attention` : 'Notifications'} onPress={onNotifications} style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .72 : 1 })}>
          <Ionicons name="notifications-outline" size={26} color={cream} />
          {notificationCount > 0 && <View style={{ position: 'absolute', top: 0, right: 0, minWidth: 19, height: 19, paddingHorizontal: 3, borderRadius: 10, backgroundColor: '#D9952A', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: plum, fontSize: 11, fontWeight: '800' }}>{notificationCount > 99 ? '99+' : notificationCount}</Text></View>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Space: ${spaceName}`} onPress={onSpace} style={({ pressed }) => ({ minHeight: 44, maxWidth: Math.min(width * .52, 220), borderColor: '#BFAEBF', borderWidth: 1.5, borderRadius: 25, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? .75 : 1 })}><Text numberOfLines={1} style={{ flexShrink: 1, color: cream, fontWeight: '700', fontSize: 14 }}>{spaceName}</Text><Ionicons name="chevron-down" size={13} color={cream} /></Pressable>
      </View>
      <View style={{ position: 'absolute', left: 25, right: 25, bottom: 61 }}><Text style={{ color: cream, fontSize: 14, fontWeight: '600' }}>{greeting}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: cream, fontSize: 40, lineHeight: 46, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>{firstName}</Text></View>
    </View>
    <View style={{ paddingHorizontal: 20, paddingTop: 5, gap: 17 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Find an item" onPress={onSearch} style={({ pressed }) => ({ minHeight: 55, borderRadius: 17, backgroundColor: '#FBF6F3', borderWidth: 1, borderColor: '#CFBEC4', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? .76 : 1 })}><Ionicons name="search" size={21} color={plum} /><Text style={{ color: muted, fontSize: 15, fontWeight: '600' }}>Find an item</Text></Pressable>
      <Group title="Needs you" empty="All settled. Nothing needs you right now.">
        {attention.map((item, index) => <View key={item.id}>{index > 0 && <View style={{ height: 1, backgroundColor: '#E9DEDA', marginHorizontal: 14 }} />}<Row item={item} detail={item.loan?.state === 'Requested' ? `${memberName(item.loan.borrowerId)} wants to borrow` : item.loan?.state === 'Borrowed' && item.loan.dueAt ? `Return by ${new Date(item.loan.dueAt).toLocaleDateString(undefined, { weekday: 'long' })}` : item.loan?.state === 'Ready to return' ? 'Ready for return' : 'Ready to return'} action={item.loan?.state === 'Requested' ? 'Review' : 'Return'} onPress={() => onItem(item)} onAction={() => item.loan?.state === 'Requested' ? onReview(item) : onReturn(item)} /></View>)}
      </Group>
      {showLowStock && <Group title="Running low" empty="Everything is well stocked.">
        {low.map((item, index) => <View key={item.id}>{index > 0 && <View style={{ height: 1, backgroundColor: '#E9DEDA', marginHorizontal: 14 }} />}<Row item={item} detail={`${item.quantity ?? 0} of ${Math.max(item.lowThreshold ?? 0, (item.quantity ?? 0) + 1)} left`} action="Restock" onPress={() => onItem(item)} onAction={() => onRestock(item)} progress={(item.quantity ?? 0) / Math.max(item.lowThreshold ?? 0, (item.quantity ?? 0) + 1, 1)} /></View>)}
      </Group>}
      <Group title="Who has what" empty="Everything is home.">
        {loans.map((item, index) => <View key={item.id}>{index > 0 && <View style={{ height: 1, backgroundColor: '#E9DEDA', marginHorizontal: 14 }} />}<Row item={item} detail={`${memberName(item.loan?.borrowerId)}${item.loan?.dueAt ? ` · due ${new Date(item.loan.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`} onPress={() => onItem(item)} /></View>)}
      </Group>
    </View>
  </ScrollView>;
}
