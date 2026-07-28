import { NextResponse } from 'next/server';
import { getBindings } from '@/lib/cloudflare';
import { evidenceKey, extractEvidence, sha256Hex } from '@/lib/receipt';

const TELEGRAM = 'https://api.telegram.org';
const MAX_BYTES = 20 * 1024 * 1024;

async function send(token, chatId, text) {
  return fetch(`${TELEGRAM}/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function digest(value) {
  return sha256Hex(new TextEncoder().encode(String(value || '')).buffer);
}

async function authorized(env, message, text, token) {
  const chatId = String(message.chat?.id || '');
  const paired = await env.PAIRING_KV.get('paired_sender', 'json');
  if (paired && (paired.chatId === chatId || paired.userId === String(message.from?.id || ''))) return true;
  if (!text.startsWith('/start ')) return false;
  const supplied = text.slice(7).trim();
  if (!process.env.TELEGRAM_SETUP_CODE || await digest(supplied) !== await digest(process.env.TELEGRAM_SETUP_CODE)) return false;
  await env.PAIRING_KV.put('paired_sender', JSON.stringify({
    chatId, userId: String(message.from?.id || ''), pairedAt: new Date().toISOString(),
  }));
  await send(token, chatId, 'Paired. Send a receipt photo, invoice, boarding pass, or PDF.');
  return 'paired';
}

function attachment(message) {
  if (message.photo?.length) {
    const photo = message.photo.at(-1);
    return { fileId: photo.file_id, size: photo.file_size, mimeType: 'image/jpeg', filename: `photo-${message.message_id}.jpg` };
  }
  const file = message.document;
  if (file && (file.mime_type?.startsWith('image/') || file.mime_type === 'application/pdf')) {
    return { fileId: file.file_id, size: file.file_size, mimeType: file.mime_type, filename: file.file_name || `document-${message.message_id}` };
  }
  return null;
}

async function download(token, item) {
  const metadata = await fetch(`${TELEGRAM}/bot${token}/getFile?file_id=${encodeURIComponent(item.fileId)}`).then((response) => response.json());
  if (!metadata.ok) throw new Error('Telegram file lookup failed');
  const response = await fetch(`${TELEGRAM}/file/bot${token}/${metadata.result.file_path}`);
  if (!response.ok) throw new Error('Telegram file download failed');
  return response.arrayBuffer();
}

async function processDocument(env, token, chatId, id, item) {
  try {
    const bytes = await download(token, item);
    if (bytes.byteLength > MAX_BYTES) throw new Error('File exceeds 20 MB');
    const claim = await extractEvidence(env.AI, bytes, item.mimeType, item.filename);
    const key = evidenceKey(id, claim, item.filename);
    const sha256 = await sha256Hex(bytes);
    await env.EVIDENCE_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: item.mimeType, cacheControl: 'private, no-store' },
      customMetadata: { documentId: id, sha256, source: 'telegram' },
    });
    await env.DB.prepare(`UPDATE documents SET
      status = 'needs_review', file_key = ?, mime_type = ?, file_size = ?, sha256 = ?,
      type = ?, vendor = ?, amount = ?, currency = ?, receipt_date = ?, category = ?,
      confidence = ?, booking_reference = ?, raw_text = ?, claim_json = ?, error = NULL
      WHERE id = ?`).bind(
      key, item.mimeType, bytes.byteLength, sha256, claim.documentType, claim.vendor,
      claim.total, claim.currency, claim.date, claim.claimCategory, claim.confidence,
      claim.bookingReference, claim.rawText, JSON.stringify(claim), id,
    ).run();
    await send(token, chatId, `Evidence stored privately. ${claim.vendor || 'Unknown issuer'} · ${claim.currency || ''} ${claim.total ?? 'amount needs review'} · ${Math.round(claim.confidence * 100)}% confidence. Review it in the web inbox.`);
  } catch (error) {
    await env.DB.prepare("UPDATE documents SET status = 'needs_review', error = ? WHERE id = ?").bind(error.message, id).run();
    await send(token, chatId, `Saved for manual review: ${error.message}`);
  }
}

export async function POST(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !webhookSecret) return NextResponse.json({ error: 'Telegram not configured' }, { status: 503 });
  if (await digest(request.headers.get('X-Telegram-Bot-Api-Secret-Token')) !== await digest(webhookSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { env, ctx } = await getBindings();
  if (!env?.DB || !env?.EVIDENCE_BUCKET || !env?.PAIRING_KV || !env?.AI) {
    return NextResponse.json({ error: 'Cloudflare bindings incomplete' }, { status: 503 });
  }
  const update = await request.json();
  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });
  const text = String(message.text || '').trim();
  const access = await authorized(env, message, text, token);
  if (access === 'paired') return NextResponse.json({ ok: true });
  if (!access) {
    await send(token, message.chat?.id, 'This bot is private. Pair it with the setup code first.');
    return NextResponse.json({ ok: true });
  }

  const item = attachment(message);
  if (!item) {
    await send(token, message.chat?.id, 'Send a photo, image, or PDF up to 20 MB.');
    return NextResponse.json({ ok: true });
  }
  if (item.size > MAX_BYTES) {
    await send(token, message.chat?.id, 'That file is over 20 MB.');
    return NextResponse.json({ ok: true });
  }

  const id = `tg_${update.update_id}`;
  const createdAt = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO documents
    (id, source, status, type, telegram_file_id, created_at)
    VALUES (?, 'telegram', 'processing', 'other', ?, ?)`).bind(id, item.fileId, createdAt).run();
  if (!result.meta.changes) return NextResponse.json({ ok: true, duplicate: true });

  await send(token, message.chat?.id, 'Received. Private storage and OCR are running.');
  const task = processDocument(env, token, message.chat?.id, id, item);
  if (ctx?.waitUntil) ctx.waitUntil(task); else await task;
  return NextResponse.json({ ok: true });
}
