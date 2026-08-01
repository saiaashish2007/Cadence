# Local Setup

```bash
npm install
cp .env.example .env.local   # fill in whichever keys you have
npm run dev                  # http://localhost:3000
```

Sign in with `user123` / `medplum`.

## Environment variables

**Every integration key is optional.** Anything missing degrades to a clearly-labelled stub rather than crashing, and the UI states which services are live on every screen — nothing is quietly faked.

| Variable | Without it |
|---|---|
| `DEEPGRAM_API_KEY` | No STT or TTS; the prompted sentence is used as the transcript |
| `MOSS_PROJECT_ID` / `MOSS_PROJECT_KEY` | Retrieval falls back to keyword overlap |
| `MEDPLUM_CLIENT_ID` / `MEDPLUM_CLIENT_SECRET` | FHIR resources are *projected* — real shapes, not persisted |
| `ANTHROPIC_API_KEY` | Answer shortlisting and decoding fall back to labelled stubs |
| `STEDI_API_KEY` | A sample 271 response is shown, tagged `demo` |

Get keys: [Medplum ClientApplication](https://app.medplum.com/ClientApplication) · [Moss](https://moss.dev) · [Deepgram](https://deepgram.com) · [Anthropic](https://console.anthropic.com) · [Stedi](https://stedi.com)

## Authentication

The landing page is public. Every other page, and every API route behind it, requires a session cookie — gating only the pages would leave the data endpoints reachable by anyone who knew the paths. The gate is `proxy.ts` (Next.js 16 renamed the `middleware` file convention to `proxy`).

| Variable | Default | Purpose |
|---|---|---|
| `CADENCE_DEMO_USER` | `user123` | Login username |
| `CADENCE_DEMO_PASSWORD` | `medplum` | Login password |
| `CADENCE_AUTH_SECRET` | dev fallback | HMAC key for signing the session cookie |

**Set `CADENCE_AUTH_SECRET` in production.** The fallback is committed to this repo, so without an override anyone could read it and mint their own session cookie.

## Deploying to Vercel

```bash
vercel --prod
```

Two things the build needs, both already committed:

- `vercel.json` pins `framework: nextjs` and `installCommand: npm install --include=optional`.
- `next.config.ts` lists `@moss-dev/moss-core-linux-x64-gnu` in `serverExternalPackages`, and `lib/moss.ts` imports the client dynamically inside the request path. Without this, Moss's native binding goes missing on Vercel because of a known npm optional-dependency bug.

If judges need public access, make sure **Deployment Protection** is disabled in the Vercel project settings — otherwise the deployment answers with a redirect to Vercel's SSO login.

## Architecture

```
app/
  page.tsx              landing (public)
  login/                sign-in
  bank/                 guided capture session
  talk/                 speak-for-me — phrase board and question matching
  decode/               caregiver decoder — lookup, then confirm what it meant
  profile/[id]/         the living communication profile
  chart/[id]/           FHIR resource view
  api/
    auth/               login and logout — the only ungated API
    session/            provision Patient + CarePlan + Condition
    prompt/             next banking prompt — deterministic, no model call
    speak/              Deepgram TTS — the agent's voice during capture
    bank/               the convergence: STT -> FHIR -> Moss index
    audio/[id]/         serve a banked recording back from Medplum
    library/            someone's banked phrases, no model call in the path
    answer/             a question in, a shortlist of their own replies out
    decode/retrieve/    Moss only — single-digit ms, paints immediately
    decode/             the reading, grounded in those matches
    confirm/            the learning loop: chart it, index it
    profile/            build the caregiver briefing from the library
    coverage/           Stedi 270/271 for the speech-generating device
    chart/[id]/         read back from Medplum
lib/
  deepgram.ts  medplum.ts  moss.ts  stedi.ts
  auth.ts               credential check and cookie signing
  claude.ts             shortlisting, decoding, profiles
  essentials.ts         the thirty phrases, and the questions each one answers
  phonetics.ts          grapheme->phoneme coverage, computed locally
  profile-sources.ts    rebuilds a profile out of FHIR
  client-session.ts     the browser's copy of a session — the durable one
  session-context.ts    resolves the session a request carries with it
  fhir-projection.ts    the resources as they'd be written, without Medplum
  store.ts              per-process cache for audio and local dev
proxy.ts                the auth gate
```

## Why the API routes are stateless

Serverless instances do not persist between requests: the instance that provisions a `CarePlan` is usually not the one that handles the next recording. So the browser owns the session and sends it with every call, and the server keeps nothing it can't rebuild.

That leaves three durable stores, each doing what it's actually good at:

- **The tab** holds the session and banked transcripts in `localStorage`, which is also how the decoder — opened in a second tab — sees the library. It autosaves on a debounce and flushes on `pagehide`, because iOS can kill a backgrounded tab without ever firing `unload`.
- **Medplum** holds the audio as a `Binary`, streamed back through `/api/audio/<mediaId>`, so playback works on an instance that never saw the recording.
- **Moss** receives a `pushIndex()` after every take, so retrieval survives the same jump.

`lib/store.ts` still exists, but only as a same-process cache — checked first because it's instant, never depended on.

## Known limits

- **Cross-device recovery needs a recovery code.** A Medplum-backed session can be restored on another device by pasting its patient ID. We deliberately removed the endpoint that listed all sessions, since that let anyone enumerate patient records.
- **Synthetic voice provisioning is not implemented.** The corpus reaches full phoneme coverage so it remains a pluggable step; real recordings carry the product without it.
- **One shared demo credential.** Production needs per-user accounts, auditable role-based access, and consent modelled as a first-class resource rather than a checkbox.
