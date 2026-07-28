import { NextResponse } from 'next/server';
import { SESSION_COOKIE, createSession, sessionCookieOptions } from '@/lib/auth';

export async function POST(request) {
  const contentType = request.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await request.json()
    : Object.fromEntries(await request.formData());

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'APP_PASSWORD is not configured' }, { status: 503 });
  }
  if (body.password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const response = contentType.includes('application/json')
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL('/', request.url), 303);
  response.cookies.set(SESSION_COOKIE, await createSession(), sessionCookieOptions());
  return response;
}
