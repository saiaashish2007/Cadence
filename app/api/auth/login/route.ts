import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionToken,
  credentialsValid,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');

  if (!credentialsValid(username, password)) {
    // Deliberately one message for both wrong username and wrong password.
    return NextResponse.json({ error: 'Those credentials were not recognised.' }, { status: 401 });
  }

  const response = NextResponse.json({ username });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionToken(username),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
