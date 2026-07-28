import { NextResponse } from 'next/server';
import { deleteProfile, getProfile, updateProfile, ValidationError } from '@/lib/referenceProfile';

export async function GET(_request, { params }) {
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  try {
    const profile = await updateProfile(id, body);
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(profile);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: 'Invalid profile', details: err.errors }, { status: 400 });
    }
    console.error('[reference-profiles PATCH]', err);
    return NextResponse.json({ error: 'Profile update failed' }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  try {
    const ok = await deleteProfile(id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reference-profiles DELETE]', err);
    return NextResponse.json({ error: 'Profile delete failed' }, { status: 500 });
  }
}
