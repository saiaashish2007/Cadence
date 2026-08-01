'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRecorder } from '@/components/useRecorder';
import {
  Button,
  Card,
  Label,
  Panel,
  Select,
  SiteFooter,
  SiteHeader,
  TextArea,
  ThinkingDots,
  Waveform,
} from '@/components/ui';
import {
  loadSessions,
  saveSession,
  toLibrary,
  type CadenceSession,
} from '@/lib/client-session';

type Match = {
  id: string;
  text: string;
  score: number;
  kind: string;
  recipient?: string;
  occasion?: string;
  mediaId?: string;
};

type Decoding = {
  interpretation: string;
  confidence: 'high' | 'medium' | 'low';
  alternatives: string[];
  suggestedResponse: string;
  groundedIn: string[];
};

/**
 * Retrieval lands in milliseconds; the reading takes seconds. They're separate
 * pieces of state so the banked matches can paint immediately rather than
 * sitting behind the model call.
 */
type Result = {
  transcript: string;
  asrConfidence: number | null;
  matches: Match[];
  retrieval: { engine: string; latencyMs: number | null };
  decoding: Decoding | null;
  playbackUrl: string | null;
};

const CONFIDENCE_STYLES = {
  high: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-neutral-200 bg-neutral-50 text-neutral-600',
} as const;

