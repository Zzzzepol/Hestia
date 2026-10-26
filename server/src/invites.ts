import { createHash, randomBytes } from 'node:crypto';
import { fail } from './errors.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_EXPIRY_HOURS = 7 * 24;

export function issueInviteCode() {
  const bytes = randomBytes(8);
  const compact = Array.from(bytes, byte => alphabet[byte & 31]).join('');
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function normalizeInviteCode(input: string) {
  const trimmed = input.trim();
  const compact = trimmed.toUpperCase().replace(/[\s-]/g, '');
  if (/^[A-HJ-NP-Z2-9]{8}$/.test(compact)) return compact;
  // Long tokens issued by earlier versions remain valid until their own expiry.
  if (/^[A-Za-z0-9_-]{20,100}$/.test(trimmed)) return trimmed;
  return fail(422, 'VALIDATION', 'Enter the complete 8-character invite code.');
}

export const inviteHash = (code: string) => createHash('sha256').update(normalizeInviteCode(code)).digest('hex');
