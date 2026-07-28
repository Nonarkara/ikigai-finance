const encoder = new TextEncoder();
export const SESSION_COOKIE = 'ikigai_community_session';

function secret() {
  return process.env.SESSION_SECRET || process.env.APP_PASSWORD || '';
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

async function signingKey() {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signature(payload) {
  return encode(await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(payload)));
}

// Session payload shape:
//   exp: absolute ms timestamp at which the session is no longer valid
//   email?: owner email, present when the session was minted by Google OAuth
//          and absent when minted by the legacy shared-password path.
export async function createSession({ email = null } = {}) {
  const payload = encode(JSON.stringify({ exp: Date.now() + 12 * 60 * 60 * 1000, email }));
  return `${payload}.${await signature(payload)}`;
}

export async function verifySession(token) {
  if (!secret() || !token) return null;
  const [payload, supplied] = token.split('.');
  if (!payload || !supplied) return null;
  const valid = await crypto.subtle.verify(
    'HMAC',
    await signingKey(),
    Buffer.from(supplied, 'base64url'),
    encoder.encode(payload),
  );
  if (!valid) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!parsed || parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSessionEmail(cookies) {
  if (!cookies) return null;
  const token = cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  return session?.email || null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 12 * 60 * 60,
  };
}
