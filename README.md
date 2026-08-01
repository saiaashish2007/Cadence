# Cadence

## 1. What Is This?

**Cadence is for anyone whose speech is at risk, whatever the cause.** ALS and laryngectomy are the sharpest versions of the problem and the two we designed against first, but they are not the boundary. The intake covers head and neck cancer, Parkinson's, multiple sclerosis, stroke and aphasia, cerebral palsy, traumatic brain injury, and a free-text field for anything else — because the thing that matters isn't the diagnosis, it's whether someone has any warning before their voice changes.

About [5,000 Americans are told they have ALS every year](https://www.cdc.gov/als/abouttheregistrymain/index.html), and most will eventually lose the ability to speak as the disease reaches the muscles that produce speech. Another [12,290 people are diagnosed with laryngeal cancer annually](https://seer.cancer.gov/statfacts/html/laryn.html), where treatment can mean removing the voice box outright. Those are two entry points into a much larger population — degenerative disease, surgery, stroke, injury — and in every case the same window exists: the voice is still here today, and it may not be later.

The two established preparations, **voice banking** and **message banking**, are drastically under-used, because patients are told too late and the process asks them to read hundreds of phonetically-chosen sentences alone at a computer, often *after* speech has already started to slur. Cadence compresses that into one twenty-minute session and makes the recordings useful the same day:

1. Walks the patient through a curated deck of everyday phrases — introducing themselves, asking for water, saying where it hurts, saying goodnight
2. Interleaves personal messages addressed to a specific person for a specific occasion, with no limit on how many
3. Transcribes every take and tracks live ARPAbet phoneme coverage, so the corpus stays valid for a synthetic voice later
4. Charts each recording to the patient's medical record as FHIR, with the audio itself stored as a `Binary`
5. Turns the finished bank into a talking aid — someone asks a question, and the patient's own recorded voice answers
6. Gives caregivers a decoder for speech that has become slurred, and records what each utterance actually meant

By the end of the session the patient has a phrase bank that plays in their real voice, the care team has a `CarePlan` with the recordings attached, and the family has the documentation path for a covered speech-generating device. Built on Deepgram (STT/TTS), Moss (sub-10ms retrieval), Medplum (FHIR), Anthropic (Claude Opus 5), and Stedi (270/271 eligibility), deployed on Vercel.

**Cadence never synthesises the patient's voice.** Every sound it plays on their behalf is a recording they made. Nothing can sound not-quite-right at the moment it matters most.

**On the size of the deck.** This MVP ships 30 everyday phrases. That number is a curation decision, not a technical ceiling — it's the shortest deck we could find that still reaches full phoneme coverage, so a first session fits in the twenty minutes a newly-diagnosed patient actually has. Nothing in the storage or retrieval path caps at 30: personal messages are already unbounded, Moss indexes per-patient with no limit, and each recording is its own FHIR `Media`. Growing the deck to hundreds of phrases, or tailoring it per condition and per person, is a content problem rather than an engineering one — see [Future Considerations](#a-deck-that-grows-past-thirty).

## 2. Demo

[Video](https://youtu.be/Ybc9i6t9J2g)

## 3. How We Used Deepgram, Moss, Medplum, Anthropic, and Stedi

### Deepgram (Speech Capture & Agent Voice)

1. **Transcription of every take:** Each recording is posted to `nova-3` via the REST API directly rather than the SDK (`lib/deepgram.ts`), because the raw audio bytes are what we persist to FHIR anyway. The returned transcript — not the sentence we prompted — is what feeds phoneme coverage, so the progress bar reflects what was actually said.
2. **The agent's spoken prompts:** `aura-2-thalia-en` reads each prompt aloud so the session works for someone who is tired or struggling to read a screen. This is deliberately the *agent's* voice; the patient's voice is never sent to TTS.
3. **Empty-transcript guard:** Short or quiet takes occasionally return an empty transcript. Rather than banking a blank string, `/api/bank` falls back to the prompted sentence — an empty transcript would otherwise silently poison the coverage calculation for the rest of the session.

### Moss (Sub-10ms Personal Retrieval)

1. **One index per patient:** Each person gets a `voicebank-<patientId>` session index. Phrases are added in-process during capture with `addDocs` (no cloud round-trip), queried locally, and published with `pushIndex()` after *every* take — not at session end — so a different serverless instance, or the caregiver's tab, can load the same bank immediately.
2. **Dual indexing, which is the whole trick behind "speak for me":** *"Are you in pain?"* shares almost no words with *"I'm in pain."* So each deck recording is indexed **twice** — once on the spoken text for the decoder, and once on the `triggers` list (the ways someone might ask that question) as a separate `kind: 'answer'` document whose `meaning` points back at the recording. Querying the second set with a caregiver's question returns the right audio in single-digit milliseconds.
3. **Kind-filtered search:** Mixing those two document types ruins both searches, so `searchBank` takes an `only` filter and over-fetches `topK * 4` before filtering, so the filter doesn't eat the result set. Reported latency uses Moss's own `timeTakenInMs` rather than our wall clock, so the number isn't inflated by our await overhead.
4. **Native-module handling:** `MossClient` holds native N-API resources, so it's cached on `globalThis` and imported dynamically inside the request path — a fresh client per module evaluation leaks a runtime handle and re-downloads every index.

### Medplum (The Clinical Record)

1. **Six resource types, each doing real work:** `Patient` and `Condition` from the intake form, a `CarePlan` for the preservation plan, a `Media` per recording, a `Communication` per personal message, and an `Observation` for the speech baseline. This is what makes a banked voice survive the move to hospice instead of being a folder on a laptop.
2. **Audio as the source of truth:** Recordings are stored as FHIR `Binary` and streamed back through `/api/audio/<mediaId>`. Because playback resolves from Medplum rather than server memory, it works on an instance that never saw the recording — which is the only reason the app functions on Vercel at all.
3. **Automatic speech baseline:** On the third recording, `/api/bank` writes an `Observation` with words-per-minute and mean ASR confidence. In six months, that single row is the reason progression is measurable rather than anecdotal.
4. **Token rate-limit handling:** Medplum rate-limits its token endpoint at 160 points per interval, and on a hackathon day that bucket is shared with every other team on the same instance. We log in **once per process**, cache the client on `globalThis` so dev hot-reload doesn't silently burn another grant, and on a 429 respect the server's own `_msBeforeNext` instead of guessing a backoff.

### Anthropic (Judgement, and Knowing When to Withhold)

1. **Shortlists instead of answers:** `suggestAnswers` (Claude Opus 5, adaptive thinking, structured output) receives the Moss candidates and returns up to three `recordingIds` to tap, plus a separate `autoplayId` — the one reply safe to play *without* being asked. That second bar is deliberately much higher and is met only when a question has one honest answer that doesn't depend on how the patient feels. *"What's your name?"* plays itself. *"Are you in pain?"* offers both banked sides and plays neither, because that answer is theirs to give.
2. **A decoder calibrated toward doubt:** `decodeUtterance` is grounded strictly in the retrieved banked phrases and is prompted to prefer low confidence. A confident wrong guess here means the patient is misunderstood *again*, by someone who was trying to help — so the UI also surfaces which banked phrases grounded each reading, letting a human check the work.
3. **Caregiver communication profiles:** `buildCommunicationProfile` writes a short briefing from the patient's own banked words — how they phrase things, who they mention, what to say back — for the night nurse who has two minutes before they have to try talking to them.
4. **Deliberately removed from the hot path:** Routine deck progression originally ran through the model and cost ~8 seconds per prompt. It's now deterministic, and Claude is reserved for the three tasks above that genuinely require judgement.

### Stedi (Device Coverage)

1. **Real 270/271 for the device:** `/api/coverage` submits an eligibility request against service type codes `12` (DME purchase), `18` (rental), and `30` (overall plan coverage) — the codes that actually determine whether a speech-generating device is covered.
2. **The part families never learn in time:** Medicare and most payers *do* cover SGDs as durable medical equipment, but only through a specific documentation path. Cadence returns that checklist alongside the benefit: SLP evaluation, physician order tied to the diagnosis, demonstration that lower-cost alternatives are insufficient, supplier trial report, and prior authorization under HCPCS `E2510`.
3. **An honest fallback:** Stedi issues API keys only to work email addresses, which we could not obtain during the event. Without a key the route returns a sample 271 explicitly tagged `source: 'demo'`, and the UI labels it as such. We would rather show a labelled stub than a fabricated eligibility result in a screen about someone's insurance.

## 4. What We Built During the Hackathon

We started by throwing out the sentence list. Standard voice banking has people read lines like *"the big yellow jug of fresh orange juice is warming on the shelf"* — chosen purely for phonetic spread, useless for anything else. We replaced it with 30 phrases someone will actually need, then had to prove the deck still worked as a training corpus. It didn't, at first: our grapheme-to-phoneme approximation could never reach 100%, because English orthography doesn't reliably spell AY, DH, UH, ZH, or Z. The progress bar would have stalled short of complete forever no matter what was read. We added a `WORD_SOUNDS` lookup for the high-frequency words that carry those sounds, which closed the inventory.

The hardest problem was state. The first Vercel deployment looked fine and then broke after a few recordings on a phone — the in-memory session store meant the instance that provisioned the `CarePlan` was usually not the instance handling the next take. We rewrote every API route to be stateless: the browser owns the session and sends it with each request, Medplum holds the audio as `Binary` so playback resolves anywhere, and Moss's index is pushed to the cloud after every recording rather than at session end. `lib/store.ts` survives only as a same-process cache that's checked first because it's instant and never depended on. Moss also refused to load on Vercel at all initially — an npm optional-dependency bug meant the native binding went missing — which we fixed by pinning the platform package, marking it external in `next.config.ts`, and deferring the import into the request path.

With the bank durable, we built the two surfaces that use it. **Speak for me** needed the dual-indexing trick above, because matching a question to its answer by text similarity simply doesn't work. **Decode** got split into two requests after we measured them: Moss answers in single-digit milliseconds and Claude takes several seconds, so `/api/decode/retrieve` paints the banked matches immediately and the reading fills in underneath — running them as one call would have hidden the fastest number in the system behind the slowest. We then closed the loop: when a caregiver confirms what an utterance meant, `/api/confirm` writes the pair to FHIR as a `Communication` and indexes it in Moss on the **heard** form, so the next person who hears that sound retrieves the confirmed reading instead of starting from a guess. On one measured confirmation, `"wah-er coh"` went from *"a request for a cold drink of water"* at medium confidence to *"she wants her water colder — more ice, not a refill"* at high confidence, with the confirmed entry retrieved at score 1.000. That loop is the honest answer to a real problem: speech at month eighteen is not speech at diagnosis, and a library frozen at diagnosis decays.

Last, we hardened it for judging. A banked voice is impersonation-grade material, so a signed httpOnly session cookie now gates every patient-facing page *and* the APIs behind them — gating only the pages would have left the data endpoints open to anyone who knew the paths. Banking autosaves on a debounce and flushes on `pagehide`, because iOS can kill a backgrounded tab without ever firing `unload`, which is exactly how you lose the tail of a recording session on a phone.

## 5. Tool Feedback

### Moss Feedback

**What worked well:** The sub-10ms claim holds, and the session-index model is the right shape for this problem — a personal phrase bank is small, private, and needs to answer inside a live conversation, which is precisely where a cloud vector database at 100–500ms fails. Being able to build an index in-process during capture and push it when convenient meant we never had to choose between speed and durability.

**What could be improved:** Installing on Vercel failed with `Cannot find native binding`, caused by the known npm optional-dependency bug rather than anything in Moss itself — but the error surfaces at runtime as a module-load failure with no hint that a platform package is missing. Documenting the `@moss-dev/moss-core-<platform>` pin for serverless deploys would have saved us a deployment cycle. A note that `MossClient` holds native resources and should be cached across hot reloads would also help; we found that by leaking handles first.

### Medplum Feedback

**What worked well:** The resource model mapped onto this domain without any bending. `Media` for a recording with its audio attachment, `Communication` for a message with a recipient and an occasion, `Observation` for a speech baseline, `CarePlan` to tie it together — we never once had to invent a custom resource or stuff data into an extension where a real field should have been. Storing audio as `Binary` is also what made the app work on serverless.

**What could be improved:** The token endpoint's rate limit (160 points/interval) is shared across everyone on the instance, which on a hackathon day is brutal and produces failures that look like auth bugs rather than throttling. The 429 does include `_msBeforeNext`, which is genuinely useful once you find it — but a client-side default that caches the login and honours that value automatically would stop every team from writing the same retry loop.

### Deepgram Feedback

**What worked well:** `nova-3` was accurate enough that we could trust transcripts as the input to phoneme coverage rather than assuming the prompted text was said correctly, which is the difference between a real progress bar and a fake one. `aura-2` was fast enough to narrate prompts without the session feeling like it was waiting on a server.

**What could be improved:** Short takes — a two-word phrase like *"Thank you"* — sometimes return an empty transcript with a successful 200 rather than a low-confidence result. That's indistinguishable from silence at the API level, so every caller has to build the same fallback. A confidence-scored best guess, or an explicit "audio too short" signal, would be more useful than an empty string.

### Anthropic Feedback

**What worked well:** Structured outputs plus adaptive thinking made the safety-critical restraint expressible as a schema rather than a hope: `recordingIds` and `autoplayId` are separate fields with separate bars, and the model reliably left `autoplayId` empty on questions like *"are you in pain?"* while filling it for *"what's your name?"*. Getting that judgement right mattered more than anything else in the build.

**What could be improved:** Latency made it the wrong tool for anything on the interaction path, which we learned by shipping an ~8s delay between recordings before making deck progression deterministic. That's an appropriate trade — but it does mean the useful design pattern here is "fast retrieval paints, model reasons underneath," and that pattern isn't really reflected in the getting-started material.

### Stedi Feedback

**What worked well:** The eligibility API is well-shaped for exactly this question, and the service-type-code model let us ask specifically about DME purchase and rental rather than just "is this person covered."

**What could be improved:** API keys require a work email address, which made a real credential unobtainable for a student team during a weekend event. A sandbox key with synthetic payers, issuable to any address, would let hackathon teams demonstrate the integration honestly instead of shipping a labelled stub.

## Live demo — Cadence

**App:** [https://cadence-delta-wheat.vercel.app](https://cadence-delta-wheat.vercel.app)

| | |
|---|---|
| **Sign in** | `user123` |
| **Password** | `medplum` |
| **Sample patient** | Any name — a `Patient` and `CarePlan` are provisioned on start |

After sign-in, use **Bank a voice**, **Speak for me**, and **Decoder** in the header.

The two-minute path: bank three or four phrases on **Bank a voice**, open **Speak for me** and tap one to hear the real recording, then ask *"Can I get you anything?"* and watch it narrow 30 phrases to three. Ask *"Are you in pain?"* to see it offer both sides and play neither. Finally, open **Decoder**, enter `wah-er coh`, and confirm what it meant — the confirmation is charted to FHIR and indexed for the next listener.

For local setup and the full environment matrix, see [SETUP.md](./SETUP.md).

## Future Considerations

### Decks Tuned Per Condition

The intake already accepts nine condition categories plus free text, but every patient currently gets the same deck. They shouldn't. Someone facing a planned laryngectomy has a known date and can bank in a calm, unhurried voice; someone with advancing ALS may be recording against bulbar decline that is already underway; someone recovering from a stroke has a very different trajectory again, where the goal may be bridging a temporary gap rather than preserving against permanent loss. The phrases worth banking first, the order to ask for them in, and when to tell someone they've done enough all differ by condition, and getting that right is a clinical question rather than a code one.

### A Deck That Grows Past Thirty

Thirty is what one sitting can realistically produce while someone still has the energy and the voice for it, and it is deliberately the smallest deck that reaches full phoneme coverage. It is not the product. The deck is a static array in `lib/essentials.ts`, and everything downstream — the phrase board, the question matcher, the retrieval index, the FHIR writes — is already indifferent to how many entries it holds.

The version worth building keeps banking across visits rather than treating it as one session: condition-specific decks (an ALS patient and a laryngectomy patient need different first sentences), phrases drawn from what this person's caregivers actually ask them, and the ability to add a line whenever they think of one. The interesting constraint at that scale isn't storage, it's ordering — deciding what is worth their voice next, when their voice is the resource running out. That is the point at which the model belongs back in the banking loop, ranking candidates against what they've already said, instead of walking a fixed list.

### Per-User Accounts and a Real Threat Model

The demo runs on one shared credential. A banked voice is impersonation-grade material, so the production version needs patient, clinician, and caregiver roles with auditable access, consent captured as a first-class FHIR resource, and revocation that actually removes playback rights rather than hiding a button. This is the single largest gap between the prototype and something that could touch a real patient.

### Clinical Validation of the Deck

The 30 phrases were chosen by us, checked for phoneme coverage in code, and never reviewed by a speech-language pathologist. The next step is validating both the deck and the decoder workflow with SLPs and with people living with progressive speech conditions — including whether the categories are right, whether the phrasing sounds like something a person would actually say, and whether the decoder's confidence calibration matches what caregivers need to act safely.

### Consented Voice Provisioning

The corpus reaches full phoneme coverage specifically so a synthetic voice can be built from it later, which would extend the patient past any banked deck, however large, into open-ended speech. We deliberately did not build this in a weekend: a cloned voice is the point at which consent, revocation, and misuse stop being design concerns and become legal ones. It should be a pluggable step gated on explicit, revocable consent — and it should extend the recordings, never replace them.

---

Cadence is a hackathon prototype built for the Medplum Agentic Healthcare Hackathon at Y Combinator. It is not a medical device, not clinical advice, and not a production health-record system.
