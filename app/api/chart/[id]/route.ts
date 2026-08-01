/**
 * The FHIR view.
 *
 * The id is a Medplum patient id whenever FHIR is wired up, so the chart reads
 * back from the server of record rather than from whatever this instance
 * happens to remember. Without Medplum the client renders the same resources
 * as a labelled projection instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readVoiceBank, medplumConfigured } from '@/lib/medplum';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!medplumConfigured) {
    return NextResponse.json(
      { error: 'Medplum is not configured', source: 'unavailable' },
      { status: 404 }
    );
  }

  try {
    const bank = await readVoiceBank(id);
    return NextResponse.json({ source: 'medplum', patientId: id, ...bank });
  } catch (err) {
    console.error('[medplum] readVoiceBank failed:', err);
    return NextResponse.json(
      { error: 'could not read this record from Medplum', source: 'unavailable' },
      { status: 502 }
    );
  }
}
