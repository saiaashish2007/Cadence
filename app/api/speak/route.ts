import { NextRequest, NextResponse } from 'next/server';
import { speak } from '@/lib/deepgram';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });

  try {
    const audio = await speak(text);
    if (!audio) return NextResponse.json({ error: 'deepgram not configured' }, { status: 503 });

    return new NextResponse(audio, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[deepgram] tts failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
