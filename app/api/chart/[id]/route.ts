/**
 * The FHIR view. Reads back from Medplum when it's wired up, and otherwise
 * renders the resources exactly as they'd be written — so the chart panel shows
 * the real resource shapes either way, clearly labelled as projected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readVoiceBank, medplumConfigured, VOICE_BANK_SYSTEM } from '@/lib/medplum';
import { getSession } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 });

  if (medplumConfigured && session.fhir) {
    try {
      const bank = await readVoiceBank(session.fhir.patientId);
      return NextResponse.json({ source: 'medplum', patientId: session.fhir.patientId, ...bank });
    } catch (err) {
      console.error('[medplum] readVoiceBank failed:', err);
    }
  }

  return NextResponse.json({ source: 'projected', ...projectFhir(session) });
}

function projectFhir(session: ReturnType<typeof getSession>) {
  if (!session) return {};

  const patientRef = { reference: `Patient/${session.id}` };

  return {
    patient: {
      resourceType: 'Patient',
      id: session.id,
      name: [{ text: session.patientName }],
    },
    carePlans: [
      {
        resourceType: 'CarePlan',
        status: 'active',
        intent: 'plan',
        title: 'Communication preservation — voice and message banking',
        subject: patientRef,
        addresses: [{ display: session.diagnosis }],
        activity: [
          { detail: { status: 'in-progress', description: 'Phonetic corpus capture for synthetic voice' } },
          { detail: { status: 'in-progress', description: 'Personal message banking' } },
          {
            detail: {
              status: session.coverageResult ? 'completed' : 'not-started',
              description: 'Speech-generating device coverage determination',
            },
          },
        ],
      },
    ],
    media: session.recordings.map((r) => ({
      resourceType: 'Media',
      id: r.id,
      status: 'completed',
      subject: patientRef,
      duration: r.durationSeconds,
      modality: { coding: [{ system: VOICE_BANK_SYSTEM, code: r.kind }] },
      content: { contentType: r.contentType, title: r.transcript.slice(0, 120) },
    })),
    communications: session.recordings
      .filter((r) => r.kind === 'message')
      .map((r) => ({
        resourceType: 'Communication',
        id: r.id,
        status: 'completed',
        subject: patientRef,
        sender: patientRef,
        topic: r.occasion ? { text: r.occasion } : undefined,
        payload: [{ contentString: r.transcript }],
        note: r.recipient ? [{ text: `Intended for: ${r.recipient}` }] : undefined,
      })),
    observations: [],
  };
}
