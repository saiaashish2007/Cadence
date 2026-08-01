# Cadence

**Say "I love you" in your own voice, even after you can't speak.**

Guided voice and message banking at the moment of diagnosis — charted to FHIR, with a covered path
to a speech device. And, using the same library, a decoder for the people around them after speech
is gone.

Built for the Medplum Agentic Healthcare Hackathon at Y Combinator.

---

## The problem

When someone is diagnosed with ALS, or scheduled for a laryngectomy, there is a closing window:
they still have their voice today, and they will lose it. Two established practices exist to
prepare — **voice banking** (recording enough speech to build a synthetic voice for a future AAC
device) and **message banking** (recording specific meaningful phrases in their actual voice,
played back verbatim forever).

Both are drastically under-used, because patients are told too late and the process is miserable:
hundreds to thousands of scripted sentences read alone at a computer, often *after* speech has
already started to slur — which degrades the synthetic voice. Team Gleason and Project Revoice
exist precisely because the system fails to catch people in time.

## The reframe

The hackathon prompt says *"prior to your visit, you check in by talking to a voice agent."*
Everyone else builds an agent that listens to a patient in order to document them. Cadence flips
it: the agent's job is to **capture and preserve the patient's voice itself, at the one moment it
still exists.**

Check-in becomes the most important recording session of their life.

And because a voice bank is only half the journey, the same library powers the other half: when
speech is gone, a caregiver — or a night nurse, or an ER doctor — can search what this person
actually banked to work out what they're reaching for now.

> Before → preserve the voice. After → help others understand it.

---

## How the four sponsors fit

Each one is load-bearing. Remove any and a real part of the product stops working.

| | Role |
|---|---|
| **Deepgram** | The conversation. STT tracks what was actually said so phoneme coverage is measured, not assumed; TTS is the agent's own voice guiding the session. |
| **Moss** | Sub-10ms semantic retrieval over the personal phrase bank. This is the decode half's hot path — an AAC device is a live conversation aid, and cloud round-trips at 100–500ms don't fit inside a conversation. Uses Moss `session()` indexes: built in-process during capture, queried locally, pushed to cloud at session end. |
| **Medplum** | The banked voice as first-class clinical data — `CarePlan`, `Media`, `Communication`, `Observation`. This is what makes it survive the move to hospice instead of being a file on a laptop. |
| **Stedi** | Real 270/271 eligibility for the speech-generating device. Medicare and most payers *do* cover SGDs as DME, but only through a specific documentation path most families never learn about. |

### The voice-cloning question, answered honestly

High-fidelity personal voice cloning is not a 24-hour problem, and Deepgram's strength is the
live agent rather than custom cloning. So the emotional core of this demo is **message banking**:
real recorded audio, played back in the person's actual voice. Nothing to clone, nothing that can
sound "off." Synthetic-voice provisioning is a pluggable step on top of a corpus we genuinely
build and chart — the contribution is the capture pipeline, the record, and the covered path.

---

## Run it

```bash
npm install
cp .env.example .env.local   # fill in what you have
npm run dev                  # http://localhost:3000
```

**Every key is optional.** Anything missing degrades to a clearly-labelled stub rather than
crashing — the UI states which services are live on every screen, so nothing is quietly faked.

| Env var | Without it |
|---|---|
| `DEEPGRAM_API_KEY` | No STT/TTS; the prompted sentence is used as the transcript |
| `ANTHROPIC_API_KEY` | Prompt selection and decoding fall back to labelled stubs |
| `MEDPLUM_CLIENT_ID` / `MEDPLUM_CLIENT_SECRET` | FHIR resources are *projected* (real shapes, not persisted) |
| `MOSS_PROJECT_ID` / `MOSS_PROJECT_KEY` | Retrieval falls back to keyword overlap |
| `STEDI_API_KEY` | A sample 271 response is shown, labelled `demo` |

