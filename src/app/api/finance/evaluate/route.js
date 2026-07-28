import { NextResponse } from 'next/server';
import { evaluateBalanceSheetPayload } from '@/lib/finance/diagnostic';

export async function POST(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 100_000) {
    return NextResponse.json({ error: 'Payload exceeds 100 KB.' }, { status: 413 });
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 });
    }
    const evaluation = evaluateBalanceSheetPayload(body);
    return NextResponse.json(
      { success: evaluation.dataQuality.errors.length === 0, evaluation },
      {
        status: evaluation.dataQuality.errors.length > 0 ? 422 : 200,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof SyntaxError ? 'Body must be valid JSON.' : 'Evaluation failed.' },
      { status: 400 },
    );
  }
}
