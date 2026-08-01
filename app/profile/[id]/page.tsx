'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  Label,
  Panel,
  SiteFooter,
  SiteHeader,
  StatusDot,
  ThinkingDots,
} from '@/components/ui';
import { findSession, loadSessions, toLibrary } from '@/lib/client-session';

type Profile = {
  summary: string;
  howTo: string[];
  themes: { name: string; examples: string[] }[];
  people: { name: string; note: string }[];
  limits: string;
};

type Phrase = {
  id: string;
  text: string;
  kind: 'phonetic' | 'message';
  recipient?: string;
  occasion?: string;
  audioUrl?: string;
};

type Observed = {
  id: string;
  heard: string;
  meaning: string;
  situation?: string;
  when?: string;
};

type Sources = {
  patientName: string;
  phrases: Phrase[];
  observed: Observed[];
  source: 'medplum' | 'client';
};

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Sources | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Two requests rather than one. The phrase book and the confirmed meanings
  // are reads and come back immediately; the written briefing takes seconds, so
  // it fills in underneath instead of holding the whole page behind it.
  useEffect(() => {
    const session = findSession(id) ?? loadSessions().find((s) => s.patientId === id);
    const payload = {
      patientId: session?.patientId ?? id,
      patientName: session?.patientName ?? '',
      library: toLibrary(session?.banked ?? []),
      observed: session?.observed ?? [],
    };

    const post = async (path: string) => {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'could not build the profile');
      return json;
    };

    let live = true;

    post('/api/profile/sources')
      .then((json: Sources) => live && setData(json))
      .catch((err) => live && setError(String(err)));

    post('/api/profile')
      .then((json: { profile: Profile }) => live && setProfile(json.profile))
      // The evidence below is still worth showing if only the briefing failed.
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [id]);

  // The phrase book is a lookup tool, not a list to scroll — a caregiver
  // arrives with a word they half-heard.
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.phrases;
    return data.phrases.filter(
      (p) =>
        p.text.toLowerCase().includes(q) ||
        p.recipient?.toLowerCase().includes(q) ||
        p.occasion?.toLowerCase().includes(q)
    );
  }, [data, query]);

  const messages = filtered.filter((p) => p.kind === 'message');
  const phonetic = filtered.filter((p) => p.kind !== 'message');

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader cta={{ href: '/decode', label: 'Open decoder' }} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10 md:py-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label className="text-teal-700">Communication profile</Label>
          {data && (
            <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1.5">
              <StatusDot live={data.source === 'medplum'} />
              <Label>{data.source === 'medplum' ? 'from Medplum' : 'from this browser'}</Label>
            </span>
          )}
        </div>

        <h1 className="mt-4 text-3xl leading-tight tracking-tight md:text-4xl">
          How to talk with{' '}
          <em className="font-serif italic text-teal-700">
            {data?.patientName || 'this person'}.
          </em>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-neutral-600">
          Written for whoever is with them today — a night nurse on a first shift, a new aide, a
          doctor who has two minutes. Everything here comes from phrases they recorded in their own
          voice, and from meanings their caregivers have since confirmed.
        </p>

        {error && (
          <Card className="mt-8 bg-neutral-50">
            <p className="text-sm text-neutral-600">{error}</p>
            <Link href="/bank" className="mt-2 inline-block text-sm text-teal-700 underline">
              Run a banking session first
            </Link>
          </Card>
        )}

        {!data && !error && (
          <div className="mt-10">
            <ThinkingDots label="Reading their library…" />
          </div>
        )}

        {data && (
          <div className="mt-10 space-y-6">
            {profile ? (
              <Panel title="In short" accent>
                <p className="text-lg leading-relaxed">{profile.summary}</p>
              </Panel>
            ) : (
              <Panel title="In short" accent>
                <ThinkingDots label="Writing the briefing from their own words…" />
              </Panel>
            )}

            {profile && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="What to do" subtitle="Practical, in the next five minutes.">
                  <ol className="space-y-3">
                    {profile.howTo.map((step, i) => (
                      <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                        <span className="font-mono text-xs text-teal-600">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </Panel>

                <Panel title="Who matters to them" subtitle="Names that recur in what they banked.">
                  {profile.people.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      Not enough banked yet to say. Treat any name they use as important.
                    </p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {profile.people.map((p) => (
                        <li key={p.name} className="py-3 first:pt-0 last:pb-0">
                          <p className="text-[15px] font-medium">{p.name}</p>
                          <p className="mt-1 text-sm leading-relaxed text-neutral-600">{p.note}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            )}

            {profile && profile.themes.length > 0 && (
              <Panel
                title="What they return to"
                subtitle="Their own words, quoted — this is the evidence behind everything above."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  {profile.themes.map((t) => (
                    <div key={t.name}>
                      <Label>{t.name}</Label>
                      <ul className="mt-2 space-y-1.5">
                        {t.examples.map((e, i) => (
                          <li key={i} className="text-sm leading-relaxed text-neutral-600">
                            &ldquo;{e}&rdquo;
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* ----------------------------------------------- glossary */}
            <Panel
              title={`Confirmed meanings · ${data.observed.length}`}
              subtitle="Utterances a caregiver heard and confirmed. The decoder searches these first."
            >
              {data.observed.length === 0 ? (
                <p className="text-sm leading-relaxed text-neutral-500">
                  Nothing confirmed yet. When you decode something and confirm what it meant, it
                  lands here — and the next person who hears it gets your answer instead of a
                  guess.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {data.observed.map((o) => (
                    <li key={o.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="font-mono text-xs text-neutral-500">
                        heard &ldquo;{o.heard}&rdquo;
                      </p>
                      <p className="mt-1 text-[15px]">{o.meaning}</p>
                      {o.situation && (
                        <p className="mt-1 text-xs text-neutral-500">{o.situation}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* ---------------------------------------------- phrasebook */}
            <Panel
              title={`Phrase book · ${data.phrases.length}`}
              subtitle="Everything they banked, in their own voice. Search it when you half-hear something."
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search their phrases — a word, a name, an occasion"
                className="w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-neutral-400 focus:border-teal-500 focus:outline-none"
              />

              {filtered.length === 0 ? (
                <p className="mt-4 text-sm text-neutral-500">
                  Nothing matches &ldquo;{query}&rdquo;. Try the decoder — it searches by sound and
                  meaning, not spelling.
                </p>
              ) : (
                <div className="mt-5 space-y-6">
                  {messages.length > 0 && (
                    <div>
                      <Label className="text-teal-700">Personal messages · {messages.length}</Label>
                      <ul className="mt-2 space-y-2">
                        {messages.map((p) => (
                          <li
                            key={p.id}
                            className="rounded-lg border border-teal-200 bg-teal-50/50 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm leading-relaxed">
                                  &ldquo;{p.text}&rdquo;
                                </p>
                                {(p.recipient || p.occasion) && (
                                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                                    {p.recipient && `for ${p.recipient}`}
                                    {p.recipient && p.occasion && ' · '}
                                    {p.occasion}
                                  </p>
                                )}
                              </div>
                              {p.audioUrl && (
                                <audio controls src={p.audioUrl} className="h-8 w-44 shrink-0" />
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {phonetic.length > 0 && (
                    <div>
                      <Label>Corpus samples · {phonetic.length}</Label>
                      <ul className="mt-2 space-y-2">
                        {phonetic.map((p) => (
                          <li
                            key={p.id}
                            className="rounded-lg border border-neutral-200 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <p className="min-w-0 flex-1 text-sm leading-relaxed text-neutral-600">
                                &ldquo;{p.text}&rdquo;
                              </p>
                              {p.audioUrl && (
                                <audio controls src={p.audioUrl} className="h-8 w-44 shrink-0" />
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Panel>

            {profile && (
              <Card className="bg-neutral-50">
                <Label>What this profile can&rsquo;t tell you</Label>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{profile.limits}</p>
              </Card>
            )}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
