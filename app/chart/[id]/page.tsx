'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Panel } from '@/components/ui';

type Chart = {
  source: 'medplum' | 'projected';
  patient?: unknown;
  carePlans?: unknown[];
  media?: unknown[];
  communications?: unknown[];
  observations?: unknown[];
};

/**
 * Medplum returns CloudFront-signed binary URLs that run ~700 characters. Left
 * whole they bury every other field in the resource, which defeats the point of
 * showing the chart at all. Keep the origin and path, drop the signature.
 */
function shortenSignedUrls(_key: string, value: unknown) {
  if (typeof value === 'string' && value.length > 120 && value.includes('?')) {
    const [base] = value.split('?');
    return `${base}?<signed…>`;
  }
  return value;
}

export default function ChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [chart, setChart] = useState<Chart | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/chart/${id}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? 'could not load chart');
        setChart(json);
      })
      .catch((err) => setError(String(err)));
  }, [id]);

  const groups: { title: string; note: string; data: unknown }[] = chart
    ? [
        { title: 'Patient', note: 'the person banking their voice', data: chart.patient },
        {
          title: 'CarePlan',
          note: 'communication preservation — the plan the care team will see',
          data: chart.carePlans,
        },
        { title: 'Media', note: 'each recording, audio attached', data: chart.media },
        {
          title: 'Communication',
          note: 'banked messages — the words, the recipient, the occasion',
          data: chart.communications,
        },
        {
          title: 'Observation',
          note: 'speech baseline at diagnosis, so progression is measurable later',
          data: chart.observations,
        },
      ]
    : [];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Link
          href={`/bank`}
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone-dim hover:text-bone"
        >
          ← Session
        </Link>
        {chart && (
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-bone-dim">
            source:{' '}
            <span className={chart.source === 'medplum' ? 'text-sage' : 'text-ember-soft'}>
              {chart.source === 'medplum' ? 'live Medplum' : 'projected (no Medplum key)'}
            </span>
          </p>
        )}
      </div>

      <h1 className="mt-8 font-display text-4xl">The voice, as clinical data.</h1>
      <p className="mt-3 max-w-2xl text-bone-dim">
        This is the part that makes a banked voice survive. Not a file on a laptop that gets lost in
        the move to hospice — a first-class part of the medical record, findable by whoever is
        caring for this person in two years.
      </p>

      {error && <p className="mt-6 text-sm text-ember">{error}</p>}

      <div className="mt-8 space-y-5">
        {groups.map((g) => (
          <Panel key={g.title} title={g.title} subtitle={g.note}>
            <pre className="max-h-80 overflow-auto rounded-lg border border-white/8 bg-ink p-4 font-mono text-[11px] leading-relaxed text-bone-dim">
              {JSON.stringify(g.data ?? null, shortenSignedUrls, 2)}
            </pre>
          </Panel>
        ))}
      </div>
    </main>
  );
}
