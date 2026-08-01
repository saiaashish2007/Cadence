import { NextRequest, NextResponse } from 'next/server';
import { checkSgdCoverage, stediConfigured } from '@/lib/stedi';
import { resolveSessionContext } from '@/lib/session-context';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const context = resolveSessionContext(body);
  if (!context) {
    return NextResponse.json({ error: 'session context is required' }, { status: 400 });
  }

  const [given, ...rest] = context.patientName.split(/\s+/);

  try {
    const result = await checkSgdCoverage({
      tradingPartnerServiceId: body.payerId || '87726',
      memberId: body.memberId || 'UHC202649',
      firstName: body.firstName || given,
      lastName: body.lastName || rest.join(' ') || given,
      dateOfBirth: body.dateOfBirth,
      providerName: body.providerName || 'Cadence Speech Pathology',
      providerNpi: body.providerNpi || '1999999984',
    });

    return NextResponse.json({ coverage: result, live: stediConfigured });
  } catch (err) {
    console.error('[stedi] eligibility failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
