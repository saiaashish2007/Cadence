/**
 * Reassembles a person's communication profile out of FHIR.
 *
 * The profile has to be readable by someone who was never part of the banking
 * session — a night nurse, a new aide — so it is rebuilt from Medplum rather
 * than from whatever the tab that ran the session happens to still hold.
 */

import {
  readVoiceBank,
  ESSENTIAL_SYSTEM,
  OBSERVED_UTTERANCE_CODE,
  VOICE_BANK_SYSTEM,
} from './medplum';

/**
 * Only the fields this module reads, declared locally rather than pulling in
 * `@medplum/fhirtypes` for four property lookups.
 */
type Coding = { system?: string; code?: string };
type Media = {
  id?: string;
  modality?: { coding?: Coding[] };
  content?: { title?: string };
  identifier?: { system?: string; value?: string }[];
};
type Communication = {
  id?: string;
  sent?: string;
  category?: { coding?: Coding[] }[];
  topic?: { text?: string };
  payload?: { contentString?: string }[];
  note?: { text?: string }[];
  about?: { reference?: string }[];
};

export type ProfilePhrase = {
  id: string;
  text: string;
  kind: 'phonetic' | 'message';
  recipient?: string;
  occasion?: string;
  mediaId?: string;
  audioUrl?: string;
  essentialId?: string;
};

export type ObservedUtterance = {
  id: string;
  heard: string;
  meaning: string;
  situation?: string;
  when?: string;
};

function categoryCode(resource: Communication): string | undefined {
  return resource.category?.[0]?.coding?.find((c) => c.system === VOICE_BANK_SYSTEM)?.code;
}

function noteMatching(resource: Communication, prefix: string): string | undefined {
  const hit = resource.note?.find((n) => n.text?.startsWith(prefix));
  return hit?.text?.slice(prefix.length).replace(/^["\s]+|["\s]+$/g, '') || undefined;
}

export async function readProfileSources(patientId: string): Promise<{
  patientName: string;
  phrases: ProfilePhrase[];
  observed: ObservedUtterance[];
} | null> {
  const bank = await readVoiceBank(patientId);
  if (!bank) return null;

  const media: Media[] = bank.media ?? [];
  const communications: Communication[] = bank.communications ?? [];

  const phrases: ProfilePhrase[] = media.map((m) => {
    const kind =
      m.modality?.coding?.find((c) => c.system === VOICE_BANK_SYSTEM)?.code === 'message'
        ? 'message'
        : 'phonetic';
    return {
      id: m.id!,
      // Media titles are capped at 120 characters; the full text of a banked
      // message comes off its Communication below.
      text: m.content?.title ?? '',
      kind,
      mediaId: m.id!,
      audioUrl: `/api/audio/${m.id}`,
      essentialId: m.identifier?.find((i) => i.system === ESSENTIAL_SYSTEM)?.value,
    };
  });

  const byMediaId = new Map(phrases.map((p) => [p.id, p]));
  const observed: ObservedUtterance[] = [];

  for (const comm of communications) {
    const code = categoryCode(comm);

    if (code === OBSERVED_UTTERANCE_CODE) {
      const meaning = comm.payload?.[0]?.contentString ?? '';
      const heard =
        noteMatching(comm, 'Heard as:') ??
        comm.payload?.[1]?.contentString?.replace(/^heard:\s*/, '') ??
        '';
      if (meaning && heard) {
        observed.push({
          id: comm.id!,
          heard,
          meaning,
          situation: comm.topic?.text,
          when: comm.sent,
        });
      }
      continue;
    }

    if (code === 'banked-message') {
      const mediaRef = comm.about?.find((a) => a.reference?.startsWith('Media/'))?.reference;
      const target = mediaRef ? byMediaId.get(mediaRef.slice('Media/'.length)) : undefined;
      if (!target) continue;

      target.text = comm.payload?.[0]?.contentString ?? target.text;
      target.kind = 'message';
      target.recipient = noteMatching(comm, 'Intended for:');
      target.occasion = comm.topic?.text;
    }
  }

  const name = bank.patient?.name?.[0];
  const patientName =
    name?.text ?? [name?.given?.join(' '), name?.family].filter(Boolean).join(' ') ?? '';

  return {
    patientName,
    phrases: phrases.filter((p) => p.text.trim()),
    observed: observed.sort((a, b) => (b.when ?? '').localeCompare(a.when ?? '')),
  };
}
