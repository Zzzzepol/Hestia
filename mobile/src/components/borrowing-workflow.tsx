import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Skeleton } from '@/components/ui';
import { CoreCard, CoreScreen, CoreStatus, core } from '@/components/core-flows';
import { colors, type Scheme } from '@/theme/colors';
import type { Item } from '@/types';

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });
const dateAfter = (days: number) => { const value = new Date(); value.setDate(value.getDate() + days); value.setHours(17, 0, 0, 0); return value; };
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function WorkflowSheet({ visible, onClose, children, scheme }: { visible: boolean; onClose: () => void; children: React.ReactNode; scheme: Scheme }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return <Modal visible={visible} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#998A96', justifyContent: 'flex-end' }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 138, backgroundColor: core.plum }} />
      <Pressable accessibilityLabel="Close sheet" onPress={onClose} style={{ flex: 1 }} />
      <View style={{ maxHeight: '82%', backgroundColor: colors[scheme].background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#B8AAAE', marginTop: 10 }} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 16) + 10, gap: 14 }}>{children}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

export function BorrowRequestSheet({ visible, item, ownerName, scheme, pending, error, onClose, onSubmit }: { visible: boolean; item?: Item; ownerName: string; scheme: Scheme; pending: boolean; error?: string; onClose: () => void; onSubmit: (dueAt: string, note: string) => void }) {
  const c = colors[scheme];
  const [dueDate, setDueDate] = useState(() => dateAfter(3));
  const [note, setNote] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const selectDays = (days: number) => { setDueDate(dateAfter(days)); setDateOpen(false); };
  const close = () => { setDateOpen(false); setNote(''); setDueDate(dateAfter(3)); onClose(); };
  return <WorkflowSheet visible={visible} onClose={close} scheme={scheme}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: '#E5D6D0' }} />
      <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.text, fontFamily: serif, fontSize: 21 }}>{item?.name ?? 'Item'}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{item?.location || 'No location'} · Owner {ownerName}</Text></View>
      <CoreStatus status="Available" scheme={scheme} />
    </View>
    <View style={{ gap: 7 }}><Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>Return by</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Return by ${dueDate.toDateString()}. Choose date`} onPress={() => setDateOpen(value => !value)} style={({ pressed }) => ({ minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11, opacity: pressed ? .7 : 1 })}><Ionicons name="calendar-outline" size={20} color={c.text} /><Text style={{ flex: 1, color: c.text, fontWeight: '700', fontSize: 14 }}>{dueDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</Text><Ionicons name="chevron-forward" size={18} color={c.text} /></Pressable>
      {dateOpen && (Platform.OS === 'web' ? <TextInput accessibilityLabel="Return date" placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} onChangeText={value => { const parsed = new Date(`${value}T17:00:00`); if (!Number.isNaN(parsed.getTime()) && parsed > new Date()) setDueDate(parsed); }} style={{ minHeight: 48, color: c.text, backgroundColor: c.surface, borderRadius: 12, paddingHorizontal: 12 }} /> : <DateTimePicker value={dueDate} mode="date" minimumDate={dateAfter(1)} display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={(_event, next) => { if (next) { const selected = new Date(next); selected.setHours(17, 0, 0, 0); setDueDate(selected); } setDateOpen(false); }} />)}
    </View>
    <View style={{ flexDirection: 'row', gap: 7 }}>{[{ label: 'Tomorrow', days: 1 }, { label: '3 days', days: 3 }, { label: '1 week', days: 7 }].map(choice => <Pressable key={choice.days} accessibilityRole="button" accessibilityState={{ selected: sameDay(dueDate, dateAfter(choice.days)) }} onPress={() => selectDays(choice.days)} style={({ pressed }) => ({ minHeight: 32, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: sameDay(dueDate, dateAfter(choice.days)) ? c.nav : 'transparent', opacity: pressed ? .7 : 1 })}><Text style={{ color: sameDay(dueDate, dateAfter(choice.days)) ? c.navText : c.text, fontSize: 12, fontWeight: '700' }}>{choice.label}</Text></Pressable>)}</View>
    <TextInput accessibilityLabel="Add a note, optional" value={note} onChangeText={setNote} maxLength={500} multiline placeholder="Add a note (optional)" placeholderTextColor={c.muted} style={{ minHeight: 56, borderBottomWidth: 1, borderColor: c.border, color: c.text, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top' }} />
    <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>{ownerName} reviews your request. Once approved, the item is reserved for you.</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 13 }}>{error}</Text> : null}
    <Button label="Send request" scheme={scheme} disabled={pending || !item || dueDate <= new Date()} onPress={() => onSubmit(dueDate.toISOString(), note)} />
  </WorkflowSheet>;
}

export function OutcomeSheet({ visible, item, borrowerName, scheme, pending, error, onClose, onSubmit }: { visible: boolean; item?: Item; borrowerName: string; scheme: Scheme; pending: boolean; error?: string; onClose: () => void; onSubmit: (outcome: 'lost' | 'damaged', note: string) => void }) {
  const c = colors[scheme];
  const [outcome, setOutcome] = useState<'lost' | 'damaged'>('damaged');
  const [note, setNote] = useState('');
  const close = () => { setOutcome('damaged'); setNote(''); onClose(); };
  return <WorkflowSheet visible={visible} onClose={close} scheme={scheme}>
    <View><Text style={{ color: c.text, fontFamily: serif, fontSize: 24 }}>Record an outcome</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{item?.name ?? 'Item'} · with {borrowerName}</Text></View>
    <View style={{ minHeight: 45, flexDirection: 'row', borderRadius: 12, backgroundColor: c.surfaceAlt, padding: 3 }}>{(['lost', 'damaged'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: outcome === value }} onPress={() => setOutcome(value)} style={{ flex: 1, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: outcome === value ? c.nav : 'transparent' }}><Text style={{ color: outcome === value ? c.navText : c.text, fontSize: 13, fontWeight: '700' }}>{value === 'lost' ? 'Lost' : 'Damaged'}</Text></Pressable>)}</View>
    <TextInput accessibilityLabel="What happened?" value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="What happened?" placeholderTextColor={c.muted} textAlignVertical="top" style={{ minHeight: 93, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 13, color: c.text, fontSize: 14 }} />
    <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>The item is marked {outcome} and cannot be borrowed until you restore it. Its history stays intact. Only the owner or custodian can do this.</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 13 }}>{error}</Text> : null}
    <Button label="Record outcome" scheme={scheme} disabled={pending || !item || !note.trim()} onPress={() => onSubmit(outcome, note.trim())} />
    <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={close} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>Cancel</Text></Pressable>
  </WorkflowSheet>;
}

export function ConsumableDetail({ item, scheme, memberName, onBack, onUse, onRestock, onEdit }: { item: Item; scheme: Scheme; memberName: (id?: string) => string; onBack: () => void; onUse: () => void; onRestock: () => void; onEdit?: () => void }) {
  const c = colors[scheme];
  const quantity = item.quantity ?? 0;
  const observedHigh = Math.max(quantity, ...item.history.flatMap(activity => [activity.before ?? 0, activity.after ?? 0]));
  const low = quantity <= (item.lowThreshold ?? 0);
  return <CoreScreen title={item.name} variant="consumable" scheme={scheme} onBack={onBack}>
    <CoreCard scheme={scheme} inset={15}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontFamily: serif, fontSize: 45, lineHeight: 50 }}>{quantity}</Text><Text style={{ color: c.muted, fontSize: 13 }}>left{observedHigh > quantity ? ` of ${observedHigh}` : ''}</Text></View><View style={{ alignItems: 'flex-end', gap: 3 }}>{low && <CoreStatus status="Low stock" scheme={scheme} />}<Text style={{ color: c.muted, fontSize: 12 }}>Alert at {item.lowThreshold ?? 0} or fewer</Text></View></View>
    </CoreCard>
    <View style={{ height: 5, backgroundColor: c.border, borderRadius: 3, overflow: 'hidden', marginTop: -8 }}><View style={{ width: `${observedHigh ? Math.max(0, Math.min(100, quantity / observedHigh * 100)) : 0}%`, height: 5, borderRadius: 3, backgroundColor: core.plum }} /></View>
    <View style={{ flexDirection: 'row', gap: 9, marginTop: -6 }}><View style={{ flex: 1 }}><Button label="Use" scheme={scheme} onPress={onUse} /></View><View style={{ flex: 1 }}><Button label="Restock" kind="secondary" scheme={scheme} onPress={onRestock} /></View></View>
    <Text style={{ color: c.muted, fontSize: 13, marginTop: -6 }}>{item.location || 'No location'} · {item.visibility === 'shared' ? 'Shared' : 'Private'} · Owner {memberName(item.ownerId)}</Text>
    <View style={{ gap: 8 }}><Text style={{ color: c.text, fontFamily: serif, fontSize: 23 }}>History</Text><CoreCard scheme={scheme}>{item.history.length ? item.history.map((entry, index) => {
      const change = entry.before !== undefined && entry.after !== undefined ? Math.abs(entry.after - entry.before) : 0;
      const verb = entry.kind === 'Used' ? 'used' : entry.kind === 'Restocked' ? 'restocked' : entry.kind.toLowerCase();
      return <View key={entry.id} style={{ minHeight: 59, borderTopWidth: index ? 1 : 0, borderColor: c.border, paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{memberName(entry.actorId)} {verb}{change ? ` ${change}` : ''}</Text><Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>{new Date(entry.at).toLocaleDateString(undefined, { weekday: 'short' })} {new Date(entry.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text></View>{entry.before !== undefined && <Text style={{ color: c.text, fontSize: 13 }}>{entry.before} → {entry.after}</Text>}</View>;
    }) : <Text style={{ color: c.muted, padding: 15 }}>No activity yet.</Text>}</CoreCard></View>
    {onEdit && <Button label="Edit item" kind="secondary" scheme={scheme} onPress={onEdit} />}
  </CoreScreen>;
}

export type ReminderEntry = { id: string; icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; status?: string; onPress: () => void };

export function RemindersScreen({ scheme, today, earlier, loading, onBack }: { scheme: Scheme; today: ReminderEntry[]; earlier: ReminderEntry[]; loading: boolean; onBack: () => void }) {
  const c = colors[scheme];
  const section = (title: string, rows: ReminderEntry[]) => <View style={{ gap: 8 }}><Text style={{ color: c.text, fontFamily: serif, fontSize: 22 }}>{title}</Text><CoreCard scheme={scheme}>{rows.length ? rows.map((row, index) => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`${row.title}. ${row.detail}`} onPress={row.onPress} style={({ pressed }) => ({ minHeight: 62, borderTopWidth: index ? 1 : 0, borderColor: c.border, paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? .7 : 1 })}><View style={{ width: 37, height: 37, borderRadius: 19, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={row.icon} size={19} color={c.text} /></View><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={2} style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>{row.title}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>{row.detail}</Text></View>{row.status && <CoreStatus status={row.status} scheme={scheme} />}</Pressable>) : <Text style={{ color: c.muted, fontSize: 14, padding: 16 }}>Nothing needs attention.</Text>}</CoreCard></View>;
  return <CoreScreen title="Reminders" variant="reminders" scheme={scheme} onBack={onBack}>{loading ? <Skeleton scheme={scheme} /> : <>{section('Today', today)}{section('Earlier', earlier)}</>}</CoreScreen>;
}
