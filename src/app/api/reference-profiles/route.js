import { NextResponse } from 'next/server';
import { createProfile, listProfiles, ValidationError } from '@/lib/referenceProfile';

export async function GET() {
  return NextResponse.json(await listProfiles(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  try {
    const profile = await createProfile(body);
    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: 'Invalid profile', details: err.errors }, { status: 400 });
    }
    console.error('[reference-profiles POST]', err);
    return NextResponse.json({ error: 'Profile create failed' }, { status: 500 });
  }
}
