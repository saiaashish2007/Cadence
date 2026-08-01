/**
 * Someone's banked phrases, without the model call.
 *
 * The speak-for-me board needs the library the instant it opens — it's the
 * surface someone reaches for mid-conversation — so this is deliberately just
 * a read.
 */

import { NextRequest, NextResponse } from 'next/server';
import { medplumConfigured } from '@/lib/medplum';
import { readProfileSources, type ProfilePhrase } from '@/lib/profile-sources';
import { isSpoken, parseLibrary } from '@/lib/retrieval';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const patientId: string = body.patientId ?? '';
  let patientName: string = body.patientName ?? '';
  let phrases: ProfilePhrase[] = [];
  let source: 'medplum' | 'client' = 'client';

  if (medplumConfigured && patientId) {
    try {
      const fromFhir = await readProfileSources(patientId);
      if (fromFhir && fromFhir.phrases.length) {
        phrases = fromFhir.phrases;
        patientName = fromFhir.patientName || patientName;
        source = 'medplum';
      }
    } catch (err) {
      console.error('[medplum] library read failed:', err);
    }
  }

  if (!phrases.length) {
    phrases = parseLibrary(body.library)
      .filter(isSpoken)
      .map((p) => ({
        id: p.id,
        text: p.text,
        kind: p.kind,
        recipient: p.recipient,
        occasion: p.occasion,
        mediaId: p.mediaId,
        audioUrl: p.mediaId ? `/api/audio/${p.mediaId}` : undefined,
        essentialId: p.essentialId,
      }));
  }

  return NextResponse.json({ patientName, phrases, source });
}
