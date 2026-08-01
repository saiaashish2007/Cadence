/**
 * The resources exactly as they'd be written, for when Medplum isn't reachable.
 *
 * Shown clearly labelled as a projection — the point is that the shapes are
 * real even when the write isn't, never to imply a record exists that doesn't.
 */

import type { CadenceSession } from './client-session';

export const VOICE_BANK_SYSTEM = 'https://cadence.health/fhir/voice-bank';

export function projectFhir(session: CadenceSession) {
  const patientRef = { reference: `Patient/${session.patientId ?? session.id}` };

  return {
    patient: {
      resourceType: 'Patient',
      id: session.patientId ?? session.id,
      name: [{ text: session.patientName }],
      birthDate: session.birthDate,
      extension: session.pronouns
        ? [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/individual-pronouns',
              valueString: session.pronouns,
            },
          ]
        : undefined,
      communication: session.preferredLanguage
        ? [{ language: { text: session.preferredLanguage }, preferred: true }]
        : undefined,
      contact: session.supportPersonName
        ? [
            {
              relationship: [{ text: 'Primary support person' }],
              name: { text: session.supportPersonName },
              telecom: session.supportPersonPhone
                ? [{ system: 'phone', value: session.supportPersonPhone }]
                : undefined,
            },
          ]
        : undefined,
    },
    conditions: [
      {
        resourceType: 'Condition',
        id: session.conditionId ?? `${session.id}-condition`,
        clinicalStatus: { text: 'Active' },
        code: { text: session.diagnosis },
        subject: patientRef,
        onsetDateTime: session.diagnosisDate,
        recordedDate: session.createdAt,
      },
    ],
    carePlans: [
      {
        resourceType: 'CarePlan',
        status: 'active',
        intent: 'plan',
        title: 'Communication preservation — voice and message banking',
        subject: patientRef,
        addresses: [{ reference: `Condition/${session.conditionId ?? `${session.id}-condition`}`, display: session.diagnosis }],
        note: session.communicationNotes
          ? [{ text: `Communication notes: ${session.communicationNotes}` }]
          : undefined,
        activity: [
          {
            detail: {
              status: 'in-progress',
              description: 'Phonetic corpus capture for synthetic voice',
            },
          },
          { detail: { status: 'in-progress', description: 'Personal message banking' } },
          {
            detail: {
              status: 'not-started',
              description: 'Speech-generating device coverage determination',
            },
          },
        ],
      },
    ],
    media: session.banked.map((r) => ({
      resourceType: 'Media',
      id: r.id,
      status: 'completed',
      subject: patientRef,
      duration: r.durationSeconds,
      modality: { coding: [{ system: VOICE_BANK_SYSTEM, code: r.kind }] },
      content: { contentType: 'audio/webm', title: r.transcript.slice(0, 120) },
    })),
    communications: session.banked
      .filter((r) => r.kind === 'message')
      .map((r) => ({
        resourceType: 'Communication',
        id: r.id,
        status: 'completed',
        subject: patientRef,
        sender: patientRef,
        topic: r.occasion ? { text: r.occasion } : undefined,
        payload: [{ contentString: r.transcript }],
        note: r.recipient ? [{ text: `Intended for: ${r.recipient}` }] : undefined,
      })),
    observations: [],
  };
}
