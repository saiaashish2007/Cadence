'use client';

import { useEffect, useState } from 'react';

export function Panel({
  title,
  subtitle,
  children,
  accent,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border ${
        accent ? 'border-ember/40 bg-ember/5' : 'border-white/8 bg-ink-2'
      } p-5`}
    >
      <header className="mb-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-bone-dim">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-bone-dim">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-ember text-ink hover:bg-ember-soft disabled:bg-ink-3 disabled:text-bone-dim',
    ghost: 'border border-white/15 text-bone hover:border-white/35 disabled:text-bone-dim',
    danger: 'bg-bone text-ink hover:bg-white',
  }[variant];

  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bone-dim">
        {label}
      </span>
      <input
        {...props}
        className="mt-1.5 w-full rounded-lg border border-white/12 bg-ink px-3 py-2.5 text-sm text-bone placeholder:text-bone-dim/60 focus:border-ember/60 focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-bone-dim">{hint}</span>}
    </label>
  );
}

/** Live level meter. Bars track real RMS, so silence actually reads as silence. */
export function Waveform({ level, active }: { level: number; active: boolean }) {
  const bars = 24;
  return (
    <div className="flex h-12 items-center justify-center gap-[3px]" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        // Center bars respond most, so the meter reads as a voice not a bar chart.
        const falloff = 1 - Math.abs(i - (bars - 1) / 2) / (bars / 1.6);
        const height = active ? Math.max(0.12, level * falloff * 2.2) : 0.1;
        return (
          <span
            key={i}
            className={`w-[3px] rounded-full ${active ? 'bg-ember' : 'bg-white/15'}`}
            style={{ height: `${Math.min(1, height) * 100}%`, transition: 'height 80ms linear' }}
          />
        );
      })}
    </div>
  );
}

/** Which sponsor services are actually live, stated plainly rather than implied. */
export function ServiceStatus({
  services,
}: {
  services: { name: string; live: boolean; note: string }[];
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {services.map((s) => (
        <li key={s.name} className="flex items-start gap-2.5 text-xs">
          <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
              s.live ? 'bg-sage' : 'bg-bone-dim/40'
            }`}
          />
          <span>
            <span className="font-mono uppercase tracking-wider text-bone">{s.name}</span>
            <span className="ml-2 text-bone-dim">{s.live ? s.note : 'not configured — stubbed'}</span>
          </span>
        </li>
      ))}
    </ul>
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
