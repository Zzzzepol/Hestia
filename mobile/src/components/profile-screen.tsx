import Ionicons from '@expo/vector-icons/Ionicons';
import { Host, TextInput as ExpoTextInput } from '@expo/ui';
import { useState } from 'react';
import { Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Flame } from '@/components/bubble-menu';
import { CoreCard, CoreScreen, CoreSectionTitle, core } from '@/components/core-flows';
import { colors, type Scheme } from '@/theme/colors';
import type { SpaceKind } from '@/types';

type SpaceRow = { id: string; name: string; kind: SpaceKind; role: 'admin' | 'member' };
type Props = {
  scheme: Scheme; name: string; email: string; currentSpaceId: string;
  spaces: SpaceRow[]; returnReminders: boolean; lowStockAlerts: boolean; pending: boolean; notice: string;
  onBack: () => void; onEdit: () => void; onSpace: (id: string) => void; onAddSpace: () => void;
  onReturnReminders: (value: boolean) => void; onLowStockAlerts: (value: boolean) => void;
  onChangePassword: () => void; onLogOut: () => void;
};

const kindLabel: Record<SpaceKind, string> = { household: 'Household', dorm: 'Dorm', student_org: 'Student org', small_office: 'Small office' };

function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toLocaleUpperCase() ?? '').join('') || '?'; }

function PreferenceRow({ title, detail, value, onChange, pending, scheme, divided = false }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void; pending: boolean; scheme: Scheme; divided?: boolean }) {
  const c = colors[scheme];
  return <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 88, paddingLeft: 16, paddingRight: 20, paddingVertical: 12, gap: 12, borderTopWidth: divided ? 1 : 0, borderColor: scheme === 'light' ? '#E8DCD7' : c.border }}>
    <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{title}</Text><Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{detail}</Text></View>
    <View style={{ width: 54, minHeight: 52, alignItems: 'center', justifyContent: 'center' }}><Switch accessibilityLabel={title} value={value} onValueChange={onChange} disabled={pending} trackColor={{ false: c.border, true: core.plum }} thumbColor={core.cream} style={{ alignSelf: 'center' }} /></View>
  </View>;
}

export function ProfilePasswordField({ label, value, onChangeText, scheme, current = false }: { label: string; value: string; onChangeText: (value: string) => void; scheme: Scheme; current?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const c = colors[scheme];
  return <View style={{ gap: 6 }}><Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>{label}</Text><View style={{ minHeight: 56, borderWidth: 1, borderColor: c.border, borderRadius: 14, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', paddingLeft: 12 }}>
    {Platform.OS === 'ios' ? <Host accessibilityLabel={label} style={{ flex: 1, minWidth: 0, height: 54 }}><ExpoTextInput defaultValue={value} placeholder={label} placeholderTextColor={c.muted} textStyle={{ color: c.text, fontSize: 16 }} style={{ width: '100%', height: 54 }} autoCapitalize="none" autoCorrect={false} autoComplete={current ? 'current-password' : 'new-password'} secureTextEntry={!revealed} onChangeText={onChangeText} /></Host> : <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={label} placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} autoComplete={current ? 'current-password' : 'new-password'} secureTextEntry={!revealed} style={{ flex: 1, color: c.text, fontSize: 16, minHeight: 54 }} />}
    <Pressable accessibilityRole="button" accessibilityLabel={revealed ? `Hide ${label}` : `Show ${label}`} onPress={() => setRevealed(shown => !shown)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={23} color={c.text} /></Pressable>
  </View></View>;
}

export function ProfileScreen(props: Props) {
  const c = colors[props.scheme];
  const rowBorder = props.scheme === 'light' ? '#E8DCD7' : c.border;
  const cardRow = { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 70, paddingHorizontal: 16, gap: 14 };
  return <CoreScreen title="Profile" variant="profile" scheme={props.scheme} onBack={props.onBack}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76 }}>
      <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: core.plum, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: core.cream, fontSize: 25, fontWeight: '500' }}>{initials(props.name)}</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 27, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>{props.name}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 14, marginTop: 3 }}>{props.email || 'Email unavailable'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={props.onEdit} style={({ pressed }) => ({ minWidth: 65, minHeight: 44, borderRadius: 24, borderWidth: 1.5, borderColor: c.text, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .65 : 1 })}><Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>Edit</Text></Pressable>
    </View>

    {props.notice ? <Text accessibilityRole="alert" style={{ color: c.success, fontSize: 13 }}>{props.notice}</Text> : null}

    <View style={{ gap: 9 }}>
      <CoreSectionTitle scheme={props.scheme}>Spaces</CoreSectionTitle>
      <CoreCard scheme={props.scheme}>
        {props.spaces.map((space, index) => <Pressable key={space.id} accessibilityRole="button" accessibilityLabel={`${space.name}, ${space.role}. ${space.id === props.currentSpaceId ? 'Current Space' : 'Switch Space'}`} accessibilityState={{ selected: space.id === props.currentSpaceId }} onPress={() => props.onSpace(space.id)} style={({ pressed }) => ({ ...cardRow, borderTopWidth: index ? 1 : 0, borderColor: rowBorder, opacity: pressed ? .68 : 1 })}>
          <View style={{ width: 43, height: 43, borderRadius: 13, backgroundColor: core.plum, alignItems: 'center', justifyContent: 'center' }}><Flame /></View>
          <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{space.name}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{kindLabel[space.kind] ?? 'Space'} · {space.role === 'admin' ? 'Admin' : 'Member'}</Text></View>
          <Ionicons name={space.id === props.currentSpaceId ? 'checkmark' : 'chevron-forward'} size={22} color={c.text} />
        </Pressable>)}
        <Pressable accessibilityRole="button" accessibilityLabel="Create or join another Space" onPress={props.onAddSpace} style={({ pressed }) => ({ ...cardRow, borderTopWidth: props.spaces.length ? 1 : 0, borderColor: rowBorder, opacity: pressed ? .68 : 1 })}>
          <View style={{ width: 43, height: 43, borderRadius: 22, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={25} color={c.text} /></View>
          <Text numberOfLines={2} style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Create or join another Space</Text><Ionicons name="chevron-forward" size={20} color={c.text} />
        </Pressable>
      </CoreCard>
    </View>

    <View style={{ gap: 9 }}>
      <CoreSectionTitle scheme={props.scheme}>Preferences</CoreSectionTitle>
      <CoreCard scheme={props.scheme}>
        <PreferenceRow title="Return reminders" detail="Before and after a due date" value={props.returnReminders} onChange={props.onReturnReminders} pending={props.pending} scheme={props.scheme} />
        <PreferenceRow title="Low-stock alerts" detail="Show running low items on Home" value={props.lowStockAlerts} onChange={props.onLowStockAlerts} pending={props.pending} scheme={props.scheme} divided />
      </CoreCard>
    </View>

    <CoreCard scheme={props.scheme}>
      <Pressable accessibilityRole="button" accessibilityLabel="Change password" onPress={props.onChangePassword} style={({ pressed }) => ({ ...cardRow, opacity: pressed ? .68 : 1 })}><Ionicons name="lock-closed-outline" size={22} color={c.text} /><Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Change password</Text><Ionicons name="chevron-forward" size={20} color={c.text} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={props.onLogOut} style={({ pressed }) => ({ ...cardRow, borderTopWidth: 1, borderColor: rowBorder, opacity: pressed ? .68 : 1 })}><Ionicons name="log-out-outline" size={22} color={c.text} /><Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Log out</Text></Pressable>
    </CoreCard>
  </CoreScreen>;
}
