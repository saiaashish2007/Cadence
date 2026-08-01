import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Used only for the italic emphasis in headings — the one warm note in an
// otherwise neutral system.
const serif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["italic", "normal"],
});

export const metadata: Metadata = {
  title: "Cadence — preserve your voice before you lose it",
  description:
    "Guided voice and message banking at the moment of diagnosis, charted to FHIR, with a covered path to a speech device — and a decoder for after speech is gone.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-neutral-900">{children}</body>
    </html>
  );
}
