'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/** Small uppercase mono label. The workhorse of the whole layout. */
export function Label({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[11px] uppercase tracking-widest text-neutral-500 ${className}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-neutral-200/80 bg-white ${padded ? 'p-5 md:p-6' : ''} ${className}`}
    >
      {children}
    </section>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  accent,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <Card className={accent ? 'border-teal-200 bg-teal-50/40' : ''}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <Label className={accent ? 'text-teal-700' : ''}>{title}</Label>
          {subtitle && (
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{subtitle}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </Card>
  );
}

const BUTTON_STYLES = {
  primary:
    'bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400',
  secondary:
    'border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100 disabled:text-neutral-400',
  danger: 'bg-teal-600 text-white hover:bg-teal-700 disabled:bg-neutral-200 disabled:text-neutral-400',
} as const;

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_STYLES;
}) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

const INPUT_CLASS =
  'mt-2 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:outline-none';

export function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input {...props} className={INPUT_CLASS} />
      {hint && <span className="mt-1.5 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  hint,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <textarea {...props} className={INPUT_CLASS} />
      {hint && <span className="mt-1.5 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select {...props} className={INPUT_CLASS}>
        {children}
      </select>
    </label>
  );
}

/** Live level meter. Bars track real RMS, so silence actually reads as silence. */
export function Waveform({ level, active }: { level: number; active: boolean }) {
  const bars = 28;
  return (
    <div className="flex h-14 items-center justify-center gap-[3px]" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        // Center bars respond most, so the meter reads as a voice not a bar chart.
        const falloff = 1 - Math.abs(i - (bars - 1) / 2) / (bars / 1.6);
        const height = active ? Math.max(0.12, level * falloff * 2.2) : 0.08;
        return (
          <span
            key={i}
            className={`w-[3px] rounded-full ${active ? 'bg-teal-600' : 'bg-neutral-200'}`}
            style={{ height: `${Math.min(1, height) * 100}%`, transition: 'height 80ms linear' }}
          />
        );
      })}
    </div>
  );
}

export function StatusDot({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
        live ? 'bg-emerald-500' : 'bg-neutral-300'
      }`}
    />
  );
}

/** Counts up so the coverage number feels earned rather than rendered. */
export function Percent({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const from = shown;
    const started = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 450);
      setShown(from + (value - from) * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Intentionally keyed on the target only — re-running on `shown` would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{Math.round(shown * 100)}</>;
}

export function ThinkingDots({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2.5 text-sm text-neutral-600">
      <span className="inline-flex gap-[3px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="bar h-3.5 w-[3px] rounded-full bg-teal-600"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </span>
      {label}
    </p>
  );
}

const NAV = [
  { href: '/bank', label: 'Bank a voice' },
  { href: '/talk', label: 'Speak for me' },
  { href: '/decode', label: 'Decoder' },
];

export function SiteHeader({ cta }: { cta?: { href: string; label: string } }) {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="inline-block h-2 w-2 rounded-full bg-teal-600" />
          <span className="text-[15px] font-semibold tracking-tight">Cadence</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-neutral-600 transition-colors hover:text-neutral-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href={cta?.href ?? '/bank'}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          {cta?.label ?? 'Start a session'}
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-200/80 bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-neutral-600">
          Cadence — voice and message banking at diagnosis.
        </p>
        <Label>Deepgram · Moss · Medplum · Stedi</Label>
      </div>
    </footer>
  );
}
