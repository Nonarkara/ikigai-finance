import { NextResponse } from 'next/server';
import {
  evaluateSnapshot,
  FinanceConflictError,
  FinanceLockedError,
  FinanceValidationError,
  getFinanceSnapshot,
  setFinanceLock,
  updateFinanceSnapshot,
} from '@/lib/finance/snapshot';
import { pushSnapshotToGoogleSheets } from '@/lib/finance/sheetsBridge';

function responseBody(snapshot, evaluation = evaluateSnapshot(snapshot), sheetSync = null) {
  return { snapshot, evaluation, sheetSync };
}

export async function GET() {
  const snapshot = await getFinanceSnapshot();
  return NextResponse.json(responseBody(snapshot), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function PATCH(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 100_000) {
    return NextResponse.json({ error: 'Payload exceeds 100 KB.' }, { status: 413 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 });
  }

  try {
    if (body.action === 'set_lock') {
      const snapshot = await setFinanceLock(Boolean(body.locked), body.expectedRevision);
      const sheetSync = await pushSnapshotToGoogleSheets(snapshot);
      return NextResponse.json(responseBody(snapshot, evaluateSnapshot(snapshot), sheetSync), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    if (!body.payload || typeof body.payload !== 'object') {
      return NextResponse.json({ error: 'payload is required.' }, { status: 400 });
    }
    const snapshot = await updateFinanceSnapshot(body.payload, {
      source: 'dashboard',
      expectedRevision: body.expectedRevision,
    });
    const sheetSync = await pushSnapshotToGoogleSheets(snapshot);
    return NextResponse.json(responseBody(snapshot, snapshot.evaluation, sheetSync), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof FinanceLockedError) {
      return NextResponse.json({ error: error.message }, { status: 423 });
    }
    if (error instanceof FinanceConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof FinanceValidationError) {
      return NextResponse.json(
        { error: error.message, evaluation: error.evaluation },
        { status: 422 },
      );
    }
    console.error('[finance] update failed', error);
    return NextResponse.json({ error: 'Financial model update failed.' }, { status: 500 });
  }
}
