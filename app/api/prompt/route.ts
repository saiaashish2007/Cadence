import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/store';
import { coverageOf } from '@/lib/phonetics';
import { nextBankingPrompt, claudeConfigured } from '@/lib/claude';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 });

  const coverage = coverageOf(session.recordings.map((r) => r.transcript));

  const prompt = await nextBankingPrompt({
    patientName: session.patientName,
    diagnosis: session.diagnosis,
    coverage,
    banked: session.recordings.map((r) => ({
      kind: r.kind,
      text: r.transcript,
      recipient: r.recipient,
      occasion: r.occasion,
    })),
  });

  return NextResponse.json({ prompt, coverage, reasoningLive: claudeConfigured });
}