Get keys: [Medplum ClientApplication](https://app.medplum.com/ClientApplication) ·
[Moss](https://moss.dev) · [Stedi](https://stedi.com) · [Deepgram](https://deepgram.com)

---

## The two-minute demo

1. **`/bank`** — enter a name and diagnosis. Note the consent panel; judges will ask, so it leads.
2. The agent speaks its first prompt aloud (Deepgram TTS). Hit **Record**, read the sentence,
   **Stop & bank**.
3. Watch three things move at once: the transcript comes back from Deepgram, **phoneme coverage
   jumps**, and the pipeline panel confirms the FHIR write and the Moss index.
4. Bank two or three more. Around the third, the agent switches to a **personal message** prompt —
   *"tell your daughter what you'd want her to hear on her wedding day."* Record it.
5. **The turn:** open **`/decode`** in a second tab. Type a slurred approximation of that message
   — `tuh mai dordr wehdin`. Moss finds it in single-digit milliseconds, the interpretation
   appears with a calibrated confidence, and **her actual recorded voice plays back**.
6. **The loop:** decode something new — `wah-er coh`. The reading comes back at medium confidence.
   Confirm what it actually meant. Decode the same thing again: high confidence now, grounded in
   the confirmation, which is charted and indexed. *"It learns her, and it does it in the chart."*
7. **`/profile/[id]`** — the briefing a night nurse reads. Written from her own banked words, with
   the confirmed meanings as a glossary and the phrase book searchable underneath.
8. **The system win:** back on `/bank`, hit **Check device coverage**. Stedi returns the plan's DME
   benefit and the five-step SGD approval path. *"Her speech device is covered — here's the path."*
9. **`/chart/[id]`** — the whole thing as FHIR resources.

The arc is heart → system. Step 5 is the moment; step 6 is the one judges haven't seen before;
step 8 is the reason it's a product.

---

## Architecture

```
app/
  page.tsx              landing
  bank/                 guided capture session
  decode/               caregiver decoder — lookup, then confirm what it meant
  profile/[id]/         the living communication profile
  chart/[id]/           FHIR resource view
  api/
    session/            provision Patient + CarePlan
    prompt/             next banking prompt (adaptive, coverage-aware)
    speak/              Deepgram TTS — the agent's voice
    bank/               ★ the convergence: STT → FHIR → Moss index
    audio/[id]/         serve a banked recording back
    decode/retrieve/    Moss only — ~10ms, paints immediately
    decode/             the reading, grounded in those matches
    confirm/            ★ the learning loop: chart it, index it
    profile/            build the caregiver briefing from the library
    coverage/           Stedi 270/271 for the SGD
    chart/[id]/         read back from Medplum
lib/
  deepgram.ts  medplum.ts  moss.ts  stedi.ts
  claude.ts             the clinical reasoning layer
  phonetics.ts          grapheme→phoneme coverage, computed locally
  profile-sources.ts    rebuilds a profile out of FHIR
  client-session.ts     the browser's copy of a session — the durable one
  session-context.ts    resolves the session a request carries with it
  fhir-projection.ts    the resources as they'd be written, without Medplum
  store.ts              per-process cache for audio and local dev
```

### The three surfaces

**Bank** preserves the voice while there still is one. **Decode** is the live lookup: a listener
hears something they can't parse, Moss finds the nearest banked phrases, and the reading is
grounded in those. **Profile** is the part a stranger reads — a briefing written from this
person's own words for the night nurse who has two minutes before they have to try talking to
them.

The profile is *living*, which is the part that matters. When a caregiver decodes an utterance and
confirms what it actually meant, that pair is written to FHIR as a `Communication` and indexed in
Moss on the **heard** form. The next person who hears the same sound retrieves the confirmed
reading directly instead of starting from a guess.

Measured on one confirmation: `"wah-er coh"` decoded as *"a request for a cold drink of water"* at
medium confidence beforehand, and *"she wants her water colder — more ice, not a refill"* at high
confidence afterward, with the confirmed entry retrieved at score 1.000.

That loop is also the honest answer to a real problem: speech at month eighteen is not speech at
diagnosis, so a library frozen at diagnosis decays. This one keeps up.

### State, and why the API routes are stateless

Serverless instances do not persist between requests: the instance that provisions a CarePlan is
often not the one that handles the next recording. So the browser owns the session and sends it
with every call, and the server keeps nothing it can't rebuild.

That leaves three durable stores, each doing what it's actually good at. The tab holds the session
and the banked transcripts in `localStorage` — which is also how the decoder, opened in a second
tab, sees the library. Audio lives in Medplum as a `Binary` and is streamed back through
`/api/audio/<mediaId>`, so playback works on an instance that never saw the recording. The Moss
index is pushed to the cloud after every take, so retrieval survives the same jump.

`lib/store.ts` is still there, but only as a same-process cache — it is checked first because it's
instant, and never depended on.

### Two design decisions worth defending

**Phoneme coverage is computed in code, not by the model.** It's a deterministic
grapheme→phoneme approximation over ARPAbet classes, so the progress bar is instant, free, and
honest. It's an approximation and the code says so — but it's the *right kind*: the alternative is
asking an LLM to count phonemes, which is slower and less reliable at exactly the thing plain
arithmetic is good at.

**Retrieval and reasoning are split into two requests.** Moss answers in single-digit
milliseconds; the model takes ~8s. Running them as one call would hide the fastest number in the
system behind the slowest — so `/api/decode/retrieve` returns the banked matches immediately, the
UI paints them, and the reading fills in underneath. Same reason the banking screen updates
coverage and the pipeline panel before waiting on the next prompt.

**The decoder is calibrated toward "low confidence."** A confident wrong guess is worse than an
admitted uncertainty here — the listener will act on what it says, and getting it wrong means this
person is misunderstood *again*, by someone who was trying to help. The prompt says so explicitly,
and the UI surfaces which banked phrases grounded each reading so a human can check the work.

---

## Known limits

- **Session state is client-owned.** It survives serverless and is shared across tabs, but not
  across browsers or devices. A production deployment would rehydrate a session from Medplum on
  sign-in rather than from `localStorage`.
- **Synthetic voice provisioning is a stub.** We build and chart the corpus; wiring a cloning
  provider is a pluggable step, and message playback carries the demo without it.
- **A banked voice is impersonation-grade material.** Access control, revocation, and consent are
  modelled in the FHIR layer and surfaced at intake — but a production deployment needs a real
  threat model here, not a checkbox.
