/**
 * The profile's evidence, without waiting on the model.
 *
 * The phrase book, the confirmed-meaning glossary and the person's name are all
 * just reads — there is no reason a caregiver should stare at a spinner for
 * them while Claude writes the briefing. This route returns them immediately;
 * /api/profile writes the narrative alongside it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveProfileSources } from '@/lib/profile-sources';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const sources = await resolveProfileSources(body);

  if (!sources.phrases.length) {
    return NextResponse.json({ error: 'nothing banked for this person yet' }, { status: 404 });
  }

  return NextResponse.json(sources);
}
