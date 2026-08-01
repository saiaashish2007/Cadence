import Link from 'next/link';
import { Label, SiteFooter, SiteHeader, StatusDot } from '@/components/ui';

const STATS = [
  { value: '4ms', label: 'Retrieval' },
  { value: '92%', label: 'Coverage target' },
  { value: '20min', label: 'Session length' },
  { value: '4', label: 'FHIR resources' },
];

const SPONSORS = [
  { name: 'Deepgram', note: 'nova-3 STT · aura-2 TTS' },
  { name: 'Moss', note: 'sub-10ms retrieval' },
  { name: 'Medplum', note: 'FHIR system of record' },
  { name: 'Stedi', note: '270/271 eligibility' },
];

const MARQUEE = [
  'ALS clinics',
  'Head & neck oncology',
  'Speech-language pathology',
  'AAC vendors',
  'Palliative care',
  'Medicare DME',
  'Hospice teams',
  'Assistive technology',
];

const FEATURES = [
  {
    label: 'Guided capture',
    title: 'Twenty minutes, not 1,600 sentences.',
    body: 'The agent speaks each prompt aloud and chooses the next one from what the corpus is still missing — interleaving phonetic sentences with the personal messages that are actually the point. It stops when it has enough.',
    panel: (
      <div className="space-y-3">
        <Label>Prompt · message</Label>
        <p className="text-[17px] leading-relaxed text-neutral-900">
          &ldquo;Tell your daughter what you&rsquo;d want her to hear on her wedding day.&rdquo;
        </p>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <Label>Phoneme coverage</Label>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight">78</span>
            <span className="text-sm text-neutral-500">%</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-neutral-200">
            <div className="h-1.5 w-[78%] rounded-full bg-teal-600" />
          </div>
        </div>
      </div>
    ),
  },
  {
    label: 'The decoder',
    title: 'For the people who have to understand them later.',
    body: 'Speech goes. The library stays. A caregiver types what they heard, Moss finds the closest phrases this person actually banked, and the reading is grounded in those — calibrated toward low confidence, because a confident wrong guess means being misunderstood again.',
    panel: (
      <div className="space-y-3">
        <Label>Heard</Label>
        <p className="font-mono text-sm text-neutral-500">&ldquo;tuh mai dordr wehdin&rdquo;</p>
        <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3">
          <Label className="text-teal-700">Matched · 4ms</Label>
          <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-900">
            &ldquo;Tell my daughter I&rsquo;m proud of her on her wedding day.&rdquo;
          </p>
          <p className="mt-2 font-mono text-[11px] text-neutral-500">
            score 0.81 · plays back in her own voice
          </p>
        </div>
      </div>
    ),
  },
  {
    label: 'Living profile',
    title: 'The two minutes a night nurse actually has.',
    body: 'Every person gets a profile written from their own banked words: how they phrase things, who they mention, what to say back. When a caregiver decodes an utterance and confirms what it meant, that pair is charted and indexed — so the profile tracks speech as it changes instead of freezing at diagnosis.',
    panel: (
      <div className="space-y-3">
        <Label>Confirmed meanings</Label>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="font-mono text-[11px] text-neutral-500">heard &ldquo;wah-er coh&rdquo;</p>
          <p className="mt-1 text-[15px]">She wants the water colder, not more of it.</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="font-mono text-[11px] text-neutral-500">heard &ldquo;mai-uh&rdquo;</p>
          <p className="mt-1 text-[15px]">Maya — her daughter. She never says &ldquo;my daughter&rdquo;.</p>
        </div>
        <p className="text-xs leading-relaxed text-neutral-500">
          Each confirmation is a FHIR Communication and a new entry in the retrieval index.
        </p>
      </div>
    ),
  },
  {
    label: 'Clinical record',
    title: 'A banked voice that survives the move to hospice.',
    body: 'Every recording is written to Medplum as Media, every message as Communication, with a CarePlan for the preservation plan and an Observation for the speech baseline. Not a folder on a laptop — a record the next care team can find.',
    panel: (
      <ul className="divide-y divide-neutral-100">
        {[
          ['CarePlan', 'communication preservation'],
          ['Media', 'audio attachment per take'],
          ['Communication', 'the message, recipient, occasion'],
          ['Observation', 'speech baseline at diagnosis'],
        ].map(([resource, note]) => (
          <li key={resource} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="font-mono text-[13px] text-neutral-900">{resource}</span>
            <span className="text-right text-xs text-neutral-500">{note}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    label: 'Coverage',
    title: 'Answering the question every family asks next.',
    body: 'Medicare and most payers do cover speech-generating devices as durable medical equipment — through a documentation path most people never learn about until the window has closed. Cadence runs the eligibility check and hands back the approval checklist.',
    panel: (
      <ol className="space-y-2.5">
        {[
          'SLP evaluation documenting severe expressive disorder',
          'Physician order tied to the diagnosis',
          'Lower-cost alternatives shown insufficient',
          'Device trial report from the supplier',
          'Prior authorization under DME (HCPCS E2510)',
        ].map((step, i) => (
          <li key={step} className="flex gap-3 text-sm leading-relaxed text-neutral-600">
            <span className="font-mono text-xs text-teal-600">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    ),
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* ------------------------------------------------------- hero */}
        <section className="border-b border-neutral-200/80 bg-gradient-to-b from-neutral-50 to-transparent">
          <div className="mx-auto max-w-6xl px-6 pb-16 pt-16 md:pb-24 md:pt-24">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50/50 px-3 py-1">
                  <StatusDot live />
                  <Label className="text-teal-700">Voice preservation at diagnosis</Label>
                </span>

                <h1 className="mt-6 text-4xl leading-[1.08] tracking-tight md:text-6xl">
                  Say &ldquo;I love you&rdquo; in your own voice,{' '}
                  <em className="font-serif italic text-teal-700">even after you can&rsquo;t speak.</em>
                </h1>

                <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-600 md:text-lg">
                  When someone is diagnosed with ALS, or scheduled for a laryngectomy, there is a
                  window: they still have their voice today, and they will lose it. Cadence turns
                  voice banking into a twenty-minute conversation, charts it to FHIR, and finds the
                  covered path to a speech device.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/bank"
                    className="rounded-md bg-neutral-900 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                  >
                    Bank a voice
                  </Link>
                  <Link
                    href="/decode"
                    className="rounded-md border border-neutral-200 bg-white px-7 py-3.5 text-sm font-medium transition-colors hover:bg-neutral-100"
                  >
                    Open the decoder
                  </Link>
                </div>
              </div>

              {/* console mock */}
              <div className="rounded-2xl border border-neutral-200/80 bg-white shadow-xl shadow-neutral-200/40">
                <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
                  <Label>Session · Ellen Rourke</Label>
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot live />
                    <span className="font-mono text-[11px] text-emerald-600">live</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 divide-x divide-y divide-neutral-100 sm:grid-cols-4 sm:divide-y-0">
                  {STATS.map((s) => (
                    <div key={s.label} className="px-5 py-5">
                      <p className="text-2xl font-semibold tracking-tight">{s.value}</p>
                      <p className="mt-1 text-xs text-neutral-500">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-neutral-100 px-5 py-5">
                  <div className="flex items-baseline justify-between">
                    <Label>Phoneme coverage</Label>
                    <span className="font-mono text-[11px] text-neutral-500">
                      6 banked · 2 messages
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-neutral-100">
                    <div className="h-2 w-[86%] rounded-full bg-teal-600" />
                  </div>
                  <p className="mt-3 text-xs text-neutral-500">
                    86% — enough to stop early instead of running the full script.
                  </p>
                </div>

                <div className="border-t border-neutral-100 px-5 py-4">
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {SPONSORS.map((s) => (
                      <li key={s.name} className="flex items-center gap-2">
                        <StatusDot live />
                        <span className="font-mono text-[11px] text-neutral-900">{s.name}</span>
                        <span className="truncate text-[11px] text-neutral-500">{s.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- marquee */}
        <div className="relative overflow-hidden border-b border-neutral-200/80 py-5">
          <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
            {[...MARQUEE, ...MARQUEE].map((item, i) => (
              <span key={`${item}-${i}`} className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">
                {item}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-transparent" />
        </div>

        {/* -------------------------------------------------- features */}
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <Label>Platform</Label>
          <h2 className="mt-4 max-w-3xl text-3xl leading-tight tracking-tight md:text-4xl">
            One library, three jobs.{' '}
            <em className="font-serif italic text-neutral-500">
              Preserve the voice, then help everyone else understand it.
            </em>
          </h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-neutral-600">
            The phrases someone banks at diagnosis are the same phrases that, years later, let a
            stranger work out what they&rsquo;re asking for. The people who understand them most
            shouldn&rsquo;t be the only ones who can.
          </p>

          <div className="mt-14 space-y-24 md:mt-20 md:space-y-32">
            {FEATURES.map((feature, i) => (
              <div
                key={feature.title}
                className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
                  i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
                }`}
              >
                <div>
                  <Label className="text-teal-700">{feature.label}</Label>
                  <h3 className="mt-3 text-2xl leading-tight tracking-tight md:text-3xl">
                    {feature.title}
                  </h3>
                  <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-neutral-600">
                    {feature.body}
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xl shadow-neutral-200/40">
                  {feature.panel}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------- consent */}
        <section className="border-y border-neutral-200/80 bg-neutral-50">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
            <Label>Consent</Label>
            <h2 className="mt-4 max-w-2xl text-3xl leading-tight tracking-tight md:text-4xl">
              A banked voice is impersonation-grade material.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-neutral-600">
              Consent leads the intake rather than sitting in a footnote. Recordings are stored
              against the patient&rsquo;s own record, retrievable by them and their care team, and a
              synthetic voice built from them can be revoked.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                ['Access controlled', 'Stored as FHIR resources against the patient, not a shared drive.'],
                ['Revocable', 'A voice built from the corpus can be withdrawn without losing the record.'],
                ['Stated plainly', 'Every screen says which services are live and which are stubbed.'],
              ].map(([title, note]) => (
                <div key={title} className="rounded-2xl border border-neutral-200/80 bg-white p-5">
                  <p className="text-[15px] font-medium">{title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- cta */}
        <section className="mx-auto max-w-6xl px-6 py-20 text-center md:py-28">
          <h2 className="mx-auto max-w-2xl text-3xl leading-tight tracking-tight md:text-4xl">
            The window is open today.{' '}
            <em className="font-serif italic text-teal-700">Start the session.</em>
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/bank"
              className="rounded-md bg-neutral-900 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              Bank a voice
            </Link>
            <Link
              href="/decode"
              className="rounded-md border border-neutral-200 bg-white px-7 py-3.5 text-sm font-medium transition-colors hover:bg-neutral-100"
            >
              Open the decoder
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
