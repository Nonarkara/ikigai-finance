import { NextResponse } from 'next/server';
import {
  FinanceConflictError,
  FinanceLockedError,
  FinanceValidationError,
  updateFinanceSnapshot,
} from '@/lib/finance/snapshot';
import { verifySheetsSecret } from '@/lib/finance/sheetsBridge';

export async function POST(request) {
  const auth = await verifySheetsSecret(request);
  if (!auth.ok) {
    return NextResponse.json(
      { status: 'error', error: auth.error },
      { status: auth.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 100_000) {
    return NextResponse.json({ status: 'error', error: 'Payload exceeds 100 KB.' }, { status: 413 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Body must be valid JSON.' }, { status: 400 });
  }
  if (body.action !== 'push_snapshot' || !body.payload || typeof body.payload !== 'object') {
    return NextResponse.json(
      { status: 'error', error: 'action=push_snapshot and payload are required.' },
      { status: 400 },
    );
  }

  try {
    const snapshot = await updateFinanceSnapshot(body.payload, {
      source: 'google_sheets',
      expectedRevision: body.baseRevision ?? null,
    });
    return NextResponse.json({
      status: 'ok',
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      decision: snapshot.evaluation.decision,
      dataQuality: snapshot.evaluation.dataQuality,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof FinanceLockedError) {
      return NextResponse.json({ status: 'locked', error: error.message }, { status: 423 });
    }
    if (error instanceof FinanceConflictError) {
      return NextResponse.json({ status: 'conflict', error: error.message }, { status: 409 });
    }
    if (error instanceof FinanceValidationError) {
      return NextResponse.json(
        { status: 'invalid', error: error.message, evaluation: error.evaluation },
        { status: 422 },
      );
    }
    console.error('[sheets] inbound sync failed', error);
    return NextResponse.json({ status: 'error', error: 'Google Sheets sync failed.' }, { status: 500 });
  }
}
