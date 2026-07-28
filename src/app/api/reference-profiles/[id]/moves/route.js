import { NextResponse } from 'next/server';
import { appendMove, ValidationError } from '@/lib/referenceProfile';

export async function POST(request, { params }) {
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  if (!body || !body.oneLiner || typeof body.oneLiner !== 'string') {
    return NextResponse.json({ error: 'oneLiner is required' }, { status: 400 });
  }
  try {
    const profile = await appendMove(id, {
      date: body.date || new Date().toISOString().slice(0, 10),
      oneLiner: body.oneLiner,
      sourceUrl: body.sourceUrl || null,
    });
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(profile);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: 'Invalid move', details: err.errors }, { status: 400 });
    }
    console.error('[reference-profiles moves POST]', err);
    return NextResponse.json({ error: 'Move append failed' }, { status: 500 });
  }
}
