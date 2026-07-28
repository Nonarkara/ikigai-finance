import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';

const PUBLIC = new Set(['/login', '/api/auth/login', '/api/status', '/robots.txt']);

function withSecurityHeaders(response) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return response;
}

// Next 16's replacement proxy is Node-runtime only. OpenNext Cloudflare still
// requires edge middleware, which the Next 16 upgrade guide keeps supported.
export async function middleware(request) {
  const { pathname } = request.nextUrl;
  if (
    PUBLIC.has(pathname)
    || (pathname === '/api/telegram' && request.method === 'POST')
    || (pathname === '/api/sheets/sync' && request.method === 'POST')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(token)) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return withSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }
  return withSecurityHeaders(NextResponse.redirect(new URL('/login', request.url)));
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
