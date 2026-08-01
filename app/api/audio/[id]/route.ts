import { NextRequest, NextResponse } from 'next/server';
import { findRecording } from '@/lib/store';

export const runtime = 'nodejs';

/** Serves a banked recording back in the person's own voice. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = findRecording(id);
  if (!recording) return NextResponse.json({ error: 'recording not found' }, { status: 404 });

  return new NextResponse(new Uint8Array(recording.audio), {
    headers: { 'Content-Type': recording.contentType, 'Cache-Control': 'no-store' },
  });
}
