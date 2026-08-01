/**
 * The communication profile — the caregiver-facing half of the product.
 *
 * Reads the person's banked library and every meaning a caregiver has since
 * confirmed, and writes the two-minute briefing a stranger needs before they
 * try to talk to them.
 *
 * This is the slow half by design. The evidence it's built from is served
 * separately by /api/profile/sources so the page can paint while this runs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildCommunicationProfile, claudeConfigured, type CommunicationProfile } from '@/lib/claude';
import { resolveProfileSources } from '@/lib/profile-sources';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * A profile is a pure function of the phrases and confirmations behind it, so
 * revisiting the page shouldn't pay for it twice. Keyed on a fingerprint of
 * that evidence, which means a new recording or confirmation invalidates it on
 * its own. Hangs off globalThis to survive both hot-reload and a warm instance.
 */
const cache = ((globalThis as typeof globalThis & {
  __cadenceProfileCache?: Map<string, CommunicationProfile>;
}).__cadenceProfileCache ??= new Map());

export async function POST(req: NextRequest) {
  const body = await req.json();
  const sources = await resolveProfileSources(body);

  if (!sources.phrases.length) {
    return NextResponse.json({ error: 'nothing banked for this person yet' }, { status: 404 });
  }

  const phrases = sources.phrases.map((p) => ({
    text: p.text,
    kind: p.kind,
    recipient: p.recipient,
    occasion: p.occasion,
  }));
  const observed = sources.observed.map((o) => ({
    heard: o.heard,
    meaning: o.meaning,
    situation: o.situation,
  }));

  const key = JSON.stringify([sources.patientName, phrases, observed]);
  let profile = cache.get(key);

  if (!profile) {
    profile = await buildCommunicationProfile({
      patientName: sources.patientName || 'This person',
      phrases,
      observed,
    });
    // Bounded so a long-lived instance can't grow one entry per session forever.
    if (cache.size > 32) cache.clear();
    cache.set(key, profile);
  }

  return NextResponse.json({
    patientName: sources.patientName,
    profile,
    phrases: sources.phrases,
    observed: sources.observed,
    source: sources.source,
    reasoningLive: claudeConfigured,
  });
}
