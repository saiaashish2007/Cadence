'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRecorder } from '@/components/useRecorder';
import {
  Button,
  Card,
  Field,
  Label,
  Panel,
  Percent,
  Select,
  SiteFooter,
  SiteHeader,
  StatusDot,
  ThinkingDots,
  Waveform,
} from '@/components/ui';
import {
  loadSessions,
  saveSession,
  type BankedRecording,
  type CadenceSession,
} from '@/lib/client-session';

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
  essentialId?: string;
  recipient?: string;
  occasion?: string;
  rationale: string;
  sessionComplete: boolean;
};

type Deck = { total: number; banked: number };

const DIAGNOSES = [
  'Amyotrophic lateral sclerosis (ALS)',
  'Laryngectomy or planned laryngectomy',
  'Head and neck cancer',
  'Parkinson’s disease',
  'Multiple sclerosis (MS)',
  'Stroke or aphasia',
  'Cerebral palsy',
  'Traumatic brain injury',
  'Other communication-impacting condition',
] as const;

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
  const [session, setSession] = useState<CadenceSession | null>(null);
  const [savedSessions, setSavedSessions] = useState<CadenceSession[]>([]);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [diagnosis, setDiagnosis] = useState<(typeof DIAGNOSES)[number]>('Amyotrophic lateral sclerosis (ALS)');
  const [otherDiagnosis, setOtherDiagnosis] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [diagnosisDate, setDiagnosisDate] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('English');
  const [supportPersonName, setSupportPersonName] = useState('');
  const [supportPersonPhone, setSupportPersonPhone] = useState('');
  const [communicationNotes, setCommunicationNotes] = useState('');

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
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

  // The session is mirrored to localStorage on every change: it's what the
  // decoder tab reads, and what the next request sends to a server that
  // remembers nothing between invocations.
  const persist = useCallback((next: CadenceSession) => {
    setSession(next);
    saveSession(next);
  }, []);

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
    async (current: CadenceSession, speak = true) => {
      setPromptLoading(true);
      setPrompt(null);
      setError(null);
      try {
        const res = await fetch('/api/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: current.id,
            patientName: current.patientName,
            diagnosis: current.diagnosis,
            patientId: current.patientId,
            banked: current.banked,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'prompt failed');
        setPrompt(json.prompt);
        setDeck(json.deck ?? null);
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

  // A banking session already writes every take to localStorage and Medplum;
  // this is the missing other half of that contract. Returning to /bank now
  // offers the saved work instead of showing a blank intake form.
  useEffect(() => {
    const refreshSavedSessions = () => setSavedSessions(loadSessions());
    refreshSavedSessions();
    window.addEventListener('storage', refreshSavedSessions);
    return () => window.removeEventListener('storage', refreshSavedSessions);
  }, []);

  async function resumeSession(saved: CadenceSession) {
    persist(saved);
    setSaveNotice(`Resumed ${saved.patientName}'s saved session.`);
    await loadPrompt(saved, false);
  }

  function saveProgress() {
    if (!session) return;
    persist({ ...session, updatedAt: new Date().toISOString() });
    setSavedSessions(loadSessions());
    setSaveNotice('Progress saved. You can safely leave and resume this session later.');
  }

  async function beginSession(e: React.FormEvent) {
    e.preventDefault();
    const diagnosisLabel =
      diagnosis === 'Other communication-impacting condition' ? otherDiagnosis.trim() : diagnosis;
    if (!diagnosisLabel) {
      setError('Please enter the diagnosis or condition.');
      return;
    }
    setBusy('Provisioning care plan…');
    setError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName,
          diagnosis: diagnosisLabel,
          birthDate,
          diagnosisDate,
          pronouns,
          preferredLanguage,
          supportPersonName,
          supportPersonPhone,
          communicationNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'could not start session');

      const now = new Date().toISOString();
      const next: CadenceSession = {
        id: json.session.id,
        patientName,
        diagnosis: diagnosisLabel,
        birthDate: birthDate || undefined,
        diagnosisDate: diagnosisDate || undefined,
        pronouns: pronouns || undefined,
        preferredLanguage: preferredLanguage || undefined,
        supportPersonName: supportPersonName || undefined,
        supportPersonPhone: supportPersonPhone || undefined,
        communicationNotes: communicationNotes || undefined,
        patientId: json.session.fhir?.patientId,
        carePlanId: json.session.fhir?.carePlanId,
        conditionId: json.session.fhir?.conditionId,
        fhirLinked: Boolean(json.fhirLinked),
        createdAt: now,
        updatedAt: now,
        banked: [],
        observed: [],
      };
      persist(next);
      setSavedSessions(loadSessions());
      setBusy(null);
      await loadPrompt(next);
    } catch (err) {
      setError(String(err));
      setBusy(null);
    }
  }

  async function finishTake() {
    if (!session || !prompt) return;
    const blob = await recorder.stop();
    if (!blob) {
      setError('No audio captured. Check the microphone and try again.');
      return;
    }

    setBusy('Transcribing, charting, indexing…');
    setError(null);
    try {
      const form = new FormData();
      form.set('sessionId', session.id);
      form.set('patientName', session.patientName);
      form.set('diagnosis', session.diagnosis);
      if (session.patientId) form.set('patientId', session.patientId);
      form.set('kind', prompt.kind);
      form.set('expected', prompt.sentence ?? '');
      if (prompt.essentialId) form.set('essentialId', prompt.essentialId);
      if (prompt.recipient) form.set('recipient', prompt.recipient);
      if (prompt.occasion) form.set('occasion', prompt.occasion);
      form.set('banked', JSON.stringify(session.banked));
      form.set('audio', blob, 'take.webm');

      const res = await fetch('/api/bank', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'could not bank recording');

      const recording: BankedRecording = {
        id: json.recording.id,
        kind: json.recording.kind,
        transcript: json.recording.transcript,
        recipient: json.recording.recipient,
        occasion: json.recording.occasion,
        confidence: json.recording.confidence ?? 0,
        durationSeconds: json.recording.durationSeconds ?? 0,
        mediaId: json.recording.mediaId,
        audioUrl: json.recording.audioUrl,
        essentialId: json.recording.essentialId ?? prompt.essentialId,
      };

      // Paint the results of this recording before waiting on the next prompt:
      // the coverage jump is the interesting part and it's already computed.
      const next: CadenceSession = {
        ...session,
        banked: [...session.banked, recording],
        updatedAt: new Date().toISOString(),
      };
      persist(next);
      setCoverage(json.coverage);
      setServices(json.services);
      setBusy(null);

      await loadPrompt(next);
    } catch (err) {
      setError(String(err));
      setBusy(null);
    }
  }

  async function runCoverageCheck() {
    if (!session) return;
    setBusy('Checking eligibility (270/271)…');
    setError(null);
    try {
      const res = await fetch('/api/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          patientName: session.patientName,
          diagnosis: session.diagnosis,
        }),
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
  if (!session) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader cta={{ href: '/decode', label: 'Open decoder' }} />

        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
          <Label className="text-teal-700">New session</Label>
          <h1 className="mt-4 text-3xl leading-tight tracking-tight md:text-4xl">
            The most important recording session{' '}
            <em className="font-serif italic text-teal-700">of your life.</em>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-neutral-600">
            This takes about twenty minutes. Start with the details that make the voice bank useful
            to the next care team — everything here is written to the patient record.
          </p>

          {savedSessions.length > 0 && (
            <Card className="mt-8 border-teal-200 bg-teal-50/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Label className="text-teal-700">Saved sessions</Label>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                    Recordings and intake details are saved as you go. Pick up where you left off.
                  </p>
                </div>
                <span className="font-mono text-[11px] uppercase tracking-widest text-teal-700">
                  {savedSessions.length} saved
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {savedSessions.slice(0, 3).map((saved) => (
                  <button
                    key={saved.id}
                    type="button"
                    onClick={() => void resumeSession(saved)}
                    className="flex w-full items-center justify-between gap-4 rounded-lg border border-teal-100 bg-white px-4 py-3 text-left transition-colors hover:bg-teal-50"
                  >
                    <span>
                      <span className="block text-sm font-medium">{saved.patientName}</span>
                      <span className="mt-1 block text-xs text-neutral-500">
                        {saved.diagnosis} · {saved.banked.length} recording
                        {saved.banked.length === 1 ? '' : 's'} saved
                      </span>
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-widest text-teal-700">
                      Resume →
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <form onSubmit={beginSession} className="mt-10 space-y-5">
            <Card className="bg-neutral-50">
              <Label className="text-teal-700">Patient &amp; diagnosis</Label>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field
                  label="Patient name"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Ellen Rourke"
                  required
                />
                <Field
                  label="Date of birth"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  hint="Optional"
                />
                <Select
                  label="Diagnosis or use case"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value as (typeof DIAGNOSES)[number])}
                >
                  {DIAGNOSES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
                <Field
                  label="Diagnosis date"
                  type="date"
                  value={diagnosisDate}
                  onChange={(e) => setDiagnosisDate(e.target.value)}
                  hint="Optional — anchors the speech baseline"
                />
              </div>

              {diagnosis === 'Other communication-impacting condition' && (
                <div className="mt-4">
                  <Field
                    label="Diagnosis or condition"
                    value={otherDiagnosis}
                    onChange={(e) => setOtherDiagnosis(e.target.value)}
                    placeholder="e.g. progressive supranuclear palsy"
                    required
                  />
                </div>
              )}
            </Card>

            <Card>
              <Label>Communication &amp; support</Label>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field
                  label="Pronouns"
                  value={pronouns}
                  onChange={(e) => setPronouns(e.target.value)}
                  placeholder="she/her"
                  hint="Optional"
                />
                <Field
                  label="Preferred language"
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  placeholder="English"
                />
                <Field
                  label="Primary support person"
                  value={supportPersonName}
                  onChange={(e) => setSupportPersonName(e.target.value)}
                  placeholder="Maya Rourke"
                  hint="Optional"
                />
                <Field
                  label="Support person phone"
                  type="tel"
                  value={supportPersonPhone}
                  onChange={(e) => setSupportPersonPhone(e.target.value)}
                  placeholder="(555) 555-0123"
                  hint="Optional"
                />
              </div>
              <label className="mt-4 block">
                <Label>Important communication notes</Label>
                <textarea
                  value={communicationNotes}
                  onChange={(e) => setCommunicationNotes(e.target.value)}
                  placeholder="Anything a new caregiver should know about how this person communicates."
                  className="mt-2 min-h-24 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-neutral-400 focus:border-teal-500 focus:outline-none"
                />
                <span className="mt-1.5 block text-xs text-neutral-500">
                  Optional — saved with the communication preservation plan.
                </span>
              </label>
            </Card>

            <Card className="bg-neutral-50">
              <Label>Consent</Label>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Recordings are stored against this patient&rsquo;s record as FHIR{' '}
                <span className="font-mono text-[13px] text-neutral-900">Media</span> and{' '}
                <span className="font-mono text-[13px] text-neutral-900">Communication</span>{' '}
                resources, retrievable by the patient and their care team. A synthetic voice built
                from them can be revoked. A banked voice is impersonation-grade material and is
                access-controlled accordingly.
              </p>
            </Card>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" disabled={Boolean(busy)} className="w-full">
              {busy ?? 'Begin session'}
            </Button>
          </form>
        </main>

        <SiteFooter />
      </div>
    );
  }

  // ---------------------------------------------------------------- session
  const messages = session.banked.filter((r) => r.kind === 'message');
  const chartId = session.patientId ?? session.id;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader cta={{ href: '/decode', label: 'Open decoder' }} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Label className="text-teal-700">Session</Label>
            <h1 className="mt-2 text-2xl tracking-tight md:text-3xl">{session.patientName}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1.5">
              <StatusDot live={session.fhirLinked} />
              <Label>
                {session.fhirLinked ? 'charting to Medplum' : 'FHIR projected (no Medplum key)'}
              </Label>
            </span>
            <Button variant="secondary" onClick={saveProgress} disabled={Boolean(busy)}>
              Save progress
            </Button>
          </div>
        </div>
        {saveNotice && (
          <p className="mt-3 text-sm text-teal-700" role="status">
            {saveNotice}
          </p>
        )}

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
                  <p className="text-xl leading-snug tracking-tight md:text-2xl">{prompt.spoken}</p>

                  {prompt.sentence && (
                    <p className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4 text-lg leading-relaxed">
                      &ldquo;{prompt.sentence}&rdquo;
                    </p>
                  )}

                  {prompt.kind === 'message' && (prompt.recipient || prompt.occasion) && (
                    <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                      {prompt.recipient && <>for {prompt.recipient}</>}
                      {prompt.recipient && prompt.occasion && ' · '}
                      {prompt.occasion}
                    </p>
                  )}
                </div>
              ) : (
                <ThinkingDots
                  label={promptLoading ? 'Choosing what to ask next…' : 'Loading…'}
                />
              )}

              <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <Waveform level={recorder.level} active={recorder.recording} />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-xs text-neutral-500">
                    {recorder.recording
                      ? `recording · ${String(Math.floor(recorder.seconds / 60)).padStart(2, '0')}:${String(recorder.seconds % 60).padStart(2, '0')}`
                      : 'ready'}
                  </span>

                  {recorder.recording ? (
                    <Button variant="danger" onClick={finishTake} disabled={Boolean(busy)}>
                      Stop &amp; bank
                    </Button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
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
                <p
                  className={`mt-3 text-sm ${
                    recorder.error || error ? 'text-red-600' : 'text-neutral-600'
                  }`}
                >
                  {recorder.error ?? error ?? busy}
                </p>
              )}

              {prompt?.sessionComplete && (
                <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  The corpus is complete. There&rsquo;s enough here to build the synthetic voice,
                  and the messages are banked in the real one.
                </p>
              )}
            </Panel>

            {/* ------------------------------------------- banked library */}
            <Panel
              title={`Banked · ${session.banked.length} recordings, ${messages.length} messages`}
              subtitle="Personal messages play back in their actual voice — no cloning, nothing to sound wrong."
            >
              {session.banked.length === 0 ? (
                <p className="text-sm text-neutral-500">Nothing banked yet.</p>
              ) : (
                <ul className="space-y-2">
                  {[...session.banked].reverse().map((r) => (
                    <li
                      key={r.id}
                      className={`rise rounded-lg border px-4 py-3 ${
                        r.kind === 'message'
                          ? 'border-teal-200 bg-teal-50/50'
                          : 'border-neutral-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">&ldquo;{r.transcript}&rdquo;</p>
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                            {r.kind}
                            {r.recipient && ` · for ${r.recipient}`}
                            {r.occasion && ` · ${r.occasion}`}
                            {r.mediaId && ` · Media/${r.mediaId.slice(0, 8)}`}
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
            <Panel
              title="Everyday phrases"
              subtitle="Thirty things they'll actually need to say. These play back directly, in their own voice."
            >
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-tight text-teal-700">
                  {deck?.banked ?? 0}
                </span>
                <span className="text-xl text-neutral-400">of {deck?.total ?? 30}</span>
              </div>
              <div className="mt-4 h-2 rounded-full bg-neutral-100">
                <div
                  className="h-2 rounded-full bg-teal-600 transition-all duration-500"
                  style={{ width: `${((deck?.banked ?? 0) / (deck?.total ?? 30)) * 100}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                Plus {messages.length} personal message{messages.length === 1 ? '' : 's'} — the
                part no deck can write for them.
              </p>
            </Panel>

            <Panel
              title="Phoneme coverage"
              subtitle="Tracked underneath, so the same recordings can build a synthetic voice later."
            >
              <p className="text-5xl font-semibold tracking-tight text-teal-700">
                <Percent value={coverage?.ratio ?? 0} />
                <span className="text-2xl text-neutral-400">%</span>
              </p>

              <div className="mt-5 space-y-2.5">
                {coverage?.byClass.map((c) => (
                  <div key={c.name}>
                    <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                      <span>{c.name}</span>
                      <span>
                        {c.covered}/{c.total}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-neutral-100">
                      <div
                        className="h-1.5 rounded-full bg-teal-600 transition-all duration-500"
                        style={{ width: `${(c.covered / c.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {coverage && coverage.missing.length > 0 && (
                <p className="mt-4 font-mono text-[10px] leading-relaxed text-neutral-500">
                  STILL MISSING: {coverage.missing.join(' ')}
                </p>
              )}
            </Panel>

            <Panel title="Pipeline" subtitle="What happened to the last recording.">
              <ul className="space-y-2 font-mono text-[11px] text-neutral-500">
                <li>
                  <span className="text-neutral-900">deepgram</span> ·{' '}
                  {services?.deepgram ? 'transcribed nova-3' : 'not configured'}
                </li>
                <li>
                  <span className="text-neutral-900">medplum</span> ·{' '}
                  {services?.medplum ? 'Media + Communication written' : 'projected only'}
                </li>
                <li>
                  <span className="text-neutral-900">moss</span> ·{' '}
                  {services?.moss
                    ? `indexed ${String(services.indexedDocs)} phrases`
                    : 'not configured'}
                </li>
                <li>
                  <span className="text-neutral-900">stedi</span> ·{' '}
                  {sgd ? `${sgd.source} eligibility returned` : 'pending — run at session end'}
                </li>
              </ul>
              <div className="mt-4 flex flex-col gap-1.5">
                <Link
                  href="/talk"
                  className="font-mono text-[11px] uppercase tracking-widest text-teal-700 hover:underline"
                >
                  Speak with these phrases →
                </Link>
                <Link
                  href={`/profile/${chartId}`}
                  className="font-mono text-[11px] uppercase tracking-widest text-teal-700 hover:underline"
                >
                  Communication profile →
                </Link>
                <Link
                  href={`/chart/${chartId}`}
                  className="font-mono text-[11px] uppercase tracking-widest text-teal-700 hover:underline"
                >
                  View FHIR chart →
                </Link>
              </div>
            </Panel>

            {/* ------------------------------------------- Stedi */}
            <Panel
              title="Speech-generating device"
              subtitle="Medicare and most payers cover SGDs as DME — but only through a specific path."
            >
              {sgd ? (
                <div className="rise space-y-4">
                  <p className="text-sm">
                    <span className={sgd.active ? 'text-emerald-600' : 'text-red-600'}>
                      {sgd.active ? 'Active coverage' : 'No active coverage found'}
                    </span>
                    {sgd.payerName && <span className="text-neutral-500"> · {sgd.payerName}</span>}
                  </p>

                  <ul className="space-y-1.5 font-mono text-[11px] text-neutral-500">
                    {sgd.benefits.slice(0, 5).map((b, i) => (
                      <li key={i}>
                        <span className="text-neutral-900">{b.name}</span>
                        {b.benefitPercent && ` · ${Math.round(Number(b.benefitPercent) * 100)}%`}
                        {b.benefitAmount && ` · $${b.benefitAmount}`}
                        {b.serviceTypes?.length ? ` · ${b.serviceTypes[0]}` : ''}
                      </li>
                    ))}
                  </ul>

                  <div>
                    <Label>Approval path</Label>
                    <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-neutral-600">
                      {sgd.approvalPath.map((step, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-mono text-teal-600">{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {sgd.source === 'demo' && (
                    <p className="text-[11px] text-neutral-500">
                      Sample 271 — set STEDI_API_KEY for a live eligibility check.
                    </p>
                  )}
                </div>
              ) : (
                <Button
                  variant="secondary"
                  onClick={runCoverageCheck}
                  disabled={Boolean(busy)}
                  className="w-full"
                >
                  Check device coverage
                </Button>
              )}
            </Panel>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
