import { NextResponse } from 'next/server';
import { isAllowedOwner } from '@/lib/owners';

const STATE_COOKIE = 'ikigai_community_oauth_state';
const SCOPES = ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'];

function randomState(bytes = 24) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
}

function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  // AUTH_URL is the public origin Google should redirect back to. When the
  // app is served through a tunnel, set AUTH_URL explicitly to the public host.
  // Otherwise the current request origin is used.
  return { clientId, clientSecret };
}

export function buildAuthorizeUrl(request, state) {
  const config = googleConfig();
  if (!config) return null;
  const origin = process.env.AUTH_URL || new URL(request.url).origin;
  const redirectUri = `${origin.replace(/\/$/, '')}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// GET /api/auth/google — start the OAuth flow.
export async function GET(request) {
  const config = googleConfig();
  if (!config) {
    return NextResponse.json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' }, { status: 503 });
  }
  if (!process.env.OWNER_EMAILS) {
    return NextResponse.json({ error: 'Google OAuth is locked until OWNER_EMAILS is configured.' }, { status: 503 });
  }
  const state = randomState();
  const authorizeUrl = buildAuthorizeUrl(request, state);
  const response = NextResponse.redirect(authorizeUrl, 303);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
