'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Field, Label, SiteFooter } from '@/components/ui';

/** Only ever sent back to a path on this origin, so `next` can't be an open redirect. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/bank';
}

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).catch(() => null);

    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? 'Could not sign in. Try again.');
      setPending(false);
      return;
    }

    // refresh() so server components re-read the new cookie before we land.
    router.replace(next);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <Label>Sign in</Label>
      <h1 className="mt-3 text-2xl tracking-tight text-neutral-900">
        Welcome back to <span className="font-serif italic">Cadence</span>
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        Voice banks are personal. Sign in to reach banking, the speech board, and the decoder.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <Field
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-6 rounded-md border border-teal-200 bg-teal-50/50 px-4 py-3">
        <Label className="text-teal-700">Demo account</Label>
        <p className="mt-1.5 font-mono text-sm text-neutral-700">
          user123 / medplum
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">
          One shared judging account. A real deployment would issue per-clinician credentials.
        </p>
      </div>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="inline-block h-2 w-2 rounded-full bg-teal-600" />
            <span className="text-[15px] font-semibold tracking-tight">Cadence</span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </main>

      <SiteFooter />
    </div>
  );
}