export default function DecodePage() {
  const [sessions, setSessions] = useState<CadenceSession[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [typed, setTyped] = useState('');
  const [context, setContext] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The confirmation loop: what the caregiver says it actually meant.
  const [correction, setCorrection] = useState('');
  const [confirmState, setConfirmState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const recorder = useRecorder();

  // Profiles come from the browser, not the server: the banking tab wrote them
  // there, and localStorage is shared across tabs of the same origin.
  useEffect(() => {
    const refresh = () => {
      const found = loadSessions();
      setSessions(found);
      setSessionId((current) => current || found[0]?.id || '');
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const selected = useMemo(
    () => sessions.find((s) => s.id === sessionId),
    [sessions, sessionId]
  );

  /**
   * Two phases on purpose. Phase one is retrieval — it comes back in
   * milliseconds and paints straight away, which is the whole point of running
   * a local index. Phase two is the reading, which takes seconds; it fills in
   * underneath rather than holding the matches hostage.
   */
  const submit = useCallback(
    async (body: FormData | object) => {
      setError(null);
      setResult(null);
      setCorrection('');
      setConfirmState('idle');
      setBusy('Searching their banked library…');

      const library = toLibrary(selected?.banked ?? []);

      const send = (path: string, payload: FormData | object) => {
        if (payload instanceof FormData) {
          payload.set('library', JSON.stringify(library));
          return fetch(path, { method: 'POST', body: payload });
        }
        return fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, library }),
        });
      };

      try {
        const retrieveRes = await send('/api/decode/retrieve', body);
        const retrieved = await retrieveRes.json();
        if (!retrieveRes.ok) throw new Error(retrieved.error ?? 'retrieval failed');

        setResult({ ...retrieved, decoding: null, playbackUrl: null });
        setBusy('Reading it against what they banked…');

        // Reuse the transcript so audio isn't sent to Deepgram a second time.
        const decodeRes = await send('/api/decode', {
          sessionId: retrieved.sessionId || sessionId,
          transcript: retrieved.transcript,
          context,
        });
        const decoded = await decodeRes.json();
        if (!decodeRes.ok) throw new Error(decoded.error ?? 'decode failed');

        setResult((prev) =>
          prev ? { ...prev, decoding: decoded.decoding, playbackUrl: decoded.playbackUrl } : decoded
        );
      } catch (err) {
        setError(String(err));
      } finally {
        setBusy(null);
      }
    },
    [sessionId, context, selected]
  );

  /**
   * Teach the library. The pair is charted to FHIR and indexed on the heard
   * form, so the next person who hears this gets the confirmed reading rather
   * than starting from a guess again.
   */
  async function confirmMeaning(meaning: string) {
    if (!result || !selected || !meaning.trim()) return;
    setConfirmState('saving');
    setError(null);
    try {
      const res = await fetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selected.id,
          patientId: selected.patientId,
          heard: result.transcript,
          meaning,
          situation: context || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'could not save the confirmation');

      const next: CadenceSession = {
        ...selected,
        observed: [json.observed, ...(selected.observed ?? [])],
        updatedAt: new Date().toISOString(),
      };
      saveSession(next);
      setSessions(loadSessions());
      setConfirmState('saved');
    } catch (err) {
      setError(String(err));
      setConfirmState('idle');
    }
  }

  async function decodeRecorded() {
    const blob = await recorder.stop();
    if (!blob) {
      setError('No audio captured.');
      return;
    }
    const form = new FormData();
    form.set('sessionId', sessionId);
    form.set('context', context);
    form.set('transcript', typed);
    form.set('audio', blob, 'utterance.webm');
    await submit(form);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader cta={{ href: '/bank', label: 'Bank a voice' }} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:py-14">
        <Label className="text-teal-700">Decoder</Label>
        <h1 className="mt-4 text-3xl leading-tight tracking-tight md:text-4xl">
          What are they{' '}
          <em className="font-serif italic text-teal-700">trying to say?</em>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-neutral-600">
          Record what you heard, or type your best guess. Cadence searches the phrases this person
          banked back when they could still speak clearly, and reads the two against each other.
          The library is the evidence — this is not a general-purpose guess.
        </p>

        {sessions.length === 0 ? (
          <Card className="mt-10 bg-neutral-50">
            <p className="text-sm leading-relaxed text-neutral-600">
              No banked profiles in this browser yet.{' '}
              <Link href="/bank" className="text-teal-700 underline">
                Run a banking session first
              </Link>{' '}
              — the decoder has nothing to search until someone has banked into it.
            </p>
          </Card>
        ) : (
          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            {/* ------------------------------------------------ input */}
            <Panel
              title="Listen"
              subtitle={
                selected
                  ? `${selected.patientName} · ${selected.banked.length} banked phrases`
                  : undefined
              }
            >
              <Select
                label="Whose voice"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.patientName} — {s.banked.length} phrases
                  </option>
                ))}
              </Select>

              {selected && (
                <Link
                  href={`/profile/${selected.patientId ?? selected.id}`}
                  className="mt-2 inline-block font-mono text-[11px] uppercase tracking-widest text-teal-700 hover:underline"
                >
                  Read their communication profile →
                </Link>
              )}

              <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <Waveform level={recorder.level} active={recorder.recording} />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-xs text-neutral-500">
                    {recorder.recording ? `listening · ${recorder.seconds}s` : 'ready'}
                  </span>
                  {recorder.recording ? (
                    <Button variant="danger" onClick={decodeRecorded} disabled={Boolean(busy)}>
                      Stop &amp; decode
                    </Button>
                  ) : (
                    <Button onClick={recorder.start} disabled={Boolean(busy)}>
                      Record what you heard
                    </Button>
                  )}
                </div>
              </div>

              {recorder.error && <p className="mt-3 text-sm text-red-600">{recorder.error}</p>}

              <div className="mt-5 space-y-4">
                <TextArea
                  label="Or type what it sounded like"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  rows={2}
                  placeholder="tuh mai… ah pra… her"
                  hint="Speech recognition is at its worst on exactly this input, so typing is a first-class path, not a fallback."
                />

                <label className="block">
                  <Label>Situation (optional)</Label>
                  <input
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Daughter just walked in"
                    className="mt-2 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-neutral-400 focus:border-teal-500 focus:outline-none"
                  />
                </label>
              </div>

              <Button
                onClick={() => submit({ sessionId, transcript: typed, context })}
                disabled={Boolean(busy) || !typed.trim()}
                className="mt-5 w-full"
              >
                {busy ?? 'Decode'}
              </Button>

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </Panel>

            {/* ------------------------------------------------ result */}
            <div className="space-y-6">
              {result ? (
                <>
                  <Panel title="Most likely meaning" accent>
                    <p className="font-mono text-xs text-neutral-500">
                      heard: &ldquo;{result.transcript}&rdquo;
                      {result.asrConfidence !== null &&
                        ` · asr ${(result.asrConfidence * 100).toFixed(0)}%`}
                    </p>

                    {result.decoding ? (
                      <div className="rise">
                        <p className="mt-4 text-2xl leading-snug tracking-tight">
                          {result.decoding.interpretation}
                        </p>

                        <span
                          className={`mt-4 inline-block rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${
                            CONFIDENCE_STYLES[result.decoding.confidence]
                          }`}
                        >
                          {result.decoding.confidence} confidence
                        </span>

                        <div className="mt-5 rounded-lg border border-neutral-200 bg-white px-4 py-3">
                          <Label>Try saying</Label>
                          <p className="mt-1.5 text-[15px]">{result.decoding.suggestedResponse}</p>
                        </div>

                        {result.playbackUrl && (
                          <div className="mt-4 rounded-lg border border-teal-200 bg-white px-4 py-3">
                            <Label className="text-teal-700">
                              They may be reaching for this — in their own voice
                            </Label>
                            <audio controls src={result.playbackUrl} className="mt-2 w-full" />
                          </div>
                        )}

                        {result.decoding.alternatives.length > 0 && (
                          <div className="mt-4">
                            <Label>Or possibly</Label>
                            <ul className="mt-1.5 space-y-1 text-sm text-neutral-600">
                              {result.decoding.alternatives.map((a, i) => (
                                <li key={i}>— {a}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* ------------------------------- the learning loop */}
                        <div className="mt-6 border-t border-neutral-200 pt-5">
                          {confirmState === 'saved' ? (
                            <p className="text-sm text-emerald-700">
                              Saved to their profile. The next person who hears this gets your
                              answer instead of a guess.{' '}
                              <Link
                                href={`/profile/${selected?.patientId ?? sessionId}`}
                                className="underline"
                              >
                                See the profile
                              </Link>
                            </p>
                          ) : (
                            <>
                              <Label>Did you work out what they meant?</Label>
                              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                                Only confirm once you actually know — this becomes what the next
                                caregiver is told.
                              </p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  variant="secondary"
                                  disabled={confirmState === 'saving'}
                                  onClick={() =>
                                    confirmMeaning(result.decoding!.interpretation)
                                  }
                                >
                                  {confirmState === 'saving'
                                    ? 'Saving…'
                                    : 'That reading was right'}
                                </Button>
                              </div>

                              <div className="mt-3 flex flex-wrap items-end gap-2">
                                <label className="min-w-[200px] flex-1">
                                  <Label>No — they actually meant</Label>
                                  <input
                                    value={correction}
                                    onChange={(e) => setCorrection(e.target.value)}
                                    placeholder="She wanted the window closed"
                                    className="mt-2 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-neutral-400 focus:border-teal-500 focus:outline-none"
                                  />
                                </label>
                                <Button
                                  variant="secondary"
                                  disabled={confirmState === 'saving' || !correction.trim()}
                                  onClick={() => confirmMeaning(correction)}
                                >
                                  Correct it
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <ThinkingDots label="Reading it against what they banked…" />
                      </div>
                    )}
                  </Panel>

                  <Panel
                    title="Retrieved from their banked library"
                    subtitle={
                      result.retrieval.latencyMs !== null
                        ? `${result.retrieval.engine} · ${result.retrieval.latencyMs.toFixed(1)}ms — fast enough to sit inside a conversation`
                        : undefined
                    }
                  >
                    {result.matches.length === 0 ? (
                      <p className="text-sm text-neutral-600">
                        Nothing in the library came close. The reading above is from the
                        transcription alone — treat it with more caution.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {result.matches.map((m) => {
                          // Citations only exist once the reading lands.
                          const cited = result.decoding?.groundedIn.includes(m.id) ?? false;
                          return (
                            <li
                              key={m.id}
                              className={`rounded-lg border px-4 py-2.5 ${
                                cited ? 'border-teal-200 bg-teal-50/50' : 'border-neutral-200'
                              }`}
                            >
                              <div className="flex items-baseline justify-between gap-3">
                                <p className="text-sm">&ldquo;{m.text}&rdquo;</p>
                                <span className="shrink-0 font-mono text-[10px] text-neutral-500">
                                  {m.score.toFixed(3)}
                                </span>
                              </div>
                              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                                {m.kind}
                                {m.recipient && ` · for ${m.recipient}`}
                                {m.occasion && ` · ${m.occasion}`}
                                {cited && ' · cited'}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Panel>
                </>
              ) : (
                <Panel title="Result">
                  <p className="text-sm leading-relaxed text-neutral-600">
                    Nothing decoded yet. A note on reading the output: low confidence is the honest
                    answer more often than anyone would like. A confident wrong guess is worse than
                    an admitted uncertainty — it means this person gets misunderstood again by
                    someone who was trying to help.
                  </p>
                </Panel>
              )}
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
