import { NextResponse } from 'next/server';
import { getWorkspace, updateWorkspace } from '@/lib/workspace';

export async function GET() {
  return NextResponse.json(await getWorkspace(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
  }
  const workspace = await updateWorkspace(body);
  return NextResponse.json(workspace);
}
