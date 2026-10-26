import { createApiClient } from './client';
import { decode } from 'base64-arraybuffer';
import { getSupabaseClient } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { BorrowState, Database, Item, ItemInput, Member, Session, Space, SpaceKind } from '@/types';

const emptySession: Session = { members: [], userId: null, spaceId: null, theme: 'system', notifications: true, lowStockAlerts: true };
const idempotencyKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let client: ReturnType<typeof createApiClient> | undefined;
function api() {
  if (client) return client;
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!baseUrl) throw new Error('Set EXPO_PUBLIC_API_BASE_URL in mobile/.env to your running Hestia server.');
  client = createApiClient({ baseUrl, getAccessToken: async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  } });
  return client;
}
const get = <T,>(path: `/v1/${string}`) => api().request<T>(path);
const mutate = <T,>(path: `/v1/${string}`, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body: unknown = {}) =>
  api().request<T>(path, { method, body, idempotencyKey: idempotencyKey() });
type Page<T> = { data: T[]; nextCursor: string | null };
async function allPages<T>(path: `/v1/${string}`): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  do {
    const next: string = `${path}${path.includes('?') ? '&' : '?'}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page: Page<T> = await get<Page<T>>(next as `/v1/${string}`);
    rows.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return rows;
}
async function spaceId() {
  const session = await getSession();
  if (!session.spaceId) throw new Error('Create or join a Space first.');
  return session.spaceId;
}
export async function getSession(): Promise<Session> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  return data.session ? get<Session>('/v1/session') : emptySession;
}
export async function signIn(email: string, password: string) {
  const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return mutate<Session>('/v1/session', 'PATCH', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
}
export async function register(name: string, email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await getSupabaseClient().auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: confirmationRedirectUrl() } });
  if (error) throw error;
  if (data.session) {
    await mutate('/v1/profile', 'PATCH', { name: name.trim(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
  }
  return { needsConfirmation: !data.session };
}
function confirmationRedirectUrl() {
  return Platform.OS === 'web' ? window.location.origin : Linking.createURL('');
}
export async function resendConfirmation(email: string) {
  const { error } = await getSupabaseClient().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: confirmationRedirectUrl() } });
  if (error) throw error;
}
export async function requestPasswordReset(email: string) {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: confirmationRedirectUrl() });
  if (error) throw error;
}
export async function updatePassword(password: string) {
  const { error } = await getSupabaseClient().auth.updateUser({ password });
  if (error) throw error;
}
export async function changePassword(currentPassword: string, nextPassword: string) {
  const { data: account, error: accountError } = await getSupabaseClient().auth.getUser();
  if (accountError) throw accountError;
  if (!account.user?.email) throw new Error('Your account email is unavailable. Sign in again.');
  const { error: signInError } = await getSupabaseClient().auth.signInWithPassword({ email: account.user.email, password: currentPassword });
  if (signInError) throw new Error('Current password is incorrect.');
  return updatePassword(nextPassword);
}
export async function getAccount() {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw error;
  return { email: data.user?.email ?? '' };
}
export const updateProfile = (name: string) => mutate<{ id: string; name: string; timeZone: string }>('/v1/profile', 'PATCH', { name: name.trim(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
export async function updateEmail(email: string) {
  const { error } = await getSupabaseClient().auth.updateUser({ email: email.trim() });
  if (error) throw error;
}
export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
  return emptySession;
}
export type SpaceInvite = { id: string; code: string; expiresAt: string; maxUses?: number };
export type InviteRecord = { id: string; createdAt: string; expiresAt: string; maxUses: number; uses: number; revokedAt: string | null };
export const createSpace = (name: string, kind: SpaceKind) => mutate<Session & { invite: SpaceInvite }>('/v1/spaces', 'POST', { name, kind });
export const listSpaces = () => allPages<{ id: string; name: string; kind: SpaceKind; role: 'admin' | 'member' }>('/v1/spaces');
export const joinSpace = (code: string) => mutate<Session>('/v1/spaces/join', 'POST', { code: code.trim() });
export type InvitePreview = { id: string; name: string; kind: SpaceKind; memberCount: number; invitedBy: string };
export const previewInvite = (code: string) => mutate<InvitePreview>('/v1/spaces/join/preview', 'POST', { code: code.trim() });
export const deleteSpace = (id: string, confirmName: string) => api().request<Session>(`/v1/spaces/${id}`, { method: 'DELETE', body: { confirmName }, idempotencyKey: idempotencyKey(), timeoutMs: 35_000 });
export const leaveSpace = (id: string) => mutate<Session>(`/v1/spaces/${id}/leave`, 'POST');
export const switchSpace = (id: string) => mutate<Session>('/v1/session', 'PATCH', { spaceId: id });
export const updateSettings = (patch: Partial<Pick<Database, 'theme' | 'notifications' | 'lowStockAlerts'>>) => mutate<Session>('/v1/session', 'PATCH', patch);
export async function listItems(): Promise<Item[]> { return allPages<Item>(`/v1/spaces/${await spaceId()}/items`); }
export const getItem = (id: string) => get<Item>(`/v1/items/${id}`);
export async function getItemWithPhoto(id: string): Promise<Item> {
  const item = await getItem(id);
  try {
    const photo = await get<{ url: string }>(`/v1/items/${id}/photo`);
    return { ...item, photoUri: photo.url };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'NOT_FOUND') return item;
    throw error;
  }
}
export async function listMembers(): Promise<Member[]> { return allPages<Member>(`/v1/spaces/${await spaceId()}/members`); }
export type AppNotification = { id: string; kind: string; title: string; body: string; itemId: string | null; requestId: string | null; createdAt: string; readAt: string | null };
export async function listNotifications() { return allPages<AppNotification>(`/v1/notifications?spaceId=${await spaceId()}`); }
export const readNotification = (id: string) => mutate<{ id: string; read: boolean }>(`/v1/notifications/${id}/read`, 'POST');
export const registerDevice = (id: string, token: string, platform: 'ios' | 'android') => mutate<{ id: string; enabled: boolean }>(`/v1/devices/${id}`, 'PUT', { token, platform });
export const unregisterDevice = (id: string) => mutate<{ id: string; enabled: boolean }>(`/v1/devices/${id}`, 'DELETE');
export async function getSpace(): Promise<Space> { return get<Space>(`/v1/spaces/${await spaceId()}`); }
export async function createInvite() {
  return mutate<SpaceInvite>(`/v1/spaces/${await spaceId()}/invites`, 'POST');
}
export async function listInvites() { return allPages<InviteRecord>(`/v1/spaces/${await spaceId()}/invites`); }
export async function revokeInvite(id: string) { return mutate<{ id: string; revokedAt: string }>(`/v1/spaces/${await spaceId()}/invites/${id}/revoke`, 'POST'); }
export async function removeMember(id: string) { return mutate<Session>(`/v1/spaces/${await spaceId()}/members/${id}`, 'DELETE'); }
export async function setMemberRole(id: string, role: 'admin' | 'member') { return mutate<Member>(`/v1/spaces/${await spaceId()}/members/${id}`, 'PATCH', { role }); }
function itemBody(input: ItemInput) {
  const base = { name: input.name.trim(), kind: input.kind, category: input.category.trim(), location: input.location.trim(), visibility: input.visibility };
  return input.kind === 'consumable'
    ? { ...base, quantity: input.quantity ?? 0, unit: input.unit || 'units', lowThreshold: input.lowThreshold ?? 0, ...(input.custodianId ? { custodianId: input.custodianId } : {}) }
    : { ...base, ...(input.custodianId ? { custodianId: input.custodianId } : {}) };
}
async function withPhoto(item: Item, input: ItemInput): Promise<Item> {
  if (!input.photoBase64) return item;
  const mime = input.photoMime ?? 'image/jpeg';
  const data = decode(input.photoBase64);
  if (data.byteLength > 5_000_000) throw new Error('The item saved, but its photo exceeds the 5 MB limit. Choose a smaller photo.');
  const upload = await mutate<{ id: string; path: string; token: string }>(`/v1/items/${item.id}/photo-uploads`, 'POST', { mime, size: data.byteLength });
  const { error } = await getSupabaseClient().storage.from('item-photos').uploadToSignedUrl(upload.path, upload.token, data, { contentType: mime });
  if (error) throw new Error(`The item saved, but photo upload failed: ${error.message}`);
  return mutate<Item>(`/v1/items/${item.id}/photo-uploads/${upload.id}/complete`, 'POST');
}
export async function addItem(input: ItemInput) { return withPhoto(await mutate<Item>(`/v1/spaces/${await spaceId()}/items`, 'POST', itemBody(input)), input); }
export async function updateItem(id: string, input: ItemInput) { return withPhoto(await mutate<Item>(`/v1/items/${id}`, 'PUT', itemBody(input)), input); }
export const assignCustodian = (id: string, memberId: string | null) => mutate<Item>(`/v1/items/${id}/custodian`, 'PATCH', { memberId });
export const transferItemOwner = (id: string, memberId: string) => mutate<Item>(`/v1/items/${id}/owner`, 'PATCH', { memberId });
export const archiveItem = (id: string) => mutate<{ id: string; deletedAt: string }>(`/v1/items/${id}`, 'DELETE');
export const recordUsage = (id: string, amount: number, key?: string) => api().request<Item>(`/v1/items/${id}/use`, { method: 'POST', body: { amount }, idempotencyKey: key ?? idempotencyKey() });
export const restockItem = (id: string, amount: number) => mutate<Item>(`/v1/items/${id}/restock`, 'POST', { amount });
export const undoQuantity = (id: string, activityId: string) => mutate<Item>(`/v1/items/${id}/quantity-undo`, 'POST', { activityId });
export const requestBorrow = (id: string, dueAt?: string, note?: string) => mutate<Item>(`/v1/items/${id}/requests`, 'POST', { ...(dueAt ? { dueAt } : {}), ...(note?.trim() ? { note: note.trim() } : {}) });
export type BorrowRequest = { id: string; itemId: string; itemName: string; borrowerId: string; state: BorrowState; requestedAt: string; dueAt?: string; note?: string };
export const listRequests = () => allPages<BorrowRequest>('/v1/requests');
export type DueReminder = { requestId: string; itemId: string; itemName: string; dueAt: string; status: 'overdue' | 'upcoming' };
export const listDueReminders = () => allPages<DueReminder>('/v1/reminders');
export const actOnRequest = (requestId: string, actionName: 'approve' | 'reject' | 'cancel' | 'handover' | 'ready' | 'return') => mutate<Item>(`/v1/requests/${requestId}/${actionName}`, 'POST');
async function action(id: string, name: string, body: unknown = {}) {
  const item = await getItem(id);
  if (!item.loan?.id) throw new Error('This request changed. Refresh and try again.');
  return mutate<Item>(`/v1/requests/${item.loan.id}/${name}`, 'POST', body);
}
export const approveRequest = (id: string) => action(id, 'approve');
export const rejectRequest = (id: string) => action(id, 'reject');
export const cancelRequest = (id: string) => action(id, 'cancel');
export const handOver = (id: string) => action(id, 'handover');
export const readyToReturn = (id: string) => action(id, 'ready');
export const confirmReturn = (id: string) => action(id, 'return');
export const reportLostOrDamaged = (id: string, note: string, outcome: 'lost' | 'damaged' = 'damaged') => action(id, 'lost-or-damaged', { note, outcome });
export const restoreItem = (id: string, note: string) => mutate<Item>(`/v1/items/${id}/restore`, 'POST', { note: note.trim() });
