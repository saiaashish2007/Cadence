import { NextRequest, NextResponse } from 'next/server';
import { getCachedAudio } from '@/lib/store';
import { readMediaAudio, medplumConfigured } from '@/lib/medplum';

export const runtime = 'nodejs';

/**
 * Serves a banked recording back in the person's own voice.
 *
 * Memory first because it's instant, then FHIR — the recording was written to
 * Medplum as a Binary, which is what makes playback work on an instance that
 * never handled the original take.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const cached = getCachedAudio(id);
  if (cached) {
    return new NextResponse(new Uint8Array(cached.audio), {
      headers: { 'Content-Type': cached.contentType, 'Cache-Control': 'no-store' },
    });
  }

  if (medplumConfigured) {
    try {
      const stored = await readMediaAudio(id);
      if (stored) {
        return new NextResponse(new Uint8Array(stored.data), {
          headers: { 'Content-Type': stored.contentType, 'Cache-Control': 'private, max-age=300' },
        });
      }
    } catch (err) {
      console.error('[medplum] readMediaAudio failed:', err);
    }
  }

  return NextResponse.json({ error: 'recording not found' }, { status: 404 });
}
