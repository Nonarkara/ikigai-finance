import { NextResponse } from 'next/server';
import { listEvidence, reviewEvidence } from '@/lib/evidence';

export async function GET() {
  return NextResponse.json(await listEvidence(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request) {
  const { id, status } = await request.json();
  if (!id || !['approved', 'rejected', 'needs_review'].includes(status)) {
    return NextResponse.json({ error: 'Valid id and status required' }, { status: 400 });
  }
  return NextResponse.json(await reviewEvidence(id, status));
}
