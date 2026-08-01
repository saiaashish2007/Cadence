import { NextRequest, NextResponse } from 'next/server';
import { createBankSession, medplumConfigured } from '@/lib/medplum';
import { createSession, listSessions, serializeSession } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ sessions: listSessions().map(serializeSession) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const patientName: string = (body.patientName ?? '').trim();
  const diagnosis: string = (body.diagnosis ?? '').trim();
  const birthDate: string | undefined = clean(body.birthDate);
  const diagnosisDate: string | undefined = clean(body.diagnosisDate);
  const pronouns: string | undefined = clean(body.pronouns);
  const preferredLanguage: string | undefined = clean(body.preferredLanguage);
  const supportPersonName: string | undefined = clean(body.supportPersonName);
  const supportPersonPhone: string | undefined = clean(body.supportPersonPhone);
  const communicationNotes: string | undefined = clean(body.communicationNotes);

  if (!patientName || !diagnosis) {
    return NextResponse.json({ error: 'patientName and diagnosis are required' }, { status: 400 });
  }

  const [given, ...rest] = patientName.split(/\s+/);

  let fhir;
  if (medplumConfigured) {
    try {
      const created = await createBankSession({
        givenName: given,
        familyName: rest.join(' ') || given,
        birthDate,
        diagnosis,
        diagnosisDate,
        pronouns,
        preferredLanguage,
        supportPersonName,
        supportPersonPhone,
        communicationNotes,
      });
      fhir = created ?? undefined;
    } catch (err) {
      // A FHIR outage must not cost someone their recording window. Log it,
      // keep the session alive locally, and surface the degradation in the UI.
      console.error('[medplum] session provisioning failed:', err);
    }
  }

  const session = createSession({ patientName, diagnosis, fhir });
  return NextResponse.json({ session: serializeSession(session), fhirLinked: Boolean(fhir) });
}

/** Keep optional intake fields out of the record when the form left them blank. */
function clean(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
