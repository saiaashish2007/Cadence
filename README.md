# Cadence

## 1. What Is This?

**Cadence preserves a person’s voice while they still have it, then turns those recordings into a practical communication aid when speech becomes difficult or impossible.**

For people diagnosed with ALS, head-and-neck cancer, or another condition that can affect speech, voice banking is usually introduced too late and asks them to record hundreds of sentences they will never say. Cadence makes the first session useful immediately:

1. Guides a person through 30 everyday phrases and meaningful personal messages.
2. Stores each recording with the patient’s clinical record.
3. Lets them tap those recordings later to speak in their own voice.
4. Helps caregivers retrieve and confirm likely meanings when speech becomes unclear.
5. Shows the durable-medical-equipment documentation path for a speech-generating device.

The 30 phrases are selected for real use — asking for water, describing pain, saying goodnight — while still covering the English phonemes needed for future voice-cloning provision. Cadence plays real recordings, not a synthetic clone, so it is useful on day one.

Built for the Medplum Agentic Healthcare Hackathon at Y Combinator.

## 2. Demo

**Live app:** [cadence-delta-wheat.vercel.app](https://cadence-delta-wheat.vercel.app)

**Sign in:** `user123` · **Password:** `medplum`

Suggested two-minute flow:

1. Choose **Bank a voice**, create a patient record, and bank two or three phrases.
2. Open **Speak for me** and tap a phrase to play the original recording.
3. Ask a prepared question such as “Can I get you anything?” to receive a safe shortlist of matching replies.
4. Open **Decoder**, enter an unclear utterance, then confirm or correct its meaning. The confirmation becomes part of the patient’s record and improves later retrieval.

## 3. How We Used Deepgram, Moss, Medplum, Anthropic, and Stedi

### Deepgram — guided audio capture

Deepgram transcribes each take and reads the next prompt aloud. The transcript is used to track the phrase bank and phoneme coverage; prompt audio keeps the session usable when reading is difficult.

### Moss — the personal phrase library

Each patient has a separate semantic index. Moss finds recordings that match a caregiver’s question for **Speak for me**, and finds likely banked phrases when a caregiver enters speech they could not understand. Confirmed meanings are indexed too, so the library adapts as speech changes.

### Medplum — durable clinical record

Cadence writes a `Patient`, `CarePlan`, `Condition`, `Media`, `Communication`, and `Observation` to Medplum. Audio is stored as FHIR `Binary` data so a later care team can retrieve it rather than depending on a browser tab.

### Anthropic — restrained clinical language

Anthropic produces the caregiver communication profile and ranks potential responses from the patient’s already-recorded phrases. It never generates a sentence for the patient to “say”; it can only offer their own recorded audio, and it waits for a tap when more than one answer could be true.

### Stedi — device-coverage workflow

Cadence can request 270/271 eligibility for durable medical equipment, including speech-generating devices. Without a Stedi credential, it deliberately displays a labelled sample response and the documentation checklist instead of presenting a fabricated eligibility result.

## 4. What We Built During the Hackathon

We built one voice bank that serves three moments in the same person’s care:

- **Bank:** a quick, guided capture session that autosaves locally and charts recordings to Medplum when configured.
- **Speak for me:** a tap-to-speak board using the person’s actual recordings, plus semantic question matching that presents choices rather than guessing on sensitive questions.
- **Decode:** a caregiver enters what they heard; Cadence retrieves the closest banked phrases and records a caregiver’s confirmed interpretation for future use.

The app is serverless-safe: the browser owns its active session, Medplum stores audio and clinical resources, and Moss persists the retrieval index. A recovery code lets a Medplum-backed record be restored on another device. A signed, httpOnly session cookie gates every patient-facing route and its APIs.

## 5. Tool Feedback

### What worked well

- **Medplum’s FHIR model** maps naturally to this workflow: `Media` holds the recording, `Communication` captures personal messages and caregiver confirmations, and `CarePlan` anchors voice preservation to the patient record.
- **Moss** makes the interaction feel conversational instead of like a search form. Retrieval happens before slower reasoning so caregivers see grounded phrase matches immediately.
- **Deepgram** keeps the capture flow hands-free enough to feel like a guided session rather than a recording assignment.

### What could be improved

- **Stedi onboarding** currently requires a work email, which made a real eligibility credential impractical for a hackathon demo. The app clearly labels its fallback, but a production deployment needs live payer connections before claims advice is shown.
- **Voice cloning is intentionally not implemented.** Real audio is safer and more emotionally faithful for the phrase bank, but a production product would need a consented provisioning path for a high-quality synthetic voice outside the 30 recorded phrases.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then sign in with `user123` / `medplum`.

All integration keys are optional. Missing credentials use labelled fallbacks rather than silently faking a live service.

| Environment variable | Enables |
| --- | --- |
| `DEEPGRAM_API_KEY` | Speech-to-text and prompt text-to-speech |
| `MOSS_PROJECT_ID`, `MOSS_PROJECT_KEY` | Persistent semantic retrieval |
| `MEDPLUM_CLIENT_ID`, `MEDPLUM_CLIENT_SECRET` | FHIR persistence and audio retrieval |
| `ANTHROPIC_API_KEY` | Response ranking and communication profiles |
| `STEDI_API_KEY` | Live 270/271 device eligibility |
| `CADENCE_AUTH_SECRET` | Production session-cookie signing |

## Future Considerations

1. Replace the shared demo credential with patient, clinician, and caregiver accounts plus auditable role-based access.
2. Add explicit consent revocation and retention controls for voice recordings.
3. Validate the phrase deck and decoder workflow with speech-language pathologists and people with progressive speech conditions.
4. Integrate a consented voice-cloning provider for open-ended communication, without replacing the original recordings.

Cadence is a hackathon prototype, not clinical advice or a production health-record system.
