import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

function clearedCookieResponse(request, response) {
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export async function POST(request) {
  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL('/login', url.origin), 303);
  return clearedCookieResponse(request, response);
}

export async function GET(request) {
  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL('/login', url.origin), 303);
  return clearedCookieResponse(request, response);
}
