import { getBindings } from '@/lib/cloudflare';
import { getEvidence } from '@/lib/evidence';

export async function GET(_request, { params }) {
  const { id } = await params;
  const document = await getEvidence(id);
  if (!document?.file_key) return new Response('No original file', { status: 404 });
  const { env } = await getBindings();
  const object = await env?.EVIDENCE_BUCKET?.get(document.file_key);
  if (!object) return new Response('File not found', { status: 404 });
  const headers = new Headers({
    'Content-Type': document.mime_type || 'application/octet-stream',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return new Response(object.body, { headers });
}
