'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  StatusDot,
  ThinkingDots,
  Waveform,
} from '@/components/ui';
import { loadSessions, toLibrary, type CadenceSession } from '@/lib/client-session';
import { ESSENTIAL_CATEGORIES, essentialById } from '@/lib/essentials';

type Phrase = {
  id: string;
  text: string;
  kind: string;
  recipient?: string;
  occasion?: string;
  mediaId?: string;
  audioUrl?: string;
  essentialId?: string;
};

type Suggestion = { recordingId: string; answer: string; audioUrl: string };

/**
 * The speak-for-me surface.
 *
 * Everything here plays real recorded audio — their own voice, saying words
 * they chose. Nothing is synthesised, so nothing can sound not-quite-right at
 * the moment it matters most.
 */
export default function TalkPage() {
  const [sessions, setSessions] = useState<CadenceSession[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [patientName, setPatientName] = useState('');
  const [loading, setLoading] = useState(true);

  const [question, setQuestion] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [rationale, setRationale] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);

  const recorder = useRecorder();
  const player = useRef<HTMLAudioElement | null>(null);

  // The banking tab wrote these to localStorage; refresh on focus so a session
  // banked in another tab shows up here without a reload.
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

  useEffect(() => {
    let cancelled = false;

    const loadPhrases = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: selected?.patientId ?? sessionId,
            patientName: selected?.patientName ?? '',
            library: toLibrary(selected?.banked ?? []),
          }),
        });
        const json = await res.json();
        if (cancelled) return;
        setPhrases(json.phrases ?? []);
        setPatientName(json.patientName || selected?.patientName || '');
      } catch {
        if (!cancelled) setError('Could not load their phrases.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPhrases();
    return () => {
      cancelled = true;
    };
  }, [sessionId, selected]);

  /** Play a banked recording. Their voice, not a synthesised one. */
  const play = useCallback((url: string, id: string) => {
    player.current?.pause();
    const audio = new Audio(url);
    player.current = audio;
    setNowPlaying(id);
    audio.onended = () => setNowPlaying(null);
    audio.onerror = () => {
      setNowPlaying(null);
      setError('That recording could not be played.');
    };
    void audio.play().catch(() => setNowPlaying(null));
  }, []);

  useEffect(() => () => player.current?.pause(), []);

  const answerQuestion = useCallback(
    async (payload: FormData | object) => {
      setBusy('Finding what they banked for this…');
      setError(null);
      setSuggestions([]);
      setRationale(null);

      const library = toLibrary(selected?.banked ?? []);
      try {
        const res =
          payload instanceof FormData
            ? await (() => {
                payload.set('library', JSON.stringify(library));
                return fetch('/api/answer', { method: 'POST', body: payload });
              })()
            : await fetch('/api/answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, library }),
              });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'could not answer');

        setQuestion(json.question);
        setSuggestions(json.suggestions ?? []);
        setRationale(json.rationale ?? null);

        // Only questions with one honest answer play themselves. Anything that
        // depends on how they feel waits for them to tap.
        const auto = (json.suggestions ?? []).find(
          (s: Suggestion) => s.recordingId === json.autoplayId
        );
        if (auto) play(auto.audioUrl, auto.recordingId);
      } catch (err) {
        setError(String(err));
      } finally {
        setBusy(null);
      }
    },
    [selected, play]
  );

  async function askByVoice() {
    const blob = await recorder.stop();
    if (!blob) {
      setError('No audio captured.');
      return;
    }
    const form = new FormData();
    form.set('sessionId', sessionId);
    form.set('audio', blob, 'question.webm');
    await answerQuestion(form);
  }

  // Deck phrases grouped the way they were banked; personal messages separately.
  const board = useMemo(() => {
    const withEssential = phrases.filter((p) => p.essentialId);
    return ESSENTIAL_CATEGORIES.map((category) => ({
      category,
      items: withEssential.filter((p) => essentialById(p.essentialId!)?.category === category),
    })).filter((g) => g.items.length);
  }, [phrases]);

  const messages = phrases.filter((p) => p.kind === 'message');

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader cta={{ href: '/bank', label: 'Bank a voice' }} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:py-14">
        <Label className="text-teal-700">Speak for me</Label>
        <h1 className="mt-4 text-3xl leading-tight tracking-tight md:text-4xl">
          Their voice,{' '}
          <em className="font-serif italic text-teal-700">still answering.</em>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-neutral-600">
          Every phrase here is a real recording{patientName ? ` ${patientName} made` : ' they made'}{' '}
          while they could still speak. Tap one to say it out loud — or let someone ask a question
          and Cadence will find the answer they already recorded. Nothing is synthesised, so
          nothing can sound wrong.
        </p>

        {sessions.length === 0 ? (
          <Card className="mt-10 bg-neutral-50">
            <p className="text-sm leading-relaxed text-neutral-600">
              No banked voices in this browser yet.{' '}
              <Link href="/bank" className="text-teal-700 underline">
                Bank a voice first
              </Link>{' '}
              — this page plays back what was recorded there.
            </p>
          </Card>
        ) : (
          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.25fr]">
            {/* ------------------------------------------- someone asked */}
            <div className="space-y-6">
              <Panel
                title="Someone asked me something"
                subtitle="Record the question, or type it. Cadence plays back the answer they banked."
              >
                <Select
                  label="Whose voice"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.patientName}
                    </option>
                  ))}
                </Select>

                <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                  <Waveform level={recorder.level} active={recorder.recording} />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="font-mono text-xs text-neutral-500">
                      {recorder.recording ? `listening · ${recorder.seconds}s` : 'ready'}
                    </span>
                    {recorder.recording ? (
                      <Button variant="danger" onClick={askByVoice} disabled={Boolean(busy)}>
                        Stop &amp; answer
                      </Button>
                    ) : (
                      <Button onClick={recorder.start} disabled={Boolean(busy)}>
                        Record the question
                      </Button>
                    )}
                  </div>
                </div>

                <label className="mt-5 block">
                  <Label>Or type the question</Label>
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Are you in any pain?"
                    className="mt-2 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-neutral-400 focus:border-teal-500 focus:outline-none"
                  />
                </label>

                <Button
                  onClick={() => answerQuestion({ sessionId, question })}
                  disabled={Boolean(busy) || !question.trim()}
                  className="mt-4 w-full"
                >
                  {busy ?? 'Find their reply'}
                </Button>

                {busy && (
                  <div className="mt-4">
                    <ThinkingDots label={busy} />
                  </div>
                )}

                {suggestions.length > 0 && (
                  <div className="rise mt-5">
                    <Label className="text-teal-700">Tap to say it</Label>
                    <div className="mt-2.5 space-y-2">
                      {suggestions.map((s) => (
                        <button
                          key={s.recordingId}
                          onClick={() => play(s.audioUrl, s.recordingId)}
                          className={`w-full rounded-lg border px-4 py-3.5 text-left text-[15px] leading-snug transition-colors ${
                            nowPlaying === s.recordingId
                              ? 'border-teal-400 bg-teal-50'
                              : 'border-teal-200 bg-teal-50/40 hover:bg-teal-50'
                          }`}
                        >
                          &ldquo;{s.answer}&rdquo;
                          {nowPlaying === s.recordingId && (
                            <span className="mt-1 block font-mono text-[10px] uppercase tracking-widest text-teal-700">
                              speaking in their voice…
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    {rationale && (
                      <p className="mt-2.5 text-xs leading-relaxed text-neutral-500">{rationale}</p>
                    )}
                  </div>
                )}

                {rationale && suggestions.length === 0 && !busy && (
                  <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4">
                    <Label>Saying nothing</Label>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600">{rationale}</p>
                  </div>
                )}

                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              </Panel>

              {messages.length > 0 && (
                <Panel
                  title={`Personal messages · ${messages.length}`}
                  subtitle="Banked for one person, for one moment. Play these deliberately."
                >
                  <ul className="space-y-2">
                    {messages.map((p) => (
                      <li
                        key={p.id}
                        className="rounded-lg border border-neutral-200 px-4 py-3"
                      >
                        <p className="text-sm leading-relaxed">&ldquo;{p.text}&rdquo;</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                            {p.recipient && `for ${p.recipient}`}
                            {p.recipient && p.occasion && ' · '}
                            {p.occasion}
                          </span>
                          {p.audioUrl && (
                            <button
                              onClick={() => play(p.audioUrl!, p.id)}
                              className="font-mono text-[11px] uppercase tracking-widest text-teal-700 hover:underline"
                            >
                              {nowPlaying === p.id ? 'playing…' : 'play →'}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>

            {/* ------------------------------------------------- the board */}
            <Panel
              title={`Their phrases · ${board.reduce((n, g) => n + g.items.length, 0)}`}
              subtitle="Tap to say it out loud."
              action={
                <span className="inline-flex items-center gap-2">
                  <StatusDot live={!loading && phrases.length > 0} />
                  <Label>{loading ? 'loading' : 'ready'}</Label>
                </span>
              }
            >
              {loading ? (
                <ThinkingDots label="Loading their phrases…" />
              ) : board.length === 0 ? (
                <p className="text-sm leading-relaxed text-neutral-600">
                  No everyday phrases banked yet.{' '}
                  <Link href="/bank" className="text-teal-700 underline">
                    Run a session
                  </Link>{' '}
                  — the deck of thirty is what fills this board.
                </p>
              ) : (
                <div className="space-y-6">
                  {board.map((group) => (
                    <div key={group.category}>
                      <Label>{group.category}</Label>
                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                        {group.items.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => p.audioUrl && play(p.audioUrl, p.id)}
                            disabled={!p.audioUrl}
                            className={`rounded-lg border px-4 py-3 text-left text-sm leading-snug transition-colors disabled:opacity-50 ${
                              nowPlaying === p.id
                                ? 'border-teal-400 bg-teal-50'
                                : 'border-neutral-200 bg-white hover:bg-neutral-50'
                            }`}
                          >
                            {p.text}
                            {nowPlaying === p.id && (
                              <span className="mt-1 block font-mono text-[10px] uppercase tracking-widest text-teal-700">
                                speaking…
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
