/**
 * Medplum — the banked voice as real clinical data.
 *
 * The whole point of routing this through FHIR rather than a file on a laptop:
 * a voice bank that lives in the medical record is one the future care team can
 * actually find. Resource mapping:
 *
 *   Patient          — the person banking their voice
 *   CarePlan         — "communication preservation" plan, with the session's progress
 *   Media            — each recording (audio attachment + duration)
 *   Communication    — a banked *message* (the words, who it's for, when to play it)
 *   Observation      — speech baseline at diagnosis, so progression is measurable later
 */

import { MedplumClient } from '@medplum/core';

const CLIENT_ID = process.env.MEDPLUM_CLIENT_ID;
const CLIENT_SECRET = process.env.MEDPLUM_CLIENT_SECRET;
const BASE_URL = process.env.MEDPLUM_BASE_URL || 'https://api.medplum.com/';

export const medplumConfigured = Boolean(CLIENT_ID && CLIENT_SECRET);

/**
 * Medplum rate-limits its token endpoint hard (160 points/interval), and on a
 * hackathon day that bucket is shared with every other team hitting the same
 * instance. Two consequences worth defending against:
 *
 *  1. Log in ONCE per process, not once per request. The cache hangs off
 *     globalThis so it survives dev hot-reload — otherwise every code edit
 *     silently burns another token grant and you rate-limit yourself.
 *  2. When we do get a 429, respect the server's own `_msBeforeNext` rather
 *     than guessing a backoff.
 */
const globalCache = globalThis as typeof globalThis & {
  __cadenceMedplum?: Promise<MedplumClient> | null;
};

