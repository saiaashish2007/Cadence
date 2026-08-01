/**
 * The gate in front of everything patient-facing.
 *
 * The landing page stays public — it's the pitch — but every surface that can
 * reach a real voice bank is behind the session cookie, and so is every API
 * route those surfaces call. Gating only the pages would leave the data
 * endpoints open to anyone who knew the paths.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

const PROTECTED_PAGES = ['/bank', '/talk', '/decode', '/profile', '/chart'];

/** Everything except /api/auth, which is how you get a session in the first place. */
const PROTECTED_APIS = [
  '/api/session',
  '/api/prompt',
  '/api/bank',
  '/api/speak',
  '/api/audio',
  '/api/library',
  '/api/answer',
  '/api/decode',
  '/api/confirm',
  '/api/profile',
  '/api/coverage',
  '/api/chart',
];

const matches = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedApi = matches(pathname, PROTECTED_APIS);
  const isProtectedPage = matches(pathname, PROTECTED_PAGES);
  if (!isProtectedApi && !isProtectedPage) return NextResponse.next();

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  // A fetch that redirects to an HTML login page just looks like a corrupt
  // response to the caller, so APIs get a status they can actually handle.
  if (isProtectedApi) {
    return NextResponse.json({ error: 'sign in to use this' }, { status: 401 });
  }

  const login = new URL('/login', request.url);
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
