/**
 * Stedi — the question every family actually asks.
 *
 * "Will insurance cover the speech device?" Medicare and most payers *do*
 * cover speech-generating devices as durable medical equipment, but only via a
 * specific documentation path that most people never learn about until the
 * window has closed. A 270/271 at the moment of diagnosis turns "someday I'll
 * figure out the device" into a covered path with a checklist.
 */

const API_KEY = process.env.STEDI_API_KEY;
const ENDPOINT =
  'https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3';

export const stediConfigured = Boolean(API_KEY);

/**
 * X12 service type codes. `12` (DME purchase) is the one that matters for a
 * speech-generating device; `18` covers the rental path; `30` gives us the
 * plan's overall active-coverage picture for context.
 */
export const SGD_SERVICE_TYPE_CODES = ['12', '18', '30'];

export type CoverageInput = {
  tradingPartnerServiceId: string;
  memberId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  providerName: string;
  providerNpi: string;
};

export type BenefitLine = {
  code?: string;
  name?: string;
  serviceTypes?: string[];
  benefitAmount?: string;
  benefitPercent?: string;
  inNetwork?: string;
  notes?: string[];
};

export type CoverageResult = {
  source: 'stedi' | 'demo';
  active: boolean;
  planName?: string;
  payerName?: string;
  benefits: BenefitLine[];
  /** What the SGD claim actually needs, beyond "is it covered". */
  approvalPath: string[];
  raw?: unknown;
};

export async function checkSgdCoverage(input: CoverageInput): Promise<CoverageResult> {
  if (!API_KEY) return demoCoverage();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tradingPartnerServiceId: input.tradingPartnerServiceId,
      encounter: { serviceTypeCodes: SGD_SERVICE_TYPE_CODES },
      provider: { organizationName: input.providerName, npi: input.providerNpi },
      subscriber: {
        firstName: input.firstName,
        lastName: input.lastName,
        memberId: input.memberId,
        dateOfBirth: input.dateOfBirth,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Stedi eligibility ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  const benefitsInformation: Record<string, never>[] = json?.benefitsInformation ?? [];

  const benefits: BenefitLine[] = benefitsInformation.map((b) => ({
    code: b.code,
    name: b.name,
    serviceTypes: b.serviceTypes,
    benefitAmount: b.benefitAmount,
    benefitPercent: b.benefitPercent,
    inNetwork: b.inPlanNetworkIndicator,
    notes: (b.additionalInformation as { description?: string }[] | undefined)
      ?.map((a) => a.description)
      .filter((d): d is string => Boolean(d)),
  }));

  return {
    source: 'stedi',
    active: benefits.some((b) => b.name === 'Active Coverage'),
    planName: json?.planInformation?.planNumber ?? json?.planDateInformation?.plan,
    payerName: json?.payer?.name,
    benefits,
    approvalPath: SGD_APPROVAL_PATH,
    raw: json,
  };
}

/**
 * The documentation an SGD claim needs. This is the part that turns an
 * eligibility number into something a family can act on — and it's stable
 * enough to state plainly rather than infer from the 271.
 */
export const SGD_APPROVAL_PATH = [
  'SLP evaluation documenting a severe expressive communication disorder',
  'Physician order tying the device to the ALS / laryngectomy diagnosis',
  'Demonstration that lower-cost alternatives are insufficient',
  'Device trial report from the assistive-technology supplier',
  'Prior authorization submitted under DME benefit (HCPCS E2510)',
];

/** Used when no Stedi key is present, so the demo still tells the whole story. */
function demoCoverage(): CoverageResult {
  return {
    source: 'demo',
    active: true,
    planName: 'Choice Plus PPO',
    payerName: 'UnitedHealthcare (sample response)',
    benefits: [
      { code: '1', name: 'Active Coverage', serviceTypes: ['Health Benefit Plan Coverage'], inNetwork: 'Y' },
      {
        code: 'A',
        name: 'Co-Insurance',
        serviceTypes: ['Durable Medical Equipment Purchase'],
        benefitPercent: '0.2',
        inNetwork: 'Y',
        notes: ['Speech-generating devices covered under DME with prior authorization'],
      },
      {
        code: 'C',
        name: 'Deductible',
        serviceTypes: ['Durable Medical Equipment Purchase'],
        benefitAmount: '500',
        inNetwork: 'Y',
      },
    ],
    approvalPath: SGD_APPROVAL_PATH,
  };
}
