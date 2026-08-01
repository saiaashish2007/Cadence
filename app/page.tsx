import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember">Cadence</p>

      <h1 className="mt-6 font-display text-5xl leading-[1.05] sm:text-6xl">
        Say &ldquo;I love you&rdquo; in your own voice,
        <br />
        <span className="text-ember">even after you can&rsquo;t speak.</span>
      </h1>

      <p className="mt-7 max-w-2xl text-lg leading-relaxed text-bone-dim">
        When someone is diagnosed with ALS, or scheduled for a laryngectomy, there is a window: they
        still have their voice today, and they will lose it. Voice banking exists to catch that
        window — but people are told too late, and the process is 1,600 scripted sentences read
        alone at a computer. Most never finish.
      </p>

      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-bone-dim">
        Cadence makes it a twenty-minute conversation instead, puts the result in the medical record
        where the care team can find it, and answers the question every family asks next:{' '}
        <span className="text-bone">will insurance cover the device?</span>
      </p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <Link
          href="/bank"
          className="group rounded-xl border border-ember/40 bg-ember/5 p-6 transition-colors hover:border-ember"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ember">Before</p>
          <h2 className="mt-3 font-display text-2xl">Bank a voice</h2>
          <p className="mt-2 text-sm leading-relaxed text-bone-dim">
            A guided capture session at diagnosis. Preserve the voice and the messages, chart both
            to FHIR, and get a covered path to a speech device.
          </p>
          <p className="mt-4 font-mono text-xs text-ember opacity-0 transition-opacity group-hover:opacity-100">
            Start session →
          </p>
        </Link>

        <Link
          href="/decode"
          className="group rounded-xl border border-white/10 bg-ink-2 p-6 transition-colors hover:border-white/30"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-sky">After</p>
          <h2 className="mt-3 font-display text-2xl">Understand a voice</h2>
          <p className="mt-2 text-sm leading-relaxed text-bone-dim">
            For the family member, the night nurse, the ER doctor. Search what they actually banked
            to work out what they&rsquo;re reaching for now.
          </p>
          <p className="mt-4 font-mono text-xs text-sky opacity-0 transition-opacity group-hover:opacity-100">
            Open decoder →
          </p>
        </Link>
      </div>

      <p className="mt-12 max-w-2xl border-l-2 border-white/10 pl-4 text-sm leading-relaxed text-bone-dim">
        Two halves of one journey. The banking half preserves the voice before it goes; the decoding
        half uses that same library to help the people around them understand what&rsquo;s left.
        The people who understand them most shouldn&rsquo;t be the only ones who can.
      </p>

      <footer className="mt-12 font-mono text-[11px] uppercase tracking-[0.16em] text-bone-dim">
        Deepgram · Moss · Medplum · Stedi — Agentic Healthcare Hackathon, Y Combinator
      </footer>
    </main>
  );
}
