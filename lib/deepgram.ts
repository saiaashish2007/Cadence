/**
 * Deepgram — the voice layer.
 *
 * STT follows the patient through the guided capture session; TTS is the
 * agent's own voice while it walks them through it. Both go through the REST
 * API directly rather than the SDK: fewer moving parts, and the raw audio
 * bytes are what we need to persist to FHIR anyway.
 */

const KEY = process.env.DEEPGRAM_API_KEY;

export const deepgramConfigured = Boolean(KEY);

export type Transcript = {
  text: string;
  words: number;
  confidence: number;
  durationSeconds: number;
};

/** Transcribe a recorded audio blob. Returns null if Deepgram isn't configured. */
export async function transcribe(
  audio: ArrayBuffer,
  contentType: string
): Promise<Transcript | null> {
  if (!KEY) return null;

  const params = new URLSearchParams({
    model: 'nova-3',
    smart_format: 'true',
    punctuate: 'true',
    detect_language: 'false',
    language: 'en',
  });

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: { Authorization: `Token ${KEY}`, 'Content-Type': contentType },
    body: audio,
  });

  if (!res.ok) {
    throw new Error(`Deepgram STT ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  const alt = json?.results?.channels?.[0]?.alternatives?.[0];
  return {
    text: alt?.transcript ?? '',
    words: alt?.words?.length ?? 0,
    confidence: alt?.confidence ?? 0,
    durationSeconds: json?.metadata?.duration ?? 0,
  };
}

/**
 * Synthesize the agent's spoken prompt. This is the *agent's* voice, not the
 * patient's — the patient's own voice is preserved as real recorded audio
 * (message banking), which is the part that has to be perfect.
 */
export async function speak(
  text: string,
  model = 'aura-2-thalia-en'
): Promise<ArrayBuffer | null> {
  if (!KEY) return null;

  const res = await fetch(
    `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mp3`,
    {
      method: 'POST',
      headers: { Authorization: `Token ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }
  );

  if (!res.ok) {
    throw new Error(`Deepgram TTS ${res.status}: ${await res.text()}`);
  }

  return res.arrayBuffer();
}
