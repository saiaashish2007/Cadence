'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Label, Panel, SiteFooter, SiteHeader, StatusDot } from '@/components/ui';
import { findSession, loadSessions } from '@/lib/client-session';
import { projectFhir } from '@/lib/fhir-projection';

type Chart = {
  source: 'medplum' | 'projected';
  patient?: unknown;
  conditions?: unknown[];
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
    let cancelled = false;

    // Medplum is the record; the local projection is only reached for when it
    // isn't configured, and it says so on screen rather than passing itself off
    // as a real chart.
    const fallback = () => {
      // The chart link carries the Medplum patient id, which may differ from
      // the id the session was created under.
      const session = findSession(id) ?? loadSessions().find((s) => s.patientId === id);
      if (!session) {
        setError('No record found for this session in Medplum or this browser.');
        return;
      }
      setChart({ source: 'projected', ...projectFhir(session) });
    };

    fetch(`/api/chart/${id}`)
      .then(async (r) => {
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          fallback();
          return;
        }
        setChart(json);
      })
      .catch(() => {
        if (!cancelled) fallback();
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const groups: { title: string; note: string; data: unknown }[] = chart
    ? [
        { title: 'Patient', note: 'the person banking their voice', data: chart.patient },
        {
          title: 'Condition',
          note: 'the diagnosis and when it entered the clinical timeline',
          data: chart.conditions,
        },
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
    <div className="flex min-h-screen flex-col">
      <SiteHeader cta={{ href: '/bank', label: 'Back to session' }} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 md:py-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/bank"
            className="font-mono text-[11px] uppercase tracking-widest text-neutral-500 hover:text-neutral-900"
          >
            ← Session
          </Link>
          {chart && (
            <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1.5">
              <StatusDot live={chart.source === 'medplum'} />
              <Label>
                {chart.source === 'medplum' ? 'live Medplum' : 'projected (no Medplum key)'}
              </Label>
            </span>
          )}
        </div>

        <h1 className="mt-8 text-3xl leading-tight tracking-tight md:text-4xl">
          The voice, <em className="font-serif italic text-teal-700">as clinical data.</em>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-neutral-600">
          This is the part that makes a banked voice survive. Not a file on a laptop that gets lost
          in the move to hospice — a first-class part of the medical record, findable by whoever is
          caring for this person in two years.
        </p>

        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

        <div className="mt-10 space-y-5">
          {groups.map((g) => (
            <Panel key={g.title} title={g.title} subtitle={g.note}>
              <pre className="max-h-80 overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 font-mono text-[11px] leading-relaxed text-neutral-600">
                {JSON.stringify(g.data ?? null, shortenSignedUrls, 2)}
              </pre>
            </Panel>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}