async function login(): Promise<MedplumClient> {
  const client = new MedplumClient({ baseUrl: BASE_URL, fetch });

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await client.startClientLogin(CLIENT_ID!, CLIENT_SECRET!);
      return client;
    } catch (err) {
      const waitMs = retryAfterMs(err);
      if (waitMs === null || attempt === 3) throw err;
      console.warn(`[medplum] token endpoint rate-limited, retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  throw new Error('unreachable');
}

/** Pull the server-supplied wait out of a 429; null if this isn't a rate limit. */
function retryAfterMs(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err);
  if (!/Too Many Requests|429/i.test(message)) return null;

  const match = message.match(/"_msBeforeNext":\s*(\d+)/);
  // Pad slightly — coming back at the exact reset instant tends to re-trip it.
  return match ? Number(match[1]) + 250 : 2000;
}

export async function getMedplum(): Promise<MedplumClient | null> {
  if (!medplumConfigured) return null;

  // Cache the in-flight promise, not just the resolved client, so concurrent
  // requests at cold start share one login instead of racing several.
  if (!globalCache.__cadenceMedplum) {
    globalCache.__cadenceMedplum = login().catch((err) => {
      globalCache.__cadenceMedplum = null; // let the next request try again
      throw err;
    });
  }

  return globalCache.__cadenceMedplum;
}

export const VOICE_BANK_SYSTEM = 'https://cadence.health/fhir/voice-bank';
export const ESSENTIAL_SYSTEM = 'https://cadence.health/fhir/essential-phrase';

export type BankSession = {
  patientId: string;
  carePlanId: string;
  conditionId: string;
};

export type BankSessionSummary = {
  patientId: string;
  carePlanId: string;
  patientName: string;
  diagnosis: string;
  createdAt?: string;
};

/**
 * Provision a patient + their communication-preservation CarePlan. Called once
 * at the top of a banking session.
 */
export async function createBankSession(input: {
  givenName: string;
  familyName: string;
  birthDate?: string;
  diagnosis: string;
  diagnosisDate?: string;
  pronouns?: string;
  preferredLanguage?: string;
  supportPersonName?: string;
  supportPersonPhone?: string;
  communicationNotes?: string;
}): Promise<BankSession | null> {
  const medplum = await getMedplum();
  if (!medplum) return null;

  const patient = await medplum.createResource({
    resourceType: 'Patient',
    name: [{ given: [input.givenName], family: input.familyName }],
    birthDate: input.birthDate,
    extension: input.pronouns
      ? [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/individual-pronouns',
            valueString: input.pronouns,
          },
        ]
      : undefined,
    communication: input.preferredLanguage
      ? [{ language: { text: input.preferredLanguage }, preferred: true }]
      : undefined,
    contact: input.supportPersonName
      ? [
          {
            relationship: [{ text: 'Primary support person' }],
            name: { text: input.supportPersonName },
            telecom: input.supportPersonPhone
              ? [{ system: 'phone', value: input.supportPersonPhone }]
              : undefined,
          },
        ]
      : undefined,
  });

  // A diagnosis belongs in a Condition, not only as unstructured CarePlan
  // text. The onset date is especially important for progressive conditions:
  // it anchors the baseline recordings to the clinical timeline.
  const condition = await medplum.createResource({
    resourceType: 'Condition',
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    code: { text: input.diagnosis },
    subject: { reference: `Patient/${patient.id}` },
    onsetDateTime: input.diagnosisDate,
    recordedDate: new Date().toISOString(),
  });

  const carePlan = await medplum.createResource({
    resourceType: 'CarePlan',
    status: 'active',
    intent: 'plan',
    title: 'Communication preservation — voice and message banking',
    description:
      `Guided voice and message banking initiated at diagnosis of ${input.diagnosis}. ` +
      'Preserves a synthetic voice and a personal message library for future AAC use, ' +
      'and establishes a speech baseline for progression tracking.',
    subject: { reference: `Patient/${patient.id}` },
    created: new Date().toISOString(),
    category: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '410606002',
            display: 'Social service procedure',
          },
        ],
        text: 'Communication preservation',
      },
    ],
    addresses: [{ reference: `Condition/${condition.id}`, display: input.diagnosis }],
    note: input.communicationNotes
      ? [{ text: `Communication notes: ${input.communicationNotes}` }]
      : undefined,
    activity: [
      { detail: { status: 'in-progress', kind: 'Task', description: 'Phonetic corpus capture for synthetic voice' } },
      { detail: { status: 'in-progress', kind: 'Task', description: 'Personal message banking' } },
      { detail: { status: 'not-started', kind: 'Task', description: 'Speech-generating device coverage determination' } },
    ],
  });

  return { patientId: patient.id!, carePlanId: carePlan.id!, conditionId: condition.id! };
}

/** Persist one recording: the audio as Media, the words as Communication. */
export async function saveRecording(input: {
  patientId: string;
  audio: ArrayBuffer;
  contentType: string;
  transcript: string;
  durationSeconds: number;
  /** 'phonetic' feeds the synthetic voice; 'message' is banked verbatim. */
  kind: 'phonetic' | 'message';
  /** Who the banked message is for, when it applies. */
  recipient?: string;
  occasion?: string;
  /** Which entry in the everyday-phrase deck this covers. */
  essentialId?: string;
}): Promise<{ mediaId: string; communicationId?: string } | null> {
  const medplum = await getMedplum();
  if (!medplum) return null;

  const binary = await medplum.createBinary({
    data: new Uint8Array(input.audio),
    filename: `${input.kind}-${Date.now()}.webm`,
    contentType: input.contentType,
  });

  const media = await medplum.createResource({
    resourceType: 'Media',
    status: 'completed',
    subject: { reference: `Patient/${input.patientId}` },
    createdDateTime: new Date().toISOString(),
    // Carries the deck id, so a device that never ran the session can still
    // tell which everyday phrase this recording is.
    identifier: input.essentialId
      ? [{ system: ESSENTIAL_SYSTEM, value: input.essentialId }]
      : undefined,
    duration: input.durationSeconds,
    type: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/media-type', code: 'audio', display: 'Audio' },
      ],
    },
    modality: {
      coding: [{ system: VOICE_BANK_SYSTEM, code: input.kind }],
      text: input.kind === 'phonetic' ? 'Phonetic corpus sample' : 'Banked personal message',
    },
    content: {
      contentType: input.contentType,
      url: `Binary/${binary.id}`,
      title: input.transcript.slice(0, 120),
    },
  });

  let communicationId: string | undefined;

  if (input.kind === 'message') {
    const communication = await medplum.createResource({
      resourceType: 'Communication',
      status: 'completed',
      subject: { reference: `Patient/${input.patientId}` },
      sender: { reference: `Patient/${input.patientId}` },
      sent: new Date().toISOString(),
      category: [
        { coding: [{ system: VOICE_BANK_SYSTEM, code: 'banked-message' }], text: 'Banked personal message' },
      ],
      topic: input.occasion ? { text: input.occasion } : undefined,
      about: [{ reference: `Media/${media.id}` }],
      payload: [
        { contentString: input.transcript },
        { contentAttachment: { contentType: input.contentType, url: `Binary/${binary.id}` } },
      ],
      note: input.recipient ? [{ text: `Intended for: ${input.recipient}` }] : undefined,
    });
    communicationId = communication.id;
  }

  return { mediaId: media.id!, communicationId };
}

/**
 * Record the speech baseline. Today's numbers are only interesting because of
 * what they'll be compared against in six months.
 */
export async function saveSpeechBaseline(input: {
  patientId: string;
  wordsPerMinute: number;
  meanConfidence: number;
}) {
  const medplum = await getMedplum();
  if (!medplum) return null;

  return medplum.createResource({
    resourceType: 'Observation',
    status: 'final',
    subject: { reference: `Patient/${input.patientId}` },
    effectiveDateTime: new Date().toISOString(),
    code: {
      coding: [{ system: VOICE_BANK_SYSTEM, code: 'speech-baseline' }],
      text: 'Speech rate and intelligibility baseline',
    },
    component: [
      {
        code: { text: 'Speaking rate' },
        valueQuantity: { value: Math.round(input.wordsPerMinute), unit: 'words/min' },
      },
      {
        code: { text: 'Mean ASR confidence (intelligibility proxy)' },
        // As a percentage rather than a bare 0–1 proportion: UCUM's
        // dimensionless '1' is correct but renders as "0.97 1" in any viewer.
        valueQuantity: { value: Number((input.meanConfidence * 100).toFixed(1)), unit: '%' },
      },
    ],
  });
}

export const OBSERVED_UTTERANCE_CODE = 'observed-utterance';

/**
 * Record what a caregiver confirmed this person actually meant.
 *
 * This is the entry that makes the profile a living document rather than a
 * snapshot of one recording session. Speech drifts; the way someone says
 * "I'm cold" at month eighteen is not how they said it at diagnosis. Each
 * confirmation is a labelled pair — what it sounded like, what it meant — and
 * it belongs in the record because the next nurse needs it more than we do.
 */
export async function saveObservedUtterance(input: {
  patientId: string;
  heard: string;
  meaning: string;
  situation?: string;
  confirmedBy?: string;
}) {
  const medplum = await getMedplum();
  if (!medplum) return null;

  const communication = await medplum.createResource({
    resourceType: 'Communication',
    status: 'completed',
    subject: { reference: `Patient/${input.patientId}` },
    sender: { reference: `Patient/${input.patientId}` },
    sent: new Date().toISOString(),
    category: [
      {
        coding: [{ system: VOICE_BANK_SYSTEM, code: OBSERVED_UTTERANCE_CODE }],
        text: 'Observed utterance with caregiver-confirmed meaning',
      },
    ],
    topic: input.situation ? { text: input.situation } : undefined,
    payload: [{ contentString: input.meaning }, { contentString: `heard: ${input.heard}` }],
    note: [
      { text: `Heard as: "${input.heard}"` },
      ...(input.confirmedBy ? [{ text: `Confirmed by: ${input.confirmedBy}` }] : []),
    ],
  });

  return { communicationId: communication.id! };
}

/**
 * Fetch a banked recording's audio back out of FHIR.
 *
 * This is what makes playback survive a serverless cold start: the bytes live
 * in Medplum as a Binary, so any instance can serve them even though it never
 * saw the request that recorded them.
 */
export async function readMediaAudio(
  mediaId: string
): Promise<{ contentType: string; data: Buffer } | null> {
  const medplum = await getMedplum();
  if (!medplum) return null;

  const media = await medplum.readResource('Media', mediaId);
  const url = media.content?.url;
  if (!url) return null;

  // Stored as a relative `Binary/<id>` reference; absolute URLs are passed
  // through untouched in case that ever changes.
  const target = url.startsWith('http')
    ? url
    : medplum.fhirUrl(...url.split('/')).toString();

  const blob = await medplum.download(target);
  return {
    contentType: media.content?.contentType ?? 'audio/webm',
    data: Buffer.from(await blob.arrayBuffer()),
  };
}

/** Everything banked for a patient — powers both the chart view and the decoder. */
export async function readVoiceBank(patientId: string) {
  const medplum = await getMedplum();
  if (!medplum) return null;

  const [patient, conditions, carePlans, media, communications, observations] = await Promise.all([
    medplum.readResource('Patient', patientId),
    medplum.searchResources('Condition', { subject: `Patient/${patientId}` }),
    medplum.searchResources('CarePlan', { subject: `Patient/${patientId}` }),
    medplum.searchResources('Media', { subject: `Patient/${patientId}`, _count: '100' }),
    medplum.searchResources('Communication', { subject: `Patient/${patientId}`, _count: '100' }),
    medplum.searchResources('Observation', { subject: `Patient/${patientId}` }),
  ]);

  return { patient, conditions, carePlans, media, communications, observations };
}

/**
 * Cross-device recovery for the demo. Browser localStorage makes resuming
 * immediate on the same device; Medplum is the durable source when someone
 * switches from their phone to a laptop.
 */
export async function listBankSessions(): Promise<BankSessionSummary[]> {
  const medplum = await getMedplum();
  if (!medplum) return [];

  const carePlans = await medplum.searchResources('CarePlan', {
    status: 'active',
    _count: '50',
  });
  const voiceBankPlans = carePlans.filter(
    (plan) => plan.title === 'Communication preservation — voice and message banking'
  );

  const summaries: Array<BankSessionSummary | null> = await Promise.all(
    voiceBankPlans.map(async (plan) => {
      const patientId = plan.subject?.reference?.replace(/^Patient\//, '');
      if (!patientId || !plan.id) return null;

      const patient = await medplum.readResource('Patient', patientId);
      const name = patient.name?.[0];
      const patientName =
        name?.text ?? [name?.given?.join(' '), name?.family].filter(Boolean).join(' ') ?? 'Unnamed patient';

      return {
        patientId,
        carePlanId: plan.id,
        patientName,
        diagnosis: plan.addresses?.[0]?.display ?? 'Communication preservation',
        createdAt: plan.created,
      };
    })
  );

  return summaries
    .filter((summary): summary is BankSessionSummary => summary !== null)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}
