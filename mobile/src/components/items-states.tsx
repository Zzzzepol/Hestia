import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { CoreHeader } from '@/components/core-flows';
import { colors, type Scheme } from '@/theme/colors';

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });

export function ItemsState({ kind, scheme, onBack, onAction, onInvite }: { kind: 'empty' | 'error'; scheme: Scheme; onBack: () => void; onAction: () => void; onInvite?: () => void }) {
  const c = colors[scheme];
  const empty = kind === 'empty';
  return <View style={{ flex: 1, backgroundColor: c.background }}>
    <CoreHeader title="Items" variant="items" scheme={scheme} onBack={onBack} />
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 115, gap: 13 }}>
      <View style={{ width: 104, height: 104, borderRadius: 52, borderWidth: empty ? 1.5 : 0, borderStyle: 'dashed', borderColor: c.muted, backgroundColor: empty ? 'transparent' : c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={empty ? 'cube-outline' : 'alert-circle-outline'} size={36} color={empty ? c.text : c.danger} /></View>
      <Text accessibilityRole="header" style={{ color: c.text, fontFamily: serif, fontSize: 26, textAlign: 'center', marginTop: 11 }}>{empty ? 'Nothing on the shelf yet' : 'We could not load your items'}</Text>
      <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 295 }}>{empty ? 'Add the first thing your Space shares, like the drill or the coffee.' : 'The problem is on our side. Your items are safe.'}</Text>
      <View style={{ width: 218, marginTop: 10 }}><Button label={empty ? 'Add item' : 'Try again'} scheme={scheme} onPress={onAction} /></View>
      {empty && onInvite && <Pressable accessibilityRole="button" accessibilityLabel="Invite members first" onPress={onInvite} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.text, fontSize: 14 }}>or <Text style={{ textDecorationLine: 'underline', fontWeight: '700' }}>invite members first</Text></Text></Pressable>}
    </View>
  </View>;
}

export function ItemsOfflineBanner() {
  return <View accessibilityRole="alert" style={{ minHeight: 58, marginHorizontal: 20, marginTop: 9, marginBottom: 8, borderRadius: 17, backgroundColor: '#F5DCC4', paddingHorizontal: 15, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }}><Ionicons name="cloud-offline-outline" size={21} color="#64452E" /><Text style={{ flex: 1, color: '#64452E', fontSize: 13, fontWeight: '700', lineHeight: 17 }}>You are offline. Showing items saved on this phone.</Text></View>;
}
