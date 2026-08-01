/**
 * Demo authentication.
 *
 * A banked voice is impersonation-grade material, so the app surfaces sit
 * behind a login rather than being open to anyone with the URL. For the
 * hackathon this is a single shared account, but the mechanics are real: the
 * password is only ever checked on the server, and the browser gets an
 * HMAC-signed, httpOnly cookie rather than anything it could forge.
 *
 * Both credentials and the signing secret are environment-overridable. The
 * defaults exist so judges can sign in without any setup — they are not a
 * security boundary, and this is not a substitute for per-user accounts in
 * anything handling real patients.
 */

const DEMO_USERNAME = process.env.CADENCE_DEMO_USER ?? 'user123';
const DEMO_PASSWORD = process.env.CADENCE_DEMO_PASSWORD ?? 'medplum';
const SECRET = process.env.CADENCE_AUTH_SECRET ?? 'cadence-demo-signing-key';

export const SESSION_COOKIE = 'cadence_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

const encoder = new TextEncoder();

/** Compares without leaking which character differed via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function credentialsValid(username: string, password: string): boolean {
  // Both are checked so a correct username alone never short-circuits.
  const userOk = safeEqual(username, DEMO_USERNAME);
  const passOk = safeEqual(password, DEMO_PASSWORD);
  return userOk && passOk;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

// Web Crypto rather than node:crypto so the same module works in the proxy.
async function signingKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function sign(payload: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(payload));
  return base64url(new Uint8Array(signature));
}

export type Session = { username: string; expiresAt: number };

export async function createSessionToken(username: string): Promise<string> {
  const session: Session = {
    username,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const payload = base64url(encoder.encode(JSON.stringify(session)));
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  if (!safeEqual(signature, await sign(payload))) return null;

  try {
    const session = JSON.parse(fromBase64url(payload)) as Session;
    // An unexpired signature still isn't a valid session forever.
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}
