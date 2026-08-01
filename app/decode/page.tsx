'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRecorder } from '@/components/useRecorder';
import { Button, Panel, Waveform } from '@/components/ui';

type SessionSummary = {
  id: string;
  patientName: string;
  diagnosis: string;
  recordings: { id: string; kind: string; transcript: string }[];
};

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
  high: 'border-sage/50 bg-sage/10 text-sage',
  medium: 'border-ember-soft/50 bg-ember/10 text-ember-soft',
  low: 'border-white/20 bg-white/5 text-bone-dim',
} as const;

export default function DecodePage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [typed, setTyped] = useState('');
  const [context, setContext] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRecorder();

  useEffect(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then((json) => {
        setSessions(json.sessions ?? []);
        if (json.sessions?.[0]) setSessionId(json.sessions[0].id);
      })
      .catch(() => setError('Could not load banked profiles.'));
  }, []);

  /**
   * Two phases on purpose. Phase one is retrieval — it comes back in
   * milliseconds and paints straight away, which is the whole point of running
   * a local index. Phase two is the reading, which takes seconds; it fills in
   * underneath rather than holding the matches hostage.
   */
  const submit = useCallback(async (body: FormData | object) => {
    setError(null);
    setResult(null);
    setBusy('Searching their banked library…');

    const send = (path: string, payload: FormData | object) =>
      fetch(path, {
        method: 'POST',
        ...(payload instanceof FormData
          ? { body: payload }
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
      });

    try {
      const retrieveRes = await send('/api/decode/retrieve', body);
      const retrieved = await retrieveRes.json();
      if (!retrieveRes.ok) throw new Error(retrieved.error ?? 'retrieval failed');

      setResult({ ...retrieved, decoding: null, playbackUrl: null });
      setBusy('Reading it against what they banked…');

      // Reuse the transcript so audio isn't sent to Deepgram a second time.
      const decodeRes = await send('/api/decode', {
        sessionId: retrieved.sessionId ?? sessionId,
        transcript: retrieved.transcript,
        context,
      });
      const decoded = await decodeRes.json();
      if (!decodeRes.ok) throw new Error(decoded.error ?? 'decode failed');

      setResult((prev) =>
        prev
          ? { ...prev, decoding: decoded.decoding, playbackUrl: decoded.playbackUrl }
          : decoded
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }, [sessionId, context]);

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

  const selected = sessions.find((s) => s.id === sessionId);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <Link href="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone-dim hover:text-bone">
        ← Cadence
      </Link>

      <h1 className="mt-8 font-display text-4xl leading-tight">
        What are they trying to say?
      </h1>
      <p className="mt-3 max-w-2xl text-bone-dim">
        Record what you heard, or type your best guess at it. Cadence searches the phrases this
        person banked back when they could still speak clearly, and reads the two against each
        other. The library is the evidence — this is not a general-purpose guess.
      </p>

      {sessions.length === 0 ? (
        <div className="mt-10 rounded-xl border border-white/10 bg-ink-2 p-6">
          <p className="text-bone-dim">
            No banked profiles yet.{' '}
            <Link href="/bank" className="text-ember hover:underline">
              Run a banking session first
            </Link>{' '}
            — the decoder has nothing to search until someone has banked into it.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* ------------------------------------------------ input */}
          <Panel title="Listen" subtitle={selected ? `${selected.patientName} · ${selected.recordings.length} banked phrases` : undefined}>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bone-dim">
                Whose voice
              </span>
              <select
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-white/12 bg-ink px-3 py-2.5 text-sm text-bone focus:border-ember/60 focus:outline-none"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.patientName} — {s.recordings.length} phrases
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-5 rounded-lg border border-white/10 bg-ink p-4">
              <Waveform level={recorder.level} active={recorder.recording} />
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-xs text-bone-dim">
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

            <label className="mt-5 block">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bone-dim">
                Or type what it sounded like
              </span>
              <textarea
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={2}
                placeholder="tuh mai… ah pra… her"
                className="mt-1.5 w-full rounded-lg border border-white/12 bg-ink px-3 py-2.5 text-sm text-bone placeholder:text-bone-dim/60 focus:border-ember/60 focus:outline-none"
              />
              <span className="mt-1 block text-xs text-bone-dim">
                Speech recognition is at its worst on exactly this input, so typing is a
                first-class path, not a fallback.
              </span>
            </label>

            <label className="mt-4 block">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bone-dim">
                Situation (optional)
              </span>
              <input
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Daughter just walked in"
                className="mt-1.5 w-full rounded-lg border border-white/12 bg-ink px-3 py-2.5 text-sm text-bone placeholder:text-bone-dim/60 focus:border-ember/60 focus:outline-none"
              />
            </label>

            <Button
              onClick={() => submit({ sessionId, transcript: typed, context })}
              disabled={Boolean(busy) || !typed.trim()}
              className="mt-5 w-full"
            >
              {busy ?? 'Decode'}
            </Button>

            {error && <p className="mt-3 text-sm text-ember">{error}</p>}
          </Panel>

          {/* ------------------------------------------------ result */}
          <div className="space-y-6">
            {result ? (
              <>
                <Panel title="Most likely meaning" accent>
                  <p className="font-mono text-xs text-bone-dim">
                    heard: &ldquo;{result.transcript}&rdquo;
                    {result.asrConfidence !== null &&
                      ` · asr ${(result.asrConfidence * 100).toFixed(0)}%`}
                  </p>

                  {result.decoding ? (
                    <div className="rise">
                      <p className="mt-4 font-display text-2xl leading-snug">
                        {result.decoding.interpretation}
                      </p>

                      <span
                        className={`mt-4 inline-block rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${
                          CONFIDENCE_STYLES[result.decoding.confidence]
                        }`}
                      >
                        {result.decoding.confidence} confidence
                      </span>

                      <div className="mt-5 rounded-lg border border-white/10 bg-ink px-4 py-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-dim">
                          Try saying
                        </p>
                        <p className="mt-1.5 text-bone">{result.decoding.suggestedResponse}</p>
                      </div>

                      {result.playbackUrl && (
                        <div className="mt-4 rounded-lg border border-ember/40 bg-ember/10 px-4 py-3">
                          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ember">
                            They may be reaching for this — in their own voice
                          </p>
                          <audio controls src={result.playbackUrl} className="mt-2 w-full" />
                        </div>
                      )}

                      {result.decoding.alternatives.length > 0 && (
                        <div className="mt-4">
                          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-dim">
                            Or possibly
                          </p>
                          <ul className="mt-1.5 space-y-1 text-sm text-bone-dim">
                            {result.decoding.alternatives.map((a, i) => (
                              <li key={i}>— {a}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 flex items-center gap-2 text-sm text-bone-dim">
                      <span className="inline-flex gap-[3px]" aria-hidden>
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="bar h-3 w-[3px] rounded-full bg-ember"
                            style={{ animationDelay: `${i * 140}ms` }}
                          />
                        ))}
                      </span>
                      Reading it against what they banked…
                    </p>
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
                    <p className="text-sm text-bone-dim">
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
                              cited ? 'border-ember/40 bg-ember/5' : 'border-white/8 bg-ink'
                            }`}
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="text-sm text-bone">&ldquo;{m.text}&rdquo;</p>
                              <span className="shrink-0 font-mono text-[10px] text-bone-dim">
                                {m.score.toFixed(3)}
                              </span>
                            </div>
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-dim">
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
                <p className="text-sm leading-relaxed text-bone-dim">
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
  );
}
