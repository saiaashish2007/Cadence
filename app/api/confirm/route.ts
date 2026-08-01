/**
 * A caregiver confirming what someone actually meant.
 *
 * This is the loop that keeps the library honest as speech changes. The pair —
 * what it sounded like, what it meant — is written to FHIR so it outlives this
 * shift, and indexed in Moss on the *heard* form so the next person who hears
 * the same sound gets the confirmed reading instead of a fresh guess.
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveObservedUtterance, medplumConfigured } from '@/lib/medplum';
import { addPhrase, pushBank, mossConfigured } from '@/lib/moss';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();

  const sessionId: string = body.sessionId ?? '';
  const patientId: string = body.patientId ?? '';
  const heard: string = (body.heard ?? '').trim();
  const meaning: string = (body.meaning ?? '').trim();
  const situation: string | undefined = body.situation || undefined;
  const confirmedBy: string | undefined = body.confirmedBy || undefined;

  if (!heard || !meaning) {
    return NextResponse.json({ error: 'heard and meaning are both required' }, { status: 400 });
  }

  let communicationId: string | undefined;
  if (medplumConfigured && patientId) {
    try {
      const saved = await saveObservedUtterance({
        patientId,
        heard,
        meaning,
        situation,
        confirmedBy,
      });
      communicationId = saved?.communicationId;
    } catch (err) {
      console.error('[medplum] saveObservedUtterance failed:', err);
    }
  }

  const id = communicationId ?? randomUUID();

  let indexed = false;
  if (mossConfigured && sessionId) {
    try {
      await addPhrase(sessionId, {
        id,
        // Indexed on what it sounded like — that's what the next listener will
        // be searching with.
        text: heard,
        kind: 'observed',
        meaning,
        occasion: situation,
      });
      await pushBank(sessionId);
      indexed = true;
    } catch (err) {
      console.error('[moss] indexing confirmed utterance failed:', err);
    }
  }

  return NextResponse.json({
    observed: { id, heard, meaning, situation, when: new Date().toISOString() },
    charted: Boolean(communicationId),
    indexed,
  });
}
