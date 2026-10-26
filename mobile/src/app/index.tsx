import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useColorScheme, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '@/api';
import { Button, Chip, EmptyState, Sheet, Skeleton } from '@/components/ui';
import { AuthScreen } from '@/components/auth-screen';
import { HomeScreen } from '@/components/home-screen';
import { ItemsOfflineBanner, ItemsState } from '@/components/items-states';
import { BubbleMenu } from '@/components/bubble-menu';
import { SpaceFlowScreen } from '@/components/space-flow-screen';
import { SpaceAdminOverlay, type SpaceAdminMode } from '@/components/space-admin-overlay';
import { ProfilePasswordField, ProfileScreen } from '@/components/profile-screen';
import { BorrowRequestSheet, ConsumableDetail, OutcomeSheet, RemindersScreen, type ReminderEntry } from '@/components/borrowing-workflow';
import { CoreCard, CoreField, CoreHeader, CoreItemRow, CoreScreen, CoreSectionTitle, CoreSegment, CoreStatus, CoreSwitchRow, core } from '@/components/core-flows';
import { colors, type Scheme } from '@/theme/colors';
import type { Item, ItemInput, Session, SpaceKind } from '@/types';
import { getSupabaseClient } from '@/lib/supabase';
import { disablePhoneNotifications, enablePhoneNotifications, onPhoneNotificationOpen } from '@/lib/push';

type Tab = 'Home' | 'Items' | 'Add' | 'Requests' | 'Reminders' | 'Space' | 'Profile';
const keys = { session: ['session'], account: ['account'], spaces: ['spaces'], items: ['items'], members: ['members'], space: ['space'], invites: ['invites'], requests: ['requests'], reminders: ['reminders'], notifications: ['notifications'], detail: ['item-detail'] };
const emptyForm: ItemInput = { name: '', kind: 'consumable', category: '', location: '', visibility: 'shared', quantity: 0, unit: 'units', lowThreshold: 1 };
const message = (e: unknown) => e instanceof Error ? e.message : 'Please try again.';
const active = (i: Item) => !!i.loan && ['Reserved', 'Borrowed', 'Ready to return'].includes(i.loan.state);
type PendingUse = { key: string; spaceId: string; itemId: string; amount: number };
const quantityLabel = (i: Item) => { const amount = i.quantity ?? 0; const unit = i.unit ?? 'units'; return `${new Intl.NumberFormat().format(amount)} ${amount === 1 && ['units', 'packs'].includes(unit) ? unit.slice(0, -1) : unit}`; };
function itemStatus(i: Item) { if (i.kind === 'consumable') return (i.quantity ?? 0) <= (i.lowThreshold ?? 0) ? 'Low stock' : quantityLabel(i); if (i.damaged) return 'Lost or damaged'; if (!active(i)) return i.loan?.state === 'Requested' ? 'Requested' : 'Available'; if (i.loan?.state === 'Borrowed' && i.loan.dueAt && Date.parse(i.loan.dueAt) < Date.now()) return 'Overdue'; return i.loan!.state; }

