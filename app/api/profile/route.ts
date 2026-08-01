/**
 * The communication profile — the caregiver-facing half of the product.
 *
 * Reads the person's banked library and every meaning a caregiver has since
 * confirmed, and writes the two-minute briefing a stranger needs before they
 * try to talk to them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildCommunicationProfile, claudeConfigured } from '@/lib/claude';
import { medplumConfigured } from '@/lib/medplum';
import { readProfileSources, type ObservedUtterance, type ProfilePhrase } from '@/lib/profile-sources';
import { parseLibrary } from '@/lib/retrieval';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const patientId: string = body.patientId ?? '';
  let patientName: string = body.patientName ?? '';

  let phrases: ProfilePhrase[] = [];
  let observed: ObservedUtterance[] = [];
  let source: 'medplum' | 'client' = 'client';

  if (medplumConfigured && patientId) {
    try {
      const fromFhir = await readProfileSources(patientId);
      if (fromFhir && fromFhir.phrases.length) {
        phrases = fromFhir.phrases;
        observed = fromFhir.observed;
        patientName = fromFhir.patientName || patientName;
        source = 'medplum';
      }
    } catch (err) {
      console.error('[medplum] readProfileSources failed:', err);
    }
  }

  // Falls back to the library the caller is holding, so the profile still works
  // before FHIR is wired up or for a session that never reached it.
  if (!phrases.length) {
    phrases = parseLibrary(body.library).map((p) => ({
      id: p.id,
      text: p.text,
      kind: p.kind,
      recipient: p.recipient,
      occasion: p.occasion,
      mediaId: p.mediaId,
      audioUrl: p.mediaId ? `/api/audio/${p.mediaId}` : undefined,
    }));
    observed = Array.isArray(body.observed) ? (body.observed as ObservedUtterance[]) : [];
  }

  if (!phrases.length) {
    return NextResponse.json({ error: 'nothing banked for this person yet' }, { status: 404 });
  }

  const profile = await buildCommunicationProfile({
    patientName: patientName || 'This person',
    phrases: phrases.map((p) => ({
      text: p.text,
      kind: p.kind,
      recipient: p.recipient,
      occasion: p.occasion,
    })),
    observed: observed.map((o) => ({
      heard: o.heard,
      meaning: o.meaning,
      situation: o.situation,
    })),
  });

  return NextResponse.json({
    patientName,
    profile,
    phrases,
    observed,
    source,
    reasoningLive: claudeConfigured,
  });
}
