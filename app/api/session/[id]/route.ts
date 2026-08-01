import { NextRequest, NextResponse } from 'next/server';
import { getSession, serializeSession } from '@/lib/store';
import { coverageOf } from '@/lib/phonetics';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 });

  return NextResponse.json({
    session: serializeSession(session),
    coverage: coverageOf(session.recordings.map((r) => r.transcript)),
  });
}
