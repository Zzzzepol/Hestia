import { describe, expect, it } from 'vitest';
import { INVITE_EXPIRY_HOURS, inviteHash, issueInviteCode, normalizeInviteCode } from '../src/invites.js';

describe('Space invite codes', () => {
  it('issues eight unambiguous characters in the design format for seven days', () => {
    expect(INVITE_EXPIRY_HOURS).toBe(168);
    const codes = Array.from({ length: 100 }, issueInviteCode);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach(code => expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/));
  });

  it('accepts pasted codes regardless of case or dash', () => {
    const issued = issueInviteCode();
    expect(normalizeInviteCode(issued.toLowerCase())).toBe(issued.replace('-', ''));
    expect(inviteHash(issued)).toBe(inviteHash(issued.replace('-', '').toLowerCase()));
  });
});
