import { NextRequest, NextResponse } from 'next/server';
import { resolveSessionContext } from '@/lib/session-context';
import { coverageOf } from '@/lib/phonetics';
import { nextBankingPrompt, claudeConfigured } from '@/lib/claude';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const context = resolveSessionContext(await req.json());
  if (!context) {
    return NextResponse.json({ error: 'session context is required' }, { status: 400 });
  }

  const coverage = coverageOf(context.banked.map((r) => r.transcript));

  const prompt = await nextBankingPrompt({
    patientName: context.patientName,
    diagnosis: context.diagnosis,
    coverage,
    banked: context.banked.map((r) => ({
      kind: r.kind,
      text: r.transcript,
      recipient: r.recipient,
      occasion: r.occasion,
    })),
  });

  return NextResponse.json({ prompt, coverage, reasoningLive: claudeConfigured });
}
