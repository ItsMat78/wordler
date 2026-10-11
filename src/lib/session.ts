// The login cookie: the Discord user, signed with SESSION_SECRET so it can't be
// forged. No session table needed.
import type { User } from './db';

export const SESSION_COOKIE = 'wl_session';
export const STATE_COOKIE = 'wl_oauth_state';
export const SESSION_DAYS = 60;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signSession(user: User, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...user, exp: Date.now() + SESSION_DAYS * 86_400_000 })));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function readSession(token: string | undefined, secret: string): Promise<User | null> {
  if (!token || !secret) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { discord_id: data.discord_id, name: data.name, avatar: data.avatar };
  } catch {
    return null;
  }
}
