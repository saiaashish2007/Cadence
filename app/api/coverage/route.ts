import { NextRequest, NextResponse } from 'next/server';
import { checkSgdCoverage, stediConfigured } from '@/lib/stedi';
import { getSession } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const session = getSession(body.sessionId);
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 });

  const [given, ...rest] = session.patientName.split(/\s+/);

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

    session.coverageResult = result;
    return NextResponse.json({ coverage: result, live: stediConfigured });
  } catch (err) {
    console.error('[stedi] eligibility failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
