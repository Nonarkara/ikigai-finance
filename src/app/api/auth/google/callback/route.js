import { NextResponse } from 'next/server';
import { SESSION_COOKIE, createSession, sessionCookieOptions } from '@/lib/auth';
import { isAllowedOwner } from '@/lib/owners';

const STATE_COOKIE = 'ikigai_community_oauth_state';

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

function clearState(response) {
  response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

async function exchangeCode(request, code) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const origin = process.env.AUTH_URL || new URL(request.url).origin;
  const redirectUri = `${origin.replace(/\/$/, '')}/api/auth/google/callback`;
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function fetchUserInfo(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google userinfo fetch failed: ${response.status} ${text}`);
  }
  return response.json();
}

function restrictedRedirect(origin) {
  const url = new URL('/login', origin);
  url.searchParams.set('error', 'restricted');
  return NextResponse.redirect(url, 303);
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    const redirectUrl = new URL('/login', url.origin);
    redirectUrl.searchParams.set('error', 'google');
    return clearState(NextResponse.redirect(redirectUrl, 303));
  }
  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  const expectedState = readCookie(request, STATE_COOKIE);
  if (!expectedState || expectedState !== state) {
    return NextResponse.json({ error: 'OAuth state mismatch' }, { status: 400 });
  }

  let tokens;
  let userInfo;
  try {
    tokens = await exchangeCode(request, code);
    userInfo = await fetchUserInfo(tokens.access_token);
  } catch (err) {
    console.error('[oauth callback]', err);
    return NextResponse.json({ error: 'Google authentication failed' }, { status: 502 });
  }

  const email = userInfo?.email;
  if (!email || !userInfo?.email_verified) {
    const redirectUrl = new URL('/login', url.origin);
    redirectUrl.searchParams.set('error', 'unverified');
    return clearState(NextResponse.redirect(redirectUrl, 303));
  }
  if (!isAllowedOwner(email)) {
    return clearState(restrictedRedirect(url.origin));
  }

  const response = clearState(NextResponse.redirect(new URL('/', url.origin), 303));
  response.cookies.set(SESSION_COOKIE, await createSession({ email }), sessionCookieOptions());
  return response;
}
