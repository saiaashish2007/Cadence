'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Microphone capture.
 *
 * Two things matter for this use case specifically. First, the level meter has
 * to be real — someone recording the last messages they'll ever say in their
 * own voice needs to see that it's working, not trust a spinner. Second, the
 * stream is torn down on every stop: leaving the mic light on in a room where
 * someone is saying goodbye to their family is not acceptable.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const teardown = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    if (timer.current) clearInterval(timer.current);
    raf.current = null;
    timer.current = null;

    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;

    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;

    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.current = media;

      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(media).connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        // RMS around the 128 midpoint, scaled to something legible on a meter.
        let sum = 0;
        for (const v of data) sum += (v - 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / data.length) / 40));
        raf.current = requestAnimationFrame(tick);
      };
      tick();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(media, { mimeType });
      chunks.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      recorder.start();
      mediaRecorder.current = recorder;

      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setRecording(true);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow access and try again.'
          : `Could not start recording: ${String(err)}`
      );
      teardown();
    }
  }, [teardown]);

  const stop = useCallback((): Promise<Blob | null> => {
    const recorder = mediaRecorder.current;
    if (!recorder || recorder.state === 'inactive') {
      setRecording(false);
      teardown();
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        chunks.current = [];
        mediaRecorder.current = null;
        setRecording(false);
        teardown();
        resolve(blob.size > 0 ? blob : null);
      };
      recorder.stop();
    });
  }, [teardown]);

  return { recording, level, seconds, error, start, stop };
}