export default function App() {
  const qc = useQueryClient(); const system = useColorScheme(); const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>('Home'); const [selectedId, setSelectedId] = useState<string | null>(null); const [spacePicker, setSpacePicker] = useState(false); const [menuOpen, setMenuOpen] = useState(false);
  const session = useQuery({ queryKey: keys.session, queryFn: api.getSession }); const db = session.data;
  const scheme: Scheme = db?.theme === 'light' ? 'light' : db?.theme === 'dark' ? 'dark' : system === 'dark' ? 'dark' : 'light'; const c = colors[scheme];
  const itemsQ = useQuery({ queryKey: keys.items, queryFn: api.listItems, enabled: !!db?.spaceId });
  const membersQ = useQuery({ queryKey: keys.members, queryFn: api.listMembers, enabled: !!db?.spaceId });
  const spaceQ = useQuery({ queryKey: keys.space, queryFn: api.getSpace, enabled: !!db?.spaceId });
  const invitesQ = useQuery({ queryKey: [...keys.invites, db?.spaceId], queryFn: api.listInvites, enabled: tab === 'Space' && !!db?.spaceId && !!spaceQ.data?.adminIds.includes(db?.userId ?? '') });
  const spacesQ = useQuery({ queryKey: keys.spaces, queryFn: api.listSpaces, enabled: !!db?.userId && (!db.spaceId || spacePicker || tab === 'Profile' || tab === 'Space') });
  const requestsQ = useQuery({ queryKey: keys.requests, queryFn: api.listRequests, enabled: !!db?.spaceId && !!itemsQ.data && ['Home', 'Requests', 'Reminders'].includes(tab) });
  const remindersQ = useQuery({ queryKey: keys.reminders, queryFn: api.listDueReminders, enabled: !!db?.spaceId && !!itemsQ.data && ['Home', 'Reminders'].includes(tab) });
  const notificationsQ = useQuery({ queryKey: [...keys.notifications, db?.spaceId], queryFn: api.listNotifications, enabled: !!db?.spaceId && !!itemsQ.data && ['Home', 'Reminders'].includes(tab) });
  const accountQ = useQuery({ queryKey: keys.account, queryFn: api.getAccount, enabled: !!db?.userId && tab === 'Profile' });
  const [offline, setOffline] = useState(false);
  const [pendingUses, setPendingUses] = useState<PendingUse[]>([]); const [queueOwner, setQueueOwner] = useState<string | null>(null); const syncingUses = useRef(false);
  const cacheKey = db?.userId && db.spaceId ? `hestia:items:${db.userId}:${db.spaceId}` : null;
  const [savedItems, setSavedItems] = useState<{ key: string; data: Item[] } | null>(null);
  const storedItems = itemsQ.data ?? (offline && cacheKey === savedItems?.key ? savedItems.data : []);
  const items = offline ? storedItems.map(item => pendingUses.filter(change => change.itemId === item.id && change.spaceId === db?.spaceId && !item.history.some(activity => activity.id === change.key)).reduce((current, change) => ({ ...current, quantity: Math.max(0, (current.quantity ?? 0) - change.amount) }), item)) : storedItems;
  const members = membersQ.data ?? []; const me = db?.members.find(m => m.id === db.userId); const myRole = spaceQ.data?.adminIds.includes(db?.userId ?? '') ? 'admin' : 'member';
  const detailQ = useQuery({ queryKey: [...keys.detail, selectedId], queryFn: () => api.getItemWithPhoto(selectedId!), enabled: !!db?.spaceId && !!selectedId });
  const selected = detailQ.data ?? items.find(i => i.id === selectedId);
  const [sheet, setSheet] = useState<'quantity' | 'borrow' | 'handover' | 'report' | 'restore' | 'owner' | null>(null); const [quantityMode, setQuantityMode] = useState<'use' | 'restock'>('use'); const [amount, setAmount] = useState(1); const [borrowError, setBorrowError] = useState(''); const [restoreNote, setRestoreNote] = useState(''); const [ownerChoice, setOwnerChoice] = useState<string | null>(null);
  const [form, setForm] = useState<ItemInput>(emptyForm); const [editingId, setEditingId] = useState<string | null>(null); const [spaceName, setSpaceName] = useState(''); const [invite, setInvite] = useState(''); const [inviteExpiry, setInviteExpiry] = useState<string | null>(null); const [inviteSpaceId, setInviteSpaceId] = useState<string | null>(null); const [inviteId, setInviteId] = useState<string | null>(null);
  const [spaceKind, setSpaceKind] = useState<SpaceKind>('household'); const [spaceFlow, setSpaceFlow] = useState<'create' | 'join' | 'chooser' | null>(null);
  const [joinPreview, setJoinPreview] = useState<{ code: string; data: api.InvitePreview } | null>(null); const [previewing, setPreviewing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false); const [deleteName, setDeleteName] = useState('');
  const [adminOverlay, setAdminOverlay] = useState<SpaceAdminMode>(null); const [adminMemberId, setAdminMemberId] = useState<string | null>(null); const [custodianChoice, setCustodianChoice] = useState<string | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false); const [profileName, setProfileName] = useState(''); const [profileEmail, setProfileEmail] = useState(''); const [profileNotice, setProfileNotice] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false); const [currentPassword, setCurrentPassword] = useState(''); const [nextPassword, setNextPassword] = useState(''); const [confirmNextPassword, setConfirmNextPassword] = useState('');
  const [addReturnTab, setAddReturnTab] = useState<Tab>('Items');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [displayName, setDisplayName] = useState(''); const [authNotice, setAuthNotice] = useState(''); const [recoveryMode, setRecoveryMode] = useState(false); const [newInvite, setNewInvite] = useState('');
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('All'); const [category, setCategory] = useState('All'); const [location, setLocation] = useState('All');
  const [reminderNow, setReminderNow] = useState(() => Date.now());
  const [kindFilter, setKindFilter] = useState('all'); const [showFilters, setShowFilters] = useState(false); const [requestSegment, setRequestSegment] = useState('approve'); const [copyNotice, setCopyNotice] = useState('');
  const [error, setError] = useState(''); const [undo, setUndo] = useState<{ itemId: string; activityId: string } | null>(null);
  useEffect(() => { if (!cacheKey) return; let mounted = true; void AsyncStorage.getItem(cacheKey).then(raw => { if (!mounted || !raw) return; try { const data: Item[] = JSON.parse(raw); if (Array.isArray(data)) setSavedItems({ key: cacheKey, data }); } catch { /* Ignore invalid local cache. */ } }); return () => { mounted = false; }; }, [cacheKey]);
  useEffect(() => { if (!cacheKey || !itemsQ.data || !db?.spaceId || !itemsQ.data.every(item => item.spaceId === db.spaceId)) return; void AsyncStorage.setItem(cacheKey, JSON.stringify(itemsQ.data)); }, [cacheKey, db?.spaceId, itemsQ.data]);
  useEffect(() => { const userId = db?.userId; if (!userId) return; let mounted = true; void AsyncStorage.getItem(`hestia:pending-uses:${userId}`).then(raw => { if (!mounted) return; try { const data: PendingUse[] = raw ? JSON.parse(raw) : []; setPendingUses(Array.isArray(data) ? data : []); } catch { setPendingUses([]); } setQueueOwner(userId); }); return () => { mounted = false; }; }, [db?.userId]);
  useEffect(() => {
    const userId = db?.userId;
    if (offline || !userId || queueOwner !== userId || !pendingUses.length || syncingUses.current) return;
    syncingUses.current = true;
    const flush = async () => {
      let remaining = pendingUses;
      for (const entry of pendingUses) {
        try {
          await api.recordUsage(entry.itemId, entry.amount, entry.key);
          remaining = remaining.filter(change => change.key !== entry.key);
          await AsyncStorage.setItem(`hestia:pending-uses:${userId}`, JSON.stringify(remaining));
          setPendingUses(remaining);
        } catch (cause) { if (!offline) setError(`Saved usage could not sync: ${message(cause)}`); break; }
      }
      syncingUses.current = false;
      void qc.invalidateQueries({ queryKey: keys.items });
      void qc.invalidateQueries({ queryKey: keys.detail });
    };
    void flush();
  }, [db?.userId, offline, pendingUses, qc, queueOwner]);
  const activeSpaceId = db?.spaceId;
  const inviteCacheKey = db?.userId && activeSpaceId ? `hestia:invite:${db.userId}:${activeSpaceId}` : null;
  const inviteIsActive = !inviteId || invitesQ.data?.some(row => row.id === inviteId && !row.revokedAt && Date.parse(row.expiresAt) > reminderNow && row.uses < row.maxUses);
  const visibleInvite = inviteSpaceId === db?.spaceId && inviteExpiry && Date.parse(inviteExpiry) > reminderNow && inviteIsActive ? newInvite : '';
  useEffect(() => { if (!inviteCacheKey || !activeSpaceId) return; const spaceId = activeSpaceId; let mounted = true; void AsyncStorage.getItem(inviteCacheKey).then(raw => { if (!mounted || !raw) return; try { const saved = JSON.parse(raw) as api.SpaceInvite; if (saved.code && saved.id && Date.parse(saved.expiresAt) > Date.now()) { setNewInvite(saved.code); setInviteId(saved.id); setInviteExpiry(saved.expiresAt); setInviteSpaceId(spaceId); } } catch { /* Ignore invalid local invite data. */ } }); return () => { mounted = false; }; }, [inviteCacheKey, activeSpaceId]);
  const rememberInvite = async (spaceId: string, issued: api.SpaceInvite) => { setNewInvite(issued.code); setInviteId(issued.id); setInviteExpiry(issued.expiresAt); setInviteSpaceId(spaceId); if (db?.userId) await AsyncStorage.setItem(`hestia:invite:${db.userId}:${spaceId}`, JSON.stringify(issued)).catch(cause => console.warn('Could not cache invite on device', cause)); };
  useEffect(() => {
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => { if (!db?.userId) return; void enablePhoneNotifications(db.userId).catch(cause => console.warn('Phone notification setup failed', cause)); }, [db?.userId]);
  useEffect(() => { const subscription = onPhoneNotificationOpen(itemId => { setTab('Reminders'); if (itemId) setSelectedId(itemId); }); return () => subscription.remove(); }, []);
  useEffect(() => {
    const handleUrl = async (url: string) => {
      const parsed = new URL(url);
      const params = new URLSearchParams(parsed.hash.slice(1));
      const sharedCode = parsed.searchParams.get('invite');
      if (sharedCode) { setInvite(sharedCode); setJoinPreview(null); setSpaceFlow('join'); }
      if (params.get('type') === 'recovery' && !params.has('error')) setRecoveryMode(true);
      if (params.get('error_code') === 'otp_expired') {
        setError('This confirmation link has expired or was already used. Enter your email and request a new link.');
      } else if (params.has('error')) {
        setError(params.get('error_description')?.replace(/\+/g, ' ') || 'Email confirmation failed. Request a new link.');
      } else if (Platform.OS !== 'web' && params.has('access_token') && params.has('refresh_token')) {
        const { error: sessionError } = await getSupabaseClient().auth.setSession({ access_token: params.get('access_token')!, refresh_token: params.get('refresh_token')! });
        if (sessionError) setError(sessionError.message);
      }
      if (Platform.OS === 'web' && params.has('error')) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    if (Platform.OS === 'web') void handleUrl(window.location.href);
    else void Linking.getInitialURL().then(url => { if (url) void handleUrl(url); });
    const subscription = Linking.addEventListener('url', event => { void handleUrl(event.url); });
    return () => subscription.remove();
  }, []);
  const [confirmation, setConfirmation] = useState<{ title: string; detail: string; fn: () => Promise<unknown>; after?: () => void } | null>(null);
  useEffect(() => NetInfo.addEventListener(s => setOffline(s.isConnected === false || s.isInternetReachable === false)), []);
  useEffect(() => { const initial = setTimeout(() => setReminderNow(Date.now()), 0); const timer = setInterval(() => setReminderNow(Date.now()), 60_000); return () => { clearTimeout(initial); clearInterval(timer); }; }, []);
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), 8000); return () => clearTimeout(timer); }, [undo]);
  const refresh = async () => {
    const visible = new Set<string>([...keys.items, ...keys.detail]);
    if (['Home', 'Requests', 'Reminders'].includes(tab)) [...keys.requests, ...keys.reminders, ...keys.notifications].forEach(key => visible.add(key));
    if (tab === 'Space') [...keys.space, ...keys.members, ...keys.invites, ...keys.spaces].forEach(key => visible.add(key));
    if (tab === 'Profile') [...keys.session, ...keys.account, ...keys.spaces].forEach(key => visible.add(key));
    if (!db?.userId) keys.session.forEach(key => visible.add(key));
    await Promise.all(Object.values(keys).map(queryKey => qc.invalidateQueries({ queryKey, refetchType: visible.has(queryKey[0]) ? 'active' : 'none' })));
  };
  const applySpaceSession = (next: Session) => { qc.setQueryData(keys.session, next); [keys.items, keys.members, keys.space, keys.invites, keys.requests, keys.reminders, keys.notifications, keys.detail].forEach(queryKey => qc.removeQueries({ queryKey })); };
  const mutation = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: () => { setError(''); void refresh(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }, onError: e => { if (e instanceof api.PhotoUploadError) { setEditingId(e.item.id); void refresh(); } setError(message(e)); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); } });
  const act = (fn: () => Promise<unknown>, after?: () => void) => mutation.mutate(fn, { onSuccess: () => after?.() });
  const borrow = useMutation({ mutationFn: ({ itemId, dueAt, note }: { itemId: string; dueAt: string; note: string }) => api.requestBorrow(itemId, dueAt, note), onMutate: async ({ itemId, dueAt, note }) => { await qc.cancelQueries({ queryKey: keys.items }); const old = qc.getQueryData<Item[]>(keys.items); qc.setQueryData<Item[]>(keys.items, xs => xs?.map(x => x.id === itemId ? { ...x, loan: { id: 'optimistic', borrowerId: db!.userId!, state: 'Requested', requestedAt: new Date().toISOString(), dueAt, note } } : x)); return { old }; }, onError: (e, _input, ctx) => { qc.setQueryData(keys.items, ctx?.old); setBorrowError(message(e)); }, onSettled: () => { qc.invalidateQueries({ queryKey: keys.items }); qc.invalidateQueries({ queryKey: keys.requests }); qc.invalidateQueries({ queryKey: keys.reminders }); qc.invalidateQueries({ queryKey: keys.detail }); } });
  const confirm = (title: string, detail: string, fn: () => Promise<unknown>, after?: () => void) => setConfirmation({ title, detail, fn, after });
  const edit = (item?: Item) => { setAddReturnTab(tab); setEditingId(item?.id ?? null); setForm(item ? { name: item.name, kind: item.kind, category: item.category, location: item.location, visibility: item.visibility, photoUri: item.photoUri, quantity: item.quantity, unit: item.unit, lowThreshold: item.lowThreshold, custodianId: item.custodianId } : emptyForm); setSelectedId(null); setTab('Add'); };
  const go = (next: Tab) => { setSelectedId(null); setError(''); if (next === 'Add') { if (tab !== 'Add') edit(); } else setTab(next); };
  const name = (id?: string) => db?.members.find(m => m.id === id)?.name ?? 'A member';
  const keeper = (i: Item) => [i.ownerId, i.custodianId].includes(db?.userId ?? '');
  const field = (label: string, value: string, change: (v: string) => void, hint?: string, numeric?: boolean) => <View style={{ gap: 6 }}><Text style={{ color: c.text, fontWeight: '700' }}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} placeholder={hint} placeholderTextColor={c.muted} keyboardType={numeric ? 'decimal-pad' : 'default'} style={{ backgroundColor: c.surface, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 14, minHeight: 50, padding: 12, fontSize: 16 }} /></View>;
  const choices = (opts: string[], value: string, change: (v: string) => void) => <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, minHeight: 44 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>{opts.map(v => <Chip key={v} label={v} scheme={scheme} selected={v === value} onPress={() => change(v)} />)}</ScrollView>;
  const wrap = (children: React.ReactNode) => <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 90 }}>{children}</ScrollView>;
  const choosePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: .7 });
      if (result.canceled) return;
      const context = ImageManipulator.manipulate(result.assets[0].uri, { maxWidth: 1600, maxHeight: 1600 });
      const image = await context.renderAsync();
      const photo = await image.saveAsync({ format: SaveFormat.JPEG, compress: .72, base64: true });
      if (!photo.base64) throw new Error('Could not read the selected photo.');
      if (photo.base64.length * .75 > 5_000_000) throw new Error('That photo is too large. Choose a smaller one.');
      setForm(current => ({ ...current, photoUri: photo.uri, photoBase64: photo.base64, photoMime: 'image/jpeg' }));
      setError('');
    } catch (cause) { setError(message(cause)); }
  };
  const saveItem = () => act(() => editingId ? api.updateItem(editingId, form) : api.addItem(form), () => { setTab('Items'); setEditingId(null); setForm(emptyForm); });
  const queueUse = async (item: Item, quantity: number) => {
    if (!db?.userId || !db.spaceId || queueOwner !== db.userId) { setError('Local changes are still loading. Try again.'); return; }
    const entry: PendingUse = { key: `offline-use-${Date.now()}-${Math.random().toString(36).slice(2)}`, spaceId: db.spaceId, itemId: item.id, amount: quantity };
    try {
      const next = [...pendingUses, entry];
      await AsyncStorage.setItem(`hestia:pending-uses:${db.userId}`, JSON.stringify(next));
      setPendingUses(next);
      const update = (current: Item) => { const before = current.quantity ?? 0; return { ...current, quantity: before - quantity, history: [{ id: entry.key, at: new Date().toISOString(), actorId: db.userId!, kind: 'Used', before, after: before - quantity }, ...current.history] }; };
      qc.setQueryData<Item[]>(keys.items, current => (current ?? items).map(row => row.id === item.id ? update(row) : row));
      qc.setQueryData<Item>([...keys.detail, item.id], current => current ? update(current) : undefined);
      setSavedItems({ key: cacheKey!, data: items.map(row => row.id === item.id ? update(row) : row) });
      setSheet(null);
      setError('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (cause) { setError(`Could not save usage on this phone: ${message(cause)}`); }
  };
  const openQuantity = (item: Item, mode: 'use' | 'restock') => { setSelectedId(item.id); setAmount(1); setQuantityMode(mode); setSheet('quantity'); };
  const openSpaceFlow = (mode: 'create' | 'join') => { setSpacePicker(false); setError(''); setJoinPreview(null); setSpaceFlow(mode); };
  const findSpace = async () => { setPreviewing(true); setError(''); try { const code = invite.trim(); const data = await api.previewInvite(code); setJoinPreview({ code, data }); } catch (cause) { setJoinPreview(null); setError(message(cause)); } finally { setPreviewing(false); } };
  const switchCurrentSpace = (id: string) => act(async () => { applySpaceSession(await api.switchSpace(id)); }, () => { setSpaceFlow(null); setSelectedId(null); setTab('Home'); });
  const createNewSpace = () => act(async () => { const created = await api.createSpace(spaceName.trim(), spaceKind); applySpaceSession(created); await rememberInvite(created.spaceId!, created.invite); }, () => { setSpaceName(''); setSpaceFlow(null); setTab('Space'); });
  const joinNewSpace = () => act(async () => { applySpaceSession(await api.joinSpace(invite)); }, () => { setInvite(''); setJoinPreview(null); setSpaceFlow(null); setTab('Space'); });
  const openProfileEdit = () => { setProfileNotice(''); setError(''); setProfileName(me?.name ?? ''); setProfileEmail(accountQ.data?.email ?? ''); setProfileEditOpen(true); };
  const saveProfile = () => act(async () => { if (profileName.trim() !== me?.name) await api.updateProfile(profileName); if (profileEmail.trim().toLowerCase() !== accountQ.data?.email.toLowerCase()) await api.updateEmail(profileEmail); }, () => { setProfileEditOpen(false); setProfileNotice(profileEmail.trim().toLowerCase() !== accountQ.data?.email.toLowerCase() ? 'Check your new email address to confirm the change.' : 'Profile updated.'); void accountQ.refetch(); });
  const savePassword = () => act(() => api.changePassword(currentPassword, nextPassword), () => { setPasswordOpen(false); setCurrentPassword(''); setNextPassword(''); setConfirmNextPassword(''); setProfileNotice('Password changed.'); });

  if (session.isLoading) return <View style={{ flex: 1, backgroundColor: c.background }} />;
  if (session.isError) return <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}><EmptyState title="Could not open Hestia" body={message(session.error)} action="Try again" onPress={() => session.refetch()} scheme={scheme} /></SafeAreaView>;
  if (!db?.userId || recoveryMode) return <AuthScreen
    email={email}
    password={password}
    displayName={displayName}
    error={error}
    notice={authNotice}
    pending={mutation.isPending}
    recovery={recoveryMode}
    onEmailChange={setEmail}
    onPasswordChange={setPassword}
    onNameChange={setDisplayName}
    onClearMessages={() => { setError(''); setAuthNotice(''); }}
    onSignIn={() => { setAuthNotice(''); act(() => api.signIn(email, password)); }}
    onRegister={() => { setAuthNotice(''); act(async () => { const result = await api.register(displayName, email, password); if (result.needsConfirmation) setAuthNotice('Check your email to confirm your account, then log in.'); }); }}
    onResendConfirmation={() => act(async () => { await api.resendConfirmation(email); setAuthNotice('A new confirmation email is on its way. Open the newest link.'); })}
    onRequestReset={() => act(async () => { await api.requestPasswordReset(email); setAuthNotice('Check your email for a password reset link.'); })}
    onUpdatePassword={() => act(async () => { await api.updatePassword(password); setPassword(''); setRecoveryMode(false); })}
    onCancelRecovery={() => act(api.signOut, () => setRecoveryMode(false))}
  />;
  if (spaceFlow === 'create' || spaceFlow === 'join' || (!db.spaceId && spaceFlow !== 'chooser')) return <SpaceFlowScreen
    mode={spaceFlow === 'join' ? 'join' : 'create'} scheme={scheme} name={spaceName} kind={spaceKind} code={invite}
    preview={joinPreview?.code === invite.trim() ? joinPreview.data : null} previewing={previewing} pending={mutation.isPending} error={error}
    spaces={(spacesQ.data ?? []).filter(space => space.id !== db.spaceId)} onName={setSpaceName} onKind={setSpaceKind}
    onCode={value => { setInvite(value); setJoinPreview(null); setError(''); }} onPreview={() => void findSpace()}
    onSubmit={spaceFlow === 'join' ? joinNewSpace : createNewSpace}
    onMode={mode => { setError(''); setJoinPreview(null); setSpaceFlow(mode); }}
    onSwitch={switchCurrentSpace}
    onBack={() => { setError(''); setSpaceFlow(db.spaceId ? null : 'chooser'); }}
  />;
  if (!db.spaceId) return <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>{wrap(<>
    <Text style={{ color: c.text, fontSize: 32, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>Your Spaces</Text>
    <Text style={{ color: c.muted, fontSize: 16 }}>Choose a Space or make a new one.</Text>
    {(spacesQ.data ?? []).map(space => <Button key={space.id} label={`Open ${space.name}`} kind="secondary" scheme={scheme} onPress={() => switchCurrentSpace(space.id)} />)}
    <Button label="Create a Space" scheme={scheme} onPress={() => openSpaceFlow('create')} />
    <Button label="Join a Space" scheme={scheme} kind="secondary" onPress={() => openSpaceFlow('join')} />
    <Button label="Sign out" scheme={scheme} kind="quiet" onPress={() => act(api.signOut)} />
  </>)}</SafeAreaView>;

  let content: React.ReactNode;
  if (selected?.kind === 'consumable') content = <ConsumableDetail item={selected} scheme={scheme} memberName={name} onBack={() => setSelectedId(null)} onUse={() => openQuantity(selected, 'use')} onRestock={() => openQuantity(selected, 'restock')} onEdit={keeper(selected) || myRole === 'admin' ? () => edit(selected) : undefined} />;
  else if (selected) {
    const status = itemStatus(selected);
    const steps = ['Requested', 'Reserved', 'Borrowed', 'Ready to return', 'Returned'] as const;
    const currentStep = steps.indexOf(selected.loan?.state as typeof steps[number]);
    content = <CoreScreen title={selected.name} variant="detail" scheme={scheme} onBack={() => setSelectedId(null)}>
      <CoreCard scheme={scheme} inset={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 92, height: 92, borderRadius: 18, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {selected.photoUri ? <Image source={{ uri: selected.photoUri }} style={{ width: 92, height: 92 }} /> : <Ionicons name="cube-outline" size={37} color={c.muted} />}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <CoreStatus status={status} scheme={scheme} />
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }} numberOfLines={2}>{selected.category || 'Uncategorized'} · {selected.location || 'No location'}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }} numberOfLines={2}>{selected.visibility === 'private' ? 'Private' : 'Shared'} · {selected.custodianId ? `Custodian ${name(selected.custodianId)}` : `Owner ${name(selected.ownerId)}`}</Text>
          </View>
        </View>
      </CoreCard>
      <>
        <CoreCard scheme={scheme} inset={16}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 16 }}>Borrowing progress</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 3 }}>{steps.map((step, index) => <View key={step} style={{ flex: 1, alignItems: 'center', gap: 7 }}><View style={{ width: 23, height: 23, borderRadius: 12, borderWidth: 1.5, borderColor: index <= currentStep ? core.plum : c.border, backgroundColor: index <= currentStep ? core.plum : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{index < currentStep && <Ionicons name="checkmark" size={13} color={core.cream} />}</View><Text numberOfLines={2} style={{ color: index <= currentStep ? c.text : c.muted, fontSize: 10, textAlign: 'center', lineHeight: 13 }}>{step}</Text></View>)}</View>
          {selected.loan && <Text style={{ color: c.muted, fontSize: 12, marginTop: 14 }}>{name(selected.loan.borrowerId)} · {selected.loan.dueAt ? `Due ${new Date(selected.loan.dueAt).toLocaleDateString()}` : status}</Text>}
        </CoreCard>
        {selected.visibility === 'shared' && !selected.damaged && !active(selected) && selected.loan?.borrowerId !== db.userId && !keeper(selected) && <Button label="Request to borrow" scheme={scheme} onPress={() => { setBorrowError(''); setSheet('borrow'); }} />}
        {selected.loan?.state === 'Requested' && keeper(selected) && <><Button label="Approve request" scheme={scheme} onPress={() => act(() => api.approveRequest(selected.id))} /><Button label="Reject request" kind="secondary" scheme={scheme} onPress={() => confirm('Reject request?', 'The borrower will see this decision.', () => api.rejectRequest(selected.id))} /></>}
        {selected.loan?.state === 'Requested' && selected.loan.borrowerId === db.userId && <Button label="Cancel request" kind="secondary" scheme={scheme} onPress={() => act(() => api.cancelRequest(selected.id))} />}
        {selected.loan?.state === 'Reserved' && keeper(selected) && <Button label="Confirm handover" scheme={scheme} onPress={() => setSheet('handover')} />}
        {selected.loan?.state === 'Borrowed' && selected.loan.borrowerId === db.userId && <Button label="Ready to return" scheme={scheme} onPress={() => act(() => api.readyToReturn(selected.id))} />}
        {selected.loan?.state === 'Ready to return' && keeper(selected) && <Button label="Confirm receipt" scheme={scheme} onPress={() => confirm('Confirm return?', 'The item will be available again.', () => api.confirmReturn(selected.id))} />}
        {['Borrowed', 'Ready to return'].includes(selected.loan?.state ?? '') && keeper(selected) && <Button label="Report lost or damaged" kind="quiet" scheme={scheme} onPress={() => { setError(''); setSheet('report'); }} />}
        {selected.damaged && keeper(selected) && <Button label="Restore availability" kind="secondary" scheme={scheme} onPress={() => { setRestoreNote(''); setError(''); setSheet('restore'); }} />}
      </>
      {(keeper(selected) || myRole === 'admin') && <Button label="Edit item" kind="secondary" scheme={scheme} onPress={() => edit(selected)} />}
      {myRole === 'admin' && selected.visibility === 'shared' && <Button label="Transfer owner" kind="quiet" scheme={scheme} onPress={() => { setOwnerChoice(selected.ownerId); setSheet('owner'); }} />}
      {(selected.ownerId === db.userId || myRole === 'admin') && <Button label="Archive item" kind="quiet" scheme={scheme} onPress={() => confirm('Archive item?', 'The item will leave the active list. Its requests and history remain saved. Resolve open requests first.', () => api.archiveItem(selected.id), () => { setSelectedId(null); setTab('Items'); })} />}
      <CoreSectionTitle scheme={scheme}>History</CoreSectionTitle>
      <CoreCard scheme={scheme}>{selected.history.length ? selected.history.map((h, index) => <View key={h.id} style={{ padding: 15, borderTopWidth: index ? 1 : 0, borderColor: c.border }}><Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>{h.kind}</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{name(h.actorId)} · {new Date(h.at).toLocaleString()}{h.before !== undefined ? ` · ${h.before} → ${h.after}` : ''}</Text>{h.note && <Text style={{ color: c.text, marginTop: 6, fontSize: 13 }}>{h.note}</Text>}</View>) : <Text style={{ color: c.muted, padding: 16 }}>No activity yet.</Text>}</CoreCard>
    </CoreScreen>;
  }
  else if (tab === 'Home') {
    const attention = items.filter(i => i.loan && (['Requested', 'Ready to return'].includes(i.loan.state) && keeper(i) || ['Borrowed', 'Ready to return'].includes(i.loan.state) && i.loan.borrowerId === db.userId && !!i.loan.dueAt && Date.parse(i.loan.dueAt) <= reminderNow + 86400000));
    const low = items.filter(i => itemStatus(i) === 'Low stock');
    const loans = items.filter(i => i.loan && ['Reserved', 'Borrowed', 'Ready to return'].includes(i.loan.state));
    const dueCount = db.notifications ? items.filter(i => i.kind === 'returnable' && i.loan?.dueAt && ['Borrowed', 'Ready to return'].includes(i.loan.state) && (keeper(i) || i.loan.borrowerId === db.userId) && Date.parse(i.loan.dueAt) <= reminderNow + 2 * 86400000).length : 0;
    const requestCount = (requestsQ.data ?? []).filter(r => r.state === 'Requested' && items.some(i => i.id === r.itemId && keeper(i))).length;
    const notificationCount = Math.max(dueCount + requestCount + (db.lowStockAlerts ? low.length : 0), (notificationsQ.data ?? []).filter(row => !row.readAt).length);
    content = <HomeScreen
      firstName={me?.name?.trim().split(/\s+/)[0] || 'Friend'}
      spaceName={spaceQ.data?.name ?? 'Your Space'}
      attention={attention}
      low={low}
      showLowStock={db.lowStockAlerts}
      loans={loans}
      memberName={name}
      notificationCount={notificationCount}
      onNotifications={() => { go('Reminders'); if (!offline) { void remindersQ.refetch(); void requestsQ.refetch(); void notificationsQ.refetch(); } }}
      onSearch={() => go('Items')}
      onSpace={() => setSpacePicker(true)}
      onItem={i => setSelectedId(i.id)}
      onReview={i => setSelectedId(i.id)}
      onReturn={i => {
        setSelectedId(i.id);
        if (i.loan?.state === 'Ready to return' && keeper(i)) confirm('Confirm return?', 'The item will be available again.', () => api.confirmReturn(i.id));
        else if (i.loan?.state === 'Borrowed' && i.loan.borrowerId === db.userId) act(() => api.readyToReturn(i.id));
      }}
      onRestock={i => { setSelectedId(i.id); setAmount(1); setQuantityMode('restock'); setSheet('quantity'); }}
    />;
  }
  else if (tab === 'Items') {
    const categories = ['All', ...new Set(items.map(i => i.category).filter(Boolean))];
    const locations = ['All', ...new Set(items.map(i => i.location).filter(Boolean))];
    const shown = items.filter(i =>
      i.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (kindFilter === 'all' || i.kind === kindFilter) &&
      (category === 'All' || i.category === category) &&
      (location === 'All' || i.location === location) &&
      (filter === 'All' || filter === 'Mine' && i.ownerId === db.userId || filter === 'Low stock' && itemStatus(i) === 'Low stock' || filter === 'Available' && itemStatus(i) === 'Available' || filter === 'Borrowed' && ['Borrowed', 'Overdue', 'Ready to return'].includes(itemStatus(i)))
    );
    content = itemsQ.isError && items.length === 0 && !offline ? <ItemsState kind="error" scheme={scheme} onBack={() => go('Home')} onAction={() => void itemsQ.refetch()} /> : !itemsQ.isLoading && items.length === 0 && !offline ? <ItemsState kind="empty" scheme={scheme} onBack={() => go('Home')} onAction={() => go('Add')} onInvite={myRole === 'admin' ? () => go('Space') : undefined} /> : <FlatList
      style={{ flex: 1, backgroundColor: c.background }}
      data={shown}
      keyExtractor={i => i.id}
      renderItem={({ item }) => <View style={{ marginHorizontal: 20 }}><CoreCard scheme={scheme}><CoreItemRow item={item} status={itemStatus(item)} subtitle={`${item.location || 'No location'} · ${item.category || 'Uncategorized'}`} scheme={scheme} onPress={() => setSelectedId(item.id)} /></CoreCard></View>}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      contentContainerStyle={{ paddingBottom: 122, flexGrow: 1 }}
      ListHeaderComponent={<>
        <CoreHeader title="Items" variant="items" scheme={scheme} onBack={() => go('Home')} />
        {offline && <ItemsOfflineBanner />}
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, gap: 12 }}>
          <View style={{ minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name="search" size={21} color={c.text} /><TextInput accessibilityLabel="Search items" value={search} onChangeText={setSearch} placeholder="Search items" placeholderTextColor={c.muted} returnKeyType="search" style={{ flex: 1, minHeight: 48, color: c.text, fontSize: 15 }} /></View>
          <CoreSegment scheme={scheme} value={kindFilter} onChange={setKindFilter} options={[{ label: 'All', value: 'all' }, { label: 'Consumables', value: 'consumable' }, { label: 'Returnables', value: 'returnable' }]} />
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters(value => !value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>Filters{filter !== 'All' || category !== 'All' || location !== 'All' ? ' · Active' : ''}</Text><Ionicons name={showFilters ? 'chevron-up' : 'options-outline'} size={19} color={c.text} /></Pressable>
          {showFilters && <CoreCard scheme={scheme} inset={14}><View style={{ gap: 10 }}><Text style={{ color: c.text, fontWeight: '700' }}>Status</Text>{choices(['All', 'Mine', 'Available', 'Borrowed', 'Low stock'], filter, setFilter)}<Text style={{ color: c.text, fontWeight: '700' }}>Category</Text>{choices(categories, category, setCategory)}<Text style={{ color: c.text, fontWeight: '700' }}>Location</Text>{choices(locations, location, setLocation)}</View></CoreCard>}
        </View>
      </>}
      ListEmptyComponent={itemsQ.isLoading ? <View style={{ marginHorizontal: 20 }}><Skeleton scheme={scheme} /></View> : offline && !items.length ? <EmptyState title="No saved items" body="Reconnect to load your Space items." action="Try again" onPress={() => void itemsQ.refetch()} scheme={scheme} /> : <EmptyState title="No items found" body="Try another search or clear your filters." action="Clear filters" onPress={() => { setSearch(''); setKindFilter('all'); setFilter('All'); setCategory('All'); setLocation('All'); }} scheme={scheme} />}
      ListFooterComponent={offline && items.length ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 23, paddingTop: 14 }}>You can record usage while offline. {pendingUses.filter(change => change.spaceId === db.spaceId).length} {pendingUses.filter(change => change.spaceId === db.spaceId).length === 1 ? 'change' : 'changes'} will sync when you are back online. Requests and approvals need a connection.</Text> : undefined}
    />;
  }
  else if (tab === 'Add') content = <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <CoreScreen title={editingId ? 'Edit item' : 'Add item'} variant="add" scheme={scheme} onBack={() => go(addReturnTab)}>
      {editingId ? <CoreStatus status={form.kind === 'consumable' ? 'Consumable' : 'Returnable'} scheme={scheme} /> : <CoreSegment scheme={scheme} value={form.kind} onChange={v => setForm(current => ({ ...current, kind: v as Item['kind'] }))} options={[{ label: 'Consumable', value: 'consumable' }, { label: 'Returnable', value: 'returnable' }]} />}
      <Pressable accessibilityRole="button" accessibilityLabel={form.photoUri ? 'Change photo' : 'Add a photo'} onPress={() => void choosePhoto()} style={({ pressed }) => ({ minHeight: 118, borderWidth: 1.5, borderColor: c.border, borderStyle: 'dashed', borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, opacity: pressed ? .7 : 1, overflow: 'hidden' })}>
        {form.photoUri ? <Image source={{ uri: form.photoUri }} style={{ width: '100%', height: 118, position: 'absolute' }} /> : <><Ionicons name="camera-outline" color={c.text} size={25} /><Text style={{ color: c.text, fontSize: 14, fontWeight: '700', marginTop: 6 }}>Add a photo</Text></>}
      </Pressable>
      <CoreCard scheme={scheme} inset={14}>
        <CoreField label="Name" value={form.name} onChangeText={v => setForm(current => ({ ...current, name: v }))} placeholder="What is it?" scheme={scheme} />
        <CoreField label="Category" value={form.category} onChangeText={v => setForm(current => ({ ...current, category: v }))} placeholder="Tools, kitchen…" scheme={scheme} />
        <CoreField label="Location" value={form.location} onChangeText={v => setForm(current => ({ ...current, location: v }))} placeholder="Where does it live?" scheme={scheme} />
      </CoreCard>
      {form.kind === 'consumable' && <CoreCard scheme={scheme} inset={14}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', marginBottom: 4 }}>Stock details</Text>
        {editingId ? <Text style={{ color: c.muted, fontSize: 13, paddingVertical: 12 }}>Quantity: {form.quantity ?? 0}. Use or restock from the item page.</Text> : <CoreField label="Quantity" value={String(form.quantity ?? 0)} onChangeText={v => setForm(current => ({ ...current, quantity: Number(v) || 0 }))} keyboardType="decimal-pad" scheme={scheme} />}
        <CoreField label="Unit" value={form.unit ?? ''} onChangeText={v => setForm(current => ({ ...current, unit: v }))} placeholder="units" scheme={scheme} />
        <CoreField label="Low stock at" value={String(form.lowThreshold ?? 0)} onChangeText={v => setForm(current => ({ ...current, lowThreshold: Number(v) || 0 }))} keyboardType="decimal-pad" scheme={scheme} />
      </CoreCard>}
      <CoreCard scheme={scheme} inset={15}>
        <CoreSwitchRow title={`Share with ${spaceQ.data?.name ?? 'this Space'}`} detail={form.visibility === 'shared' ? 'Members can find and request it' : 'Only you can see it'} value={form.visibility === 'shared'} onChange={value => setForm(current => ({ ...current, visibility: value ? 'shared' : 'private', custodianId: value ? current.custodianId : undefined }))} scheme={scheme} />
        <View style={{ height: 1, backgroundColor: c.border, marginVertical: 5 }} />
        <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', marginTop: 8 }}>Custodian</Text>
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>Approves requests and returns · {members.find(m => m.id === form.custodianId)?.name ?? 'You'}</Text>
        {myRole === 'admin' && form.visibility === 'shared' && <Pressable accessibilityRole="button" accessibilityLabel="Choose custodian" onPress={() => { setCustodianChoice(form.custodianId ?? null); setAdminOverlay('custodian'); }} style={({ pressed }) => ({ minHeight: 44, marginTop: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: pressed ? .7 : 1 })}><Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{form.custodianId ? members.find(m => m.id === form.custodianId)?.name ?? 'Choose member' : 'Owner looks after this item'}</Text><Ionicons name="chevron-forward" size={18} color={c.text} /></Pressable>}
      </CoreCard>
      <Button label={editingId ? 'Save changes' : 'Save item'} scheme={scheme} disabled={mutation.isPending || !form.name.trim() || !form.category.trim() || !form.location.trim()} onPress={saveItem} />
    </CoreScreen>
  </KeyboardAvoidingView>;
  else if (tab === 'Requests') {
    const visible = (requestsQ.data ?? []).filter(r => items.some(i => i.id === r.itemId));
    const incoming = visible.filter(r => ['Requested', 'Reserved', 'Ready to return'].includes(r.state) && items.some(i => i.id === r.itemId && keeper(i))).sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
    const mine = visible.filter(r => r.borrowerId === db.userId).sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
    const requestRow = (r: api.BorrowRequest, inbox: boolean) => <CoreCard key={r.id} scheme={scheme} inset={11}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <View style={{ width: 47, height: 47, borderRadius: 13, backgroundColor: c.surfaceAlt }} />
        <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{r.itemName}</Text><Text numberOfLines={2} style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{inbox ? name(r.borrowerId) : r.state === 'Requested' ? `Waiting for ${name(items.find(item => item.id === r.itemId)?.custodianId ?? items.find(item => item.id === r.itemId)?.ownerId)}` : `From ${name(items.find(item => item.id === r.itemId)?.ownerId)}`}{r.dueAt && r.state !== 'Requested' ? ` · due ${new Date(r.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</Text></View>
        <CoreStatus status={r.state === 'Borrowed' && r.dueAt && Date.parse(r.dueAt) < reminderNow ? 'Overdue' : r.state === 'Requested' ? 'Pending' : r.state} scheme={scheme} />
      </View>
      {inbox && r.note && <Text style={{ color: c.muted, fontSize: 12, marginTop: 8 }} numberOfLines={2}>{r.note}</Text>}
      {inbox && r.state === 'Requested' && <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}><View style={{ flex: 1 }}><Button label="Approve" scheme={scheme} small onPress={() => act(() => api.actOnRequest(r.id, 'approve'))} /></View><View style={{ flex: 1 }}><Button label="Reject" kind="secondary" scheme={scheme} small onPress={() => confirm('Reject request?', 'The borrower will see this decision.', () => api.actOnRequest(r.id, 'reject'))} /></View></View>}
      {inbox && r.state === 'Reserved' && <View style={{ marginTop: 14 }}><Button label="Confirm handover" scheme={scheme} small onPress={() => act(() => api.actOnRequest(r.id, 'handover'))} /></View>}
      {inbox && r.state === 'Ready to return' && <View style={{ marginTop: 14 }}><Button label="Confirm receipt" scheme={scheme} small onPress={() => confirm('Confirm return?', 'The item will be available again.', () => api.actOnRequest(r.id, 'return'))} /></View>}
      {!inbox && r.state === 'Requested' && <Pressable accessibilityRole="button" accessibilityLabel={`Cancel request for ${r.itemName}`} onPress={() => act(() => api.actOnRequest(r.id, 'cancel'))} style={({ pressed }) => ({ minHeight: 41, marginTop: 12, borderRadius: 23, borderWidth: 1.3, borderColor: c.text, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .7 : 1 })}><Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>Cancel request</Text></Pressable>}
      {!inbox && r.state === 'Borrowed' && <View style={{ marginTop: 14 }}><Button label="Mark ready to return" scheme={scheme} small onPress={() => act(() => api.actOnRequest(r.id, 'ready'))} /></View>}
    </CoreCard>;
    content = <CoreScreen title={requestSegment === 'mine' ? 'My requests' : 'Requests'} variant={requestSegment === 'mine' ? 'my-requests' : 'requests'} scheme={scheme} onBack={() => go('Home')}>
      <CoreSegment scheme={scheme} value={requestSegment} onChange={setRequestSegment} options={[{ label: `To approve${incoming.length ? ` · ${incoming.length}` : ''}`, value: 'approve' }, { label: 'My requests', value: 'mine' }]} />
      {requestsQ.isLoading ? <Skeleton scheme={scheme} /> : requestsQ.isError ? <EmptyState title="Requests could not load" body={message(requestsQ.error)} action="Try again" onPress={() => requestsQ.refetch()} scheme={scheme} /> : requestSegment === 'approve' ? incoming.length ? incoming.map(r => requestRow(r, true)) : <EmptyState title="No requests waiting" body="You are caught up." action="Browse items" onPress={() => go('Items')} scheme={scheme} /> : mine.length ? mine.map(r => requestRow(r, false)) : <EmptyState title="No requests yet" body="Find something to borrow." action="Find an item" onPress={() => go('Items')} scheme={scheme} />}
    </CoreScreen>;
  }
  else if (tab === 'Reminders') {
    const now = reminderNow;
    const ownDueIds = new Set((remindersQ.data ?? []).map(reminder => reminder.itemId));
    const dueItems = items.filter(item => item.kind === 'returnable' && item.loan?.dueAt && ['Borrowed', 'Ready to return'].includes(item.loan.state) && (keeper(item) || ownDueIds.has(item.id) || remindersQ.isError && item.loan.borrowerId === db.userId));
    const today: ReminderEntry[] = dueItems.filter(item => Date.parse(item.loan!.dueAt!) <= now + 2 * 86400000).sort((a, b) => Date.parse(a.loan!.dueAt!) - Date.parse(b.loan!.dueAt!)).map(item => {
      const due = Date.parse(item.loan!.dueAt!); const late = due < now; const days = Math.max(1, Math.ceil((now - due) / 86400000));
      const when = new Date(due).toLocaleDateString(undefined, { weekday: 'short' });
      const day = new Date(due).toDateString();
      const dueLabel = day === new Date(now).toDateString() ? 'today' : day === new Date(now + 86400000).toDateString() ? 'tomorrow' : when;
      return { id: `due-${item.id}`, icon: 'time-outline', title: late ? `${item.name} is ${days} day${days === 1 ? '' : 's'} late` : `${item.name} due ${dueLabel}`, detail: `${name(item.loan!.borrowerId)} · due ${when}`, status: late ? 'Overdue' : undefined, onPress: () => setSelectedId(item.id) };
    });
    (requestsQ.data ?? []).filter(request => request.state === 'Requested' && items.some(item => item.id === request.itemId && keeper(item))).forEach(request => today.push({ id: `request-${request.id}`, icon: 'chatbox-outline', title: `${name(request.borrowerId)} wants ${request.itemName}`, detail: 'Tap to review', onPress: () => { setRequestSegment('approve'); go('Requests'); } }));
    const earlier: ReminderEntry[] = db.lowStockAlerts ? items.filter(item => item.kind === 'consumable' && itemStatus(item) === 'Low stock').map(item => ({ id: `stock-${item.id}`, icon: 'water-outline' as const, title: `${item.name} is running low`, detail: `${quantityLabel(item)} left`, onPress: () => setSelectedId(item.id) })) : [];
    items.flatMap(item => item.history.filter(activity => activity.kind === 'Returned' && now - Date.parse(activity.at) < 7 * 86400000).map(activity => ({ item, activity }))).sort((a, b) => Date.parse(b.activity.at) - Date.parse(a.activity.at)).slice(0, 4).forEach(({ item, activity }) => {
      const entry: ReminderEntry = { id: `return-${activity.id}`, icon: 'checkmark-outline', title: `${name(activity.actorId)} returned ${item.name}`, detail: new Date(activity.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), onPress: () => setSelectedId(item.id) };
      (new Date(activity.at).toDateString() === new Date().toDateString() ? today : earlier).push(entry);
    });
    const persistent = notificationsQ.data ?? [];
    const handled = new Set(persistent.map(row => `${row.kind}:${row.itemId ?? ''}`));
    const filteredToday = today.filter(row => !((row.id.startsWith('due-') && (handled.has(`due_soon:${row.id.slice(4)}`) || handled.has(`overdue:${row.id.slice(4)}`))) || (row.id.startsWith('request-') && persistent.some(event => event.kind === 'request' && event.requestId === row.id.slice(8)))));
    const filteredEarlier = earlier.filter(row => !((row.id.startsWith('stock-') && handled.has(`low_stock:${row.id.slice(6)}`)) || (row.id.startsWith('return-') && persistent.some(event => event.kind === 'return_confirmed' && event.itemId && items.some(item => item.id === event.itemId && item.history.some(activity => activity.id === row.id.slice(7)))))));
    persistent.forEach(row => {
      const icon: ReminderEntry['icon'] = row.kind === 'request' ? 'chatbox-outline' : row.kind === 'low_stock' ? 'water-outline' : row.kind === 'return_confirmed' ? 'checkmark-outline' : 'time-outline';
      const entry: ReminderEntry = { id: `notification-${row.id}`, icon, title: row.title, detail: row.body, status: row.kind === 'overdue' ? 'Overdue' : undefined, onPress: () => {
        qc.setQueryData<api.AppNotification[]>([...keys.notifications, db.spaceId], current => current?.map(event => event.id === row.id ? { ...event, readAt: event.readAt ?? new Date().toISOString() } : event));
        void api.readNotification(row.id).catch(cause => { setError(message(cause)); void notificationsQ.refetch(); });
        if (row.itemId) setSelectedId(row.itemId); else if (row.kind === 'request') { setRequestSegment('approve'); go('Requests'); }
      } };
      (new Date(row.createdAt).toDateString() === new Date(now).toDateString() ? filteredToday : filteredEarlier).push(entry);
    });
    content = <RemindersScreen scheme={scheme} today={filteredToday} earlier={filteredEarlier} loading={itemsQ.isLoading || requestsQ.isLoading || remindersQ.isLoading || notificationsQ.isLoading} onBack={() => go('Home')} />;
  }
  else if (tab === 'Space') content = <CoreScreen title={spaceQ.data?.name ?? 'Your Space'} variant="space" scheme={scheme} onBack={() => go('Home')}>
    {spaceQ.isLoading ? <Skeleton scheme={scheme} /> : spaceQ.isError ? <EmptyState title="Space could not load" body={message(spaceQ.error)} action="Try again" onPress={() => spaceQ.refetch()} scheme={scheme} /> : <>
      {myRole === 'admin' && <CoreCard scheme={scheme} inset={18}>
        <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>Invite code</Text>
        <Text selectable style={{ color: c.text, fontSize: visibleInvite ? 22 : 19, letterSpacing: .4, fontWeight: '700', marginTop: 5 }}>{visibleInvite || 'Create an invite to share'}</Text>
        {visibleInvite ? <View style={{ flexDirection: 'row', gap: 9, marginTop: 15 }}><View style={{ flex: 1 }}><Button label="Copy" icon="copy-outline" scheme={scheme} kind="secondary" small onPress={() => { void Clipboard.setStringAsync(visibleInvite, { android: { isSensitive: true } }).then(() => setCopyNotice('Copied invite code.')); }} /></View><View style={{ flex: 1 }}><Button label="Share" icon="share-outline" scheme={scheme} kind="secondary" small onPress={() => { void Share.share({ message: `Join ${spaceQ.data?.name ?? 'my Space'} in Hestia: ${Linking.createURL('/', { queryParams: { invite: visibleInvite } })}\nInvite code: ${visibleInvite}` }); }} /></View></View> : <View style={{ marginTop: 15 }}><Button label="Create invite" scheme={scheme} onPress={() => act(async () => { const created = await api.createInvite(); await rememberInvite(db.spaceId!, created); setCopyNotice(''); })} /></View>}
        {visibleInvite && copyNotice ? <Text accessibilityRole="alert" style={{ color: c.text, fontSize: 12, marginTop: 10 }}>{copyNotice}</Text> : null}
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 12 }}>{visibleInvite && inviteExpiry ? `Expires ${new Date(inviteExpiry).toLocaleString()}` : 'Invite codes expire after 7 days. Admins can create a new one.'}</Text>
        {visibleInvite && inviteId && <Pressable accessibilityRole="button" accessibilityLabel="Revoke this invite code" onPress={() => confirm('Revoke invite code?', 'This code will stop working immediately. You can create a new one.', async () => { await api.revokeInvite(inviteId); if (inviteCacheKey) await AsyncStorage.removeItem(inviteCacheKey); setNewInvite(''); setInviteId(null); setInviteExpiry(null); })} style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: 6 }}><Text style={{ color: c.danger, fontWeight: '700' }}>Revoke code</Text></Pressable>}
      </CoreCard>}
      <CoreSectionTitle scheme={scheme}>Members</CoreSectionTitle>
      <CoreCard scheme={scheme}>
        {membersQ.isLoading ? <View style={{ padding: 16 }}><Skeleton scheme={scheme} /></View> : members.length ? members.map((m, index) => <View key={m.id} style={{ minHeight: 67, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 11, borderTopWidth: index ? 1 : 0, borderColor: c.border }}>
          <View style={{ width: 39, height: 39, borderRadius: 20, backgroundColor: core.plum, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: core.cream, fontWeight: '700', fontSize: 13 }}>{m.initials || m.name.slice(0, 1).toUpperCase()}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{m.name}{m.id === db.userId ? ' (you)' : ''}</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>{spaceQ.data?.adminIds.includes(m.id) ? 'Admin' : 'Member'}</Text></View>
          {myRole === 'admin' && m.id !== db.userId && <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${m.name}`} onPress={() => { setAdminMemberId(m.id); setAdminOverlay('member'); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="ellipsis-horizontal" size={23} color={c.text} /></Pressable>}
        </View>) : <Text style={{ color: c.muted, padding: 16 }}>No members found.</Text>}
      </CoreCard>
      <CoreSectionTitle scheme={scheme}>Your Spaces</CoreSectionTitle>
      <CoreCard scheme={scheme}>{(spacesQ.data ?? []).map((space, index) => <Pressable key={space.id} accessibilityRole="button" accessibilityLabel={`Open ${space.name}`} accessibilityState={{ selected: space.id === db.spaceId }} onPress={() => { if (space.id !== db.spaceId) switchCurrentSpace(space.id); }} style={({ pressed }) => ({ minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderTopWidth: index ? 1 : 0, borderColor: c.border, opacity: pressed ? .7 : 1 })}><Ionicons name="home-outline" size={21} color={c.text} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{space.name}</Text><Text style={{ color: c.muted, fontSize: 12 }}>{space.id === db.spaceId ? 'Current Space' : space.role === 'admin' ? 'Admin' : 'Member'}</Text></View>{space.id === db.spaceId ? <Ionicons name="checkmark-circle" size={21} color={c.text} /> : <Ionicons name="chevron-forward" size={18} color={c.muted} />}</Pressable>)}</CoreCard>
      <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button label="New Space" icon="add" scheme={scheme} kind="secondary" onPress={() => openSpaceFlow('create')} /></View><View style={{ flex: 1 }}><Button label="Join Space" icon="enter-outline" scheme={scheme} kind="secondary" onPress={() => openSpaceFlow('join')} /></View></View>
      {myRole === 'admin' && <Pressable accessibilityRole="button" accessibilityLabel="Archive this Space" onPress={() => { setDeleteName(''); setError(''); setDeleteOpen(true); }} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}><Text style={{ color: c.danger, fontWeight: '700', fontSize: 14 }}>Archive this Space</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Leave this Space" onPress={() => confirm('Leave this Space?', 'You will lose access to its shared items. Transfer or archive your items and resolve active loans first. The last admin must assign another admin before leaving.', async () => { applySpaceSession(await api.leaveSpace(db.spaceId!)); }, () => { setTab('Home'); setSelectedId(null); })} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}><Text style={{ color: c.danger, fontWeight: '700', fontSize: 14 }}>Leave this Space</Text></Pressable>
      {myRole === 'admin' && <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>Assign custodians from an item’s Edit screen.</Text>}
    </>}
  </CoreScreen>;
  else content = <ProfileScreen
    scheme={scheme} name={me?.name || 'Member'} email={accountQ.data?.email ?? ''}
    currentSpaceId={db.spaceId} spaces={spacesQ.data ?? []} returnReminders={db.notifications}
    lowStockAlerts={db.lowStockAlerts} pending={mutation.isPending} notice={profileNotice}
    onBack={() => go('Home')} onEdit={openProfileEdit}
    onSpace={id => id === db.spaceId ? go('Space') : switchCurrentSpace(id)}
    onAddSpace={() => setSpacePicker(true)}
    onReturnReminders={value => act(async () => { qc.setQueryData(keys.session, await api.updateSettings({ notifications: value })); })}
    onLowStockAlerts={value => act(async () => { qc.setQueryData(keys.session, await api.updateSettings({ lowStockAlerts: value })); })}
    onChangePassword={() => { setError(''); setProfileNotice(''); setCurrentPassword(''); setNextPassword(''); setConfirmNextPassword(''); setPasswordOpen(true); }}
    onLogOut={() => act(async () => { if (db.userId) { try { await disablePhoneNotifications(db.userId); } catch (cause) { console.warn('Could not unregister phone notifications before sign-out', cause); } } await api.signOut(); })}
  />;
  const isHome = tab === 'Home' && !selected;
  const fullBleed = isHome || !!selected || ['Items', 'Add', 'Requests', 'Reminders', 'Space', 'Profile'].includes(tab);
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.background }}><View aria-hidden={menuOpen} accessibilityElementsHidden={menuOpen} importantForAccessibility={menuOpen ? 'no-hide-descendants' : 'auto'} style={{ flex: 1, paddingTop: fullBleed ? 0 : insets.top }}>{offline && tab !== 'Items' && <Text style={{ color: c.navText, backgroundColor: c.nav, textAlign: 'center', padding: 8 }}>Offline · Reconnect to make changes.</Text>}{error ? <Pressable onPress={() => setError('')} accessibilityRole="alert"><Text style={{ color: c.danger, backgroundColor: c.surfaceAlt, padding: 12 }}>{error} · Dismiss</Text></Pressable> : null}{undo && <View style={{ backgroundColor: c.nav, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: c.navText }}>Quantity updated</Text><Pressable accessibilityRole="button" accessibilityLabel="Undo quantity change" onPress={() => act(() => api.undoQuantity(undo.itemId, undo.activityId), () => setUndo(null))} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.navText, fontWeight: '700' }}>Undo</Text></Pressable></View>}<Animated.View key={selected ? `detail-${selected.id}` : tab} entering={selected && !reducedMotion ? FadeIn.duration(150) : undefined} style={{ flex: 1 }}>{content}</Animated.View></View><BubbleMenu activeTab={tab} onSelect={go} onOpenChange={setMenuOpen} home={fullBleed} />
    <SpaceAdminOverlay mode={adminOverlay} scheme={scheme} member={members.find(member => member.id === adminMemberId)} members={members} items={items} itemName={form.name} ownerId={items.find(item => item.id === editingId)?.ownerId ?? db.userId ?? undefined} custodianId={custodianChoice} pending={mutation.isPending}
      onClose={() => setAdminOverlay(null)} onAssign={() => setAdminOverlay('item-picker')}
      onPromote={() => { const id = adminMemberId; setAdminOverlay(null); if (id) act(() => api.setMemberRole(id, 'admin')); }}
      onRequestRemove={() => setAdminOverlay('remove')}
      onRemove={() => { const id = adminMemberId; setAdminOverlay(null); if (id) act(async () => { qc.setQueryData(keys.session, await api.removeMember(id)); }); }}
      onSelectItem={item => { const id = adminMemberId; setAdminOverlay(null); if (id) act(() => api.assignCustodian(item.id, id)); }}
      onChooseCustodian={setCustodianChoice}
      onSaveCustodian={() => { const choice = custodianChoice; setAdminOverlay(null); if (editingId) act(() => api.assignCustodian(editingId, choice), () => setForm(current => ({ ...current, custodianId: choice ?? undefined }))); else setForm(current => ({ ...current, custodianId: choice ?? undefined })); }}
    />
    <Sheet visible={spacePicker} title="Choose a Space" scheme={scheme} onClose={() => setSpacePicker(false)}>{(spacesQ.data ?? []).map(space => <Button key={space.id} label={space.name} scheme={scheme} kind={space.id === db.spaceId ? 'primary' : 'secondary'} onPress={() => { setSpacePicker(false); if (space.id !== db.spaceId) switchCurrentSpace(space.id); }} />)}<Button label="Create a Space" scheme={scheme} kind="secondary" onPress={() => openSpaceFlow('create')} /><Button label="Join a Space" scheme={scheme} kind="secondary" onPress={() => openSpaceFlow('join')} /><Button label="Manage this Space" scheme={scheme} kind="quiet" onPress={() => { setSpacePicker(false); go('Space'); }} /></Sheet>
    <Sheet visible={profileEditOpen} title="Edit profile" scheme={scheme} onClose={() => setProfileEditOpen(false)}>
      {field('Name', profileName, setProfileName, 'Your name')}
      <View style={{ gap: 6 }}><Text style={{ color: c.text, fontWeight: '700' }}>Email</Text><TextInput accessibilityLabel="Email" value={profileEmail} onChangeText={setProfileEmail} placeholder="you@example.com" placeholderTextColor={c.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={{ backgroundColor: c.surface, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 14, minHeight: 50, padding: 12, fontSize: 16 }} /></View>
      <Text style={{ color: c.muted, fontSize: 13 }}>Changing your email requires confirmation at the new address.</Text>
      {error ? <Text accessibilityRole="alert" style={{ color: c.danger }}>{error}</Text> : null}
      <Button label="Save profile" scheme={scheme} disabled={mutation.isPending || !profileName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileEmail.trim())} onPress={saveProfile} />
    </Sheet>
    <Sheet visible={passwordOpen} title="Change password" scheme={scheme} onClose={() => setPasswordOpen(false)}>
      <ProfilePasswordField key={`current-${passwordOpen}`} label="Current password" value={currentPassword} onChangeText={setCurrentPassword} scheme={scheme} current />
      <ProfilePasswordField key={`next-${passwordOpen}`} label="New password" value={nextPassword} onChangeText={setNextPassword} scheme={scheme} />
      <ProfilePasswordField key={`confirm-${passwordOpen}`} label="Confirm new password" value={confirmNextPassword} onChangeText={setConfirmNextPassword} scheme={scheme} />
      <Text style={{ color: c.muted, fontSize: 13 }}>Use at least 8 characters. Your new password must match in both fields.</Text>
      {error ? <Text accessibilityRole="alert" style={{ color: c.danger }}>{error}</Text> : null}
      <Button label="Update password" scheme={scheme} disabled={mutation.isPending || !currentPassword || nextPassword.length < 8 || nextPassword === currentPassword || nextPassword !== confirmNextPassword} onPress={savePassword} />
    </Sheet>
    <Sheet visible={deleteOpen} title="Archive this Space?" scheme={scheme} onClose={() => setDeleteOpen(false)}>
      <Text style={{ color: c.text, lineHeight: 21 }}>This removes {spaceQ.data?.name} from everyone’s Spaces and revokes its invites. Items, requests, and history remain stored. Type the Space name to confirm.</Text>
      {field('Space name', deleteName, setDeleteName, spaceQ.data?.name ?? '')}
      {error ? <Text accessibilityRole="alert" style={{ color: c.danger }}>{error}</Text> : null}
      <Button label="Keep Space" scheme={scheme} kind="secondary" onPress={() => setDeleteOpen(false)} />
      <Button label="Archive Space" scheme={scheme} disabled={mutation.isPending || deleteName !== spaceQ.data?.name} onPress={() => { if (!db.spaceId) return; const id = db.spaceId; act(async () => { applySpaceSession(await api.deleteSpace(id, deleteName)); }, () => { setDeleteOpen(false); setDeleteName(''); setSelectedId(null); setTab('Home'); }); }} />
    </Sheet>
    <Sheet visible={sheet === 'quantity'} title={selected?.name ?? 'Record usage'} scheme={scheme} onClose={() => setSheet(null)}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{selected?.location || 'No location'} · {selected ? quantityLabel(selected) : '0 units'} left</Text>
      <CoreSegment scheme={scheme} value={quantityMode} onChange={v => { setQuantityMode(v as 'use' | 'restock'); setAmount(1); }} options={[{ label: 'Use', value: 'use' }, { label: 'Restock', value: 'restock' }]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Decrease amount" onPress={() => setAmount(value => Math.max(1, value - 1))} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: c.text, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .65 : 1 })}><Ionicons name="remove" size={24} color={c.text} /></Pressable>
        <View style={{ alignItems: 'center' }}><Text accessibilityLabel={`${amount} ${selected?.unit ?? 'units'}`} style={{ color: c.text, fontSize: 62, lineHeight: 70, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>{amount}</Text><Text style={{ color: c.muted, fontSize: 12 }}>{selected?.unit ?? 'units'}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Increase amount" onPress={() => setAmount(value => value + 1)} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: c.nav, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .72 : 1 })}><Ionicons name="add" size={24} color={c.navText} /></Pressable>
      </View>
      <Text style={{ color: c.text, textAlign: 'center', fontSize: 13 }}>{selected?.quantity ?? 0} left → {Math.max(0, (selected?.quantity ?? 0) + (quantityMode === 'use' ? -amount : amount))} left</Text>
      <Text style={{ color: c.muted, textAlign: 'center', fontSize: 12 }}>Low stock alert at {selected?.lowThreshold ?? 0} or fewer.</Text>
      {offline && quantityMode === 'restock' && <Text style={{ color: c.muted, fontSize: 12 }}>Reconnect to record a restock.</Text>}
      <Button label={quantityMode === 'use' ? 'Record use' : 'Record restock'} scheme={scheme} disabled={!selected || mutation.isPending || offline && (quantityMode === 'restock' || queueOwner !== db.userId) || quantityMode === 'use' && amount > (selected.quantity ?? 0)} onPress={() => { const current = selected!; if (offline) { void queueUse(current, amount); return; } act(async () => { const updated = quantityMode === 'use' ? await api.recordUsage(current.id, amount) : await api.restockItem(current.id, amount); setUndo({ itemId: current.id, activityId: updated.history[0].id }); return updated; }, () => setSheet(null)); }} />
    </Sheet>
    <BorrowRequestSheet key={sheet === 'borrow' ? `borrow-${selected?.id}` : 'borrow-closed'} visible={sheet === 'borrow'} item={selected} ownerName={name(selected?.custodianId ?? selected?.ownerId)} scheme={scheme} pending={borrow.isPending} error={borrowError} onClose={() => { setSheet(null); setBorrowError(''); }} onSubmit={(dueAt, requestNote) => { if (selected) borrow.mutate({ itemId: selected.id, dueAt, note: requestNote }, { onSuccess: () => { setSheet(null); setSelectedId(null); setBorrowError(''); setRequestSegment('mine'); setTab('Requests'); } }); }} />
    <Sheet visible={sheet === 'handover'} title="Hand over item" scheme={scheme} onClose={() => setSheet(null)}><Text style={{ color: c.text }}>{`Give this item to ${name(selected?.loan?.borrowerId)}.`}</Text><Button label="Confirm handover" scheme={scheme} onPress={() => selected && act(() => api.handOver(selected.id), () => setSheet(null))} /></Sheet>
    <OutcomeSheet key={sheet === 'report' ? `report-${selected?.id}` : 'report-closed'} visible={sheet === 'report'} item={selected} borrowerName={name(selected?.loan?.borrowerId)} scheme={scheme} pending={mutation.isPending} error={error} onClose={() => { setSheet(null); setError(''); }} onSubmit={(outcome, outcomeNote) => { if (selected) act(() => api.reportLostOrDamaged(selected.id, outcomeNote, outcome), () => setSheet(null)); }} />
    <Sheet visible={sheet === 'restore'} title="Restore availability" scheme={scheme} onClose={() => setSheet(null)}><Text style={{ color: c.text }}>Record what was fixed before this item can be borrowed again.</Text>{field('What was fixed?', restoreNote, setRestoreNote, 'A short note')}{error ? <Text accessibilityRole="alert" style={{ color: c.danger }}>{error}</Text> : null}<Button label="Restore availability" scheme={scheme} disabled={mutation.isPending || !restoreNote.trim()} onPress={() => { if (selected) act(() => api.restoreItem(selected.id, restoreNote), () => { setSheet(null); setRestoreNote(''); }); }} /></Sheet>
    <Sheet visible={sheet === 'owner'} title="Transfer owner" scheme={scheme} onClose={() => setSheet(null)}><Text style={{ color: c.muted, fontSize: 13 }}>Choose a Space member to own {selected?.name ?? 'this item'}.</Text>{members.filter(person => person.id !== selected?.ownerId).map(person => <Pressable key={person.id} accessibilityRole="radio" accessibilityState={{ selected: ownerChoice === person.id }} onPress={() => setOwnerChoice(person.id)} style={{ minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: c.border, borderWidth: 1, borderRadius: 13 }}><Text style={{ color: c.text, fontWeight: '700' }}>{person.name}</Text><Ionicons name={ownerChoice === person.id ? 'radio-button-on' : 'radio-button-off'} size={21} color={c.text} /></Pressable>)}<Button label="Transfer owner" scheme={scheme} disabled={mutation.isPending || !selected || !ownerChoice || ownerChoice === selected.ownerId} onPress={() => { if (selected && ownerChoice) act(() => api.transferItemOwner(selected.id, ownerChoice), () => setSheet(null)); }} /></Sheet>
    <Sheet visible={!!confirmation} title={confirmation?.title ?? 'Confirm'} scheme={scheme} onClose={() => setConfirmation(null)}><Text style={{ color: c.text }}>{confirmation?.detail}</Text><Button label="Keep" kind="secondary" scheme={scheme} onPress={() => setConfirmation(null)} /><Button label="Confirm" scheme={scheme} onPress={() => { if (!confirmation) return; const { fn, after } = confirmation; setConfirmation(null); act(fn, after); }} /></Sheet>
  </SafeAreaView>;
}
