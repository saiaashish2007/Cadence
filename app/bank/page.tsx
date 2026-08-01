'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRecorder } from '@/components/useRecorder';
import { Button, Field, Panel, Percent, Waveform } from '@/components/ui';

type Coverage = {
  covered: string[];
  missing: string[];
  ratio: number;
  byClass: { name: string; covered: number; total: number }[];
};

type Prompt = {
  kind: 'phonetic' | 'message';
  spoken: string;
  sentence?: string;
  recipient?: string;
  occasion?: string;
  rationale: string;
  sessionComplete: boolean;
};

type Recording = {
  id: string;
  kind: 'phonetic' | 'message';
  transcript: string;
  recipient?: string;
  occasion?: string;
  confidence: number;
  audioUrl: string;
  fhir?: { mediaId: string; communicationId?: string };
};

type CoverageResult = {
  source: string;
  active: boolean;
  payerName?: string;
  planName?: string;
  benefits: {
    name?: string;
    serviceTypes?: string[];
    benefitAmount?: string;
    benefitPercent?: string;
    notes?: string[];
  }[];
  approvalPath: string[];
};

export default function BankPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [diagnosis, setDiagnosis] = useState('Amyotrophic lateral sclerosis (ALS), newly diagnosed');
  const [fhirLinked, setFhirLinked] = useState(false);

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [services, setServices] = useState<Record<string, unknown> | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  // Tracked separately from `busy` so the coverage and pipeline panels can
  // repaint the instant a recording is banked, while only the prompt card
  // shows a pending state for the ~8s the model takes to choose what's next.
  const [promptLoading, setPromptLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sgd, setSgd] = useState<CoverageResult | null>(null);

  const recorder = useRecorder();
  const agentAudio = useRef<HTMLAudioElement | null>(null);

  /** Speak the agent's prompt aloud. Silently no-ops without a Deepgram key. */
  const speakPrompt = useCallback(async (text: string) => {
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      agentAudio.current?.pause();
      const audio = new Audio(url);
      agentAudio.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play().catch(() => {});
    } catch {
      /* TTS is an enhancement; the prompt is on screen regardless. */
    }
  }, []);

  const loadPrompt = useCallback(
    async (id: string, speak = true) => {
      setPromptLoading(true);
      setPrompt(null);
      setError(null);
      try {
        const res = await fetch('/api/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'prompt failed');
        setPrompt(json.prompt);
        setCoverage(json.coverage);
        if (speak) void speakPrompt(json.prompt.spoken);
      } catch (err) {
        setError(String(err));
      } finally {
        setPromptLoading(false);
      }
    },
    [speakPrompt]
  );

  async function beginSession(e: React.FormEvent) {
    e.preventDefault();
    setBusy('Provisioning care plan…');
    setError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName, diagnosis }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'could not start session');
      setSessionId(json.session.id);
      setFhirLinked(json.fhirLinked);
      setBusy(null);
      await loadPrompt(json.session.id);
    } catch (err) {
      setError(String(err));
      setBusy(null);
    }
  }

  async function finishTake() {
    if (!sessionId || !prompt) return;
    const blob = await recorder.stop();
    if (!blob) {
      setError('No audio captured. Check the microphone and try again.');
      return;
    }

    setBusy('Transcribing, charting, indexing…');
    setError(null);
    try {
      const form = new FormData();
      form.set('sessionId', sessionId);
      form.set('kind', prompt.kind);
      form.set('expected', prompt.sentence ?? '');
      if (prompt.recipient) form.set('recipient', prompt.recipient);
      if (prompt.occasion) form.set('occasion', prompt.occasion);
      form.set('audio', blob, 'take.webm');

      const res = await fetch('/api/bank', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'could not bank recording');

      // Paint the results of this recording before waiting on the next prompt:
      // the coverage jump is the interesting part and it's already computed.
      setRecordings((prev) => [...prev, json.recording]);
      setCoverage(json.coverage);
      setServices(json.services);
      setBusy(null);

      await loadPrompt(sessionId);
    } catch (err) {
      setError(String(err));
      setBusy(null);
    }
  }

  async function runCoverageCheck() {
    if (!sessionId) return;
    setBusy('Checking eligibility (270/271)…');
    setError(null);
    try {
      const res = await fetch('/api/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'eligibility check failed');
      setSgd(json.coverage);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => () => agentAudio.current?.pause(), []);

  // ---------------------------------------------------------------- intake
  if (!sessionId) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone-dim hover:text-bone">
          ← Cadence
        </Link>

        <h1 className="mt-8 font-display text-4xl leading-tight">
          The most important recording session of your life.
        </h1>
        <p className="mt-4 text-bone-dim">
          This takes about twenty minutes. You can stop at any point and come back — everything
          banked so far is saved to your record.
        </p>

        <form onSubmit={beginSession} className="mt-8 space-y-5">
          <Field
            label="Patient name"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="Ellen Rourke"
            required
          />
          <Field
            label="Diagnosis"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            required
          />

          <div className="rounded-lg border border-white/10 bg-ink-2 p-4 text-xs leading-relaxed text-bone-dim">
            <p className="font-mono uppercase tracking-[0.16em] text-bone">Consent</p>
            <p className="mt-2">
              Recordings are stored against this patient&rsquo;s record as FHIR{' '}
              <span className="font-mono text-bone">Media</span> and{' '}
              <span className="font-mono text-bone">Communication</span> resources, and are
              retrievable by the patient and their care team. A synthetic voice built from them can
              be revoked. Consent is a feature of this system, not a footnote — a banked voice is
              impersonation-grade material and is access-controlled accordingly.
            </p>
          </div>

          {error && <p className="text-sm text-ember">{error}</p>}

          <Button type="submit" disabled={Boolean(busy)} className="w-full">
            {busy ?? 'Begin session'}
          </Button>
        </form>
      </main>
    );
  }

  // ---------------------------------------------------------------- session
  const messages = recordings.filter((r) => r.kind === 'message');

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone-dim hover:text-bone">
          ← Cadence
        </Link>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-bone-dim">
          {patientName} · session {sessionId.slice(0, 8)} ·{' '}
          <span className={fhirLinked ? 'text-sage' : 'text-bone-dim'}>
            {fhirLinked ? 'charting to Medplum' : 'FHIR projected (no Medplum key)'}
          </span>
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* -------------------------------------------------- capture */}
        <div className="space-y-6">
          <Panel
            title={prompt?.kind === 'message' ? 'Message banking' : 'Voice banking'}
            subtitle={prompt?.rationale}
            accent={prompt?.kind === 'message'}
          >
            {prompt ? (
              <div className="rise" key={prompt.spoken}>
                <p className="font-display text-2xl leading-snug">{prompt.spoken}</p>

                {prompt.sentence && (
                  <p className="mt-5 rounded-lg border border-white/10 bg-ink px-4 py-4 font-display text-xl leading-relaxed text-ember-soft">
                    &ldquo;{prompt.sentence}&rdquo;
                  </p>
                )}

                {prompt.kind === 'message' && (prompt.recipient || prompt.occasion) && (
                  <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-bone-dim">
                    {prompt.recipient && <>for {prompt.recipient}</>}
                    {prompt.recipient && prompt.occasion && ' · '}
                    {prompt.occasion}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <span className="inline-flex gap-[3px]" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="bar h-4 w-[3px] rounded-full bg-ember"
                      style={{ animationDelay: `${i * 140}ms` }}
                    />
                  ))}
                </span>
                <p className="text-bone-dim">
                  {promptLoading ? 'Choosing what to ask next…' : 'Loading…'}
                </p>
              </div>
            )}

            <div className="mt-6 rounded-lg border border-white/10 bg-ink p-4">
              <Waveform level={recorder.level} active={recorder.recording} />
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-xs text-bone-dim">
                  {recorder.recording
                    ? `recording · ${String(Math.floor(recorder.seconds / 60)).padStart(2, '0')}:${String(recorder.seconds % 60).padStart(2, '0')}`
                    : 'ready'}
                </span>

                {recorder.recording ? (
                  <Button variant="danger" onClick={finishTake} disabled={Boolean(busy)}>
                    Stop &amp; bank
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => prompt && speakPrompt(prompt.spoken)}
                      disabled={Boolean(busy) || !prompt}
                    >
                      Replay prompt
                    </Button>
                    <Button onClick={recorder.start} disabled={Boolean(busy) || !prompt}>
                      Record
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {(busy || recorder.error || error) && (
              <p className={`mt-3 text-sm ${recorder.error || error ? 'text-ember' : 'text-bone-dim'}`}>
                {recorder.error ?? error ?? busy}
              </p>
            )}

            {prompt?.sessionComplete && (
              <p className="mt-4 rounded-lg border border-sage/40 bg-sage/10 px-4 py-3 text-sm text-bone">
                The corpus is complete. There&rsquo;s enough here to build the synthetic voice, and
                the messages are banked in the real one.
              </p>
            )}
          </Panel>

          {/* ------------------------------------------- banked library */}
          <Panel
            title={`Banked · ${recordings.length} recordings, ${messages.length} messages`}
            subtitle="Personal messages play back in their actual voice — no cloning, nothing to sound wrong."
          >
            {recordings.length === 0 ? (
              <p className="text-sm text-bone-dim">Nothing banked yet.</p>
            ) : (
              <ul className="space-y-2">
                {[...recordings].reverse().map((r) => (
                  <li
                    key={r.id}
                    className={`rise rounded-lg border px-4 py-3 ${
                      r.kind === 'message'
                        ? 'border-ember/30 bg-ember/5'
                        : 'border-white/8 bg-ink'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-bone">&ldquo;{r.transcript}&rdquo;</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-dim">
                          {r.kind}
                          {r.recipient && ` · for ${r.recipient}`}
                          {r.occasion && ` · ${r.occasion}`}
                          {r.fhir && ` · Media/${r.fhir.mediaId.slice(0, 8)}`}
                        </p>
                      </div>
                      <audio controls src={r.audioUrl} className="h-8 w-44 shrink-0" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* -------------------------------------------------- clinical side */}
        <div className="space-y-6">
          <Panel title="Phoneme coverage" subtitle="Why the session can stop early instead of running 1,600 sentences.">
            <p className="font-display text-5xl text-ember">
              <Percent value={coverage?.ratio ?? 0} />
              <span className="text-2xl text-bone-dim">%</span>
            </p>

            <div className="mt-4 space-y-2">
              {coverage?.byClass.map((c) => (
                <div key={c.name}>
                  <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-bone-dim">
                    <span>{c.name}</span>
                    <span>
                      {c.covered}/{c.total}
                    </span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-white/8">
                    <div
                      className="h-1 rounded-full bg-ember transition-all duration-500"
                      style={{ width: `${(c.covered / c.total) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {coverage && coverage.missing.length > 0 && (
              <p className="mt-4 font-mono text-[10px] leading-relaxed text-bone-dim">
                STILL MISSING: {coverage.missing.join(' ')}
              </p>
            )}
          </Panel>

          <Panel title="Pipeline" subtitle="What happened to the last recording.">
            <ul className="space-y-2 font-mono text-[11px] text-bone-dim">
              <li>
                <span className="text-bone">deepgram</span> ·{' '}
                {services?.deepgram ? 'transcribed nova-3' : 'not configured'}
              </li>
              <li>
                <span className="text-bone">medplum</span> ·{' '}
                {services?.medplum ? 'Media + Communication written' : 'projected only'}
              </li>
              <li>
                <span className="text-bone">moss</span> ·{' '}
                {services?.moss ? `indexed ${String(services.indexedDocs)} phrases` : 'not configured'}
              </li>
              <li>
                <span className="text-bone">stedi</span> ·{' '}
                {sgd ? `${sgd.source} eligibility returned` : 'pending — run at session end'}
              </li>
            </ul>
            <Link
              href={`/chart/${sessionId}`}
              className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.16em] text-sky hover:underline"
            >
              View FHIR chart →
            </Link>
          </Panel>

          {/* ------------------------------------------- Stedi */}
          <Panel
            title="Speech-generating device"
            subtitle="Medicare and most payers cover SGDs as DME — but only through a specific path."
          >
            {sgd ? (
              <div className="rise space-y-4">
                <p className="text-sm">
                  <span className={sgd.active ? 'text-sage' : 'text-ember'}>
                    {sgd.active ? 'Active coverage' : 'No active coverage found'}
                  </span>
                  {sgd.payerName && <span className="text-bone-dim"> · {sgd.payerName}</span>}
                </p>

                <ul className="space-y-1.5 font-mono text-[11px] text-bone-dim">
                  {sgd.benefits.slice(0, 5).map((b, i) => (
                    <li key={i}>
                      <span className="text-bone">{b.name}</span>
                      {b.benefitPercent && ` · ${Math.round(Number(b.benefitPercent) * 100)}%`}
                      {b.benefitAmount && ` · $${b.benefitAmount}`}
                      {b.serviceTypes?.length ? ` · ${b.serviceTypes[0]}` : ''}
                    </li>
                  ))}
                </ul>

                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-dim">
                    Approval path
                  </p>
                  <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-bone-dim">
                    {sgd.approvalPath.map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="font-mono text-ember">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {sgd.source === 'demo' && (
                  <p className="text-[11px] text-bone-dim">
                    Sample 271 — set STEDI_API_KEY for a live eligibility check.
                  </p>
                )}
              </div>
            ) : (
              <Button variant="ghost" onClick={runCoverageCheck} disabled={Boolean(busy)} className="w-full">
                Check device coverage
              </Button>
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}
