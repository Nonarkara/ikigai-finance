const EXTRACTION_PROMPT = `Extract this receipt or claim evidence. Return one JSON object only with: rawText, documentType, vendor, date (YYYY-MM-DD or null), currency (ISO code), subtotal, tax, total, invoiceNumber, bookingReference, passengerName, flightNumber, routeFrom, routeTo, claimCategory, lineItems, confidence, warnings. Do not invent missing values.`;

export function extractJson(text) {
  const source = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(source.slice(start, end + 1)); } catch { return null; }
}

export function normalizeClaim(value = {}) {
  const number = (input) => Number.isFinite(Number(input)) ? Number(input) : null;
  const confidence = number(value.confidence);
  return {
    rawText: String(value.rawText || ''),
    documentType: String(value.documentType || 'other'),
    vendor: value.vendor ? String(value.vendor) : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || '')) ? String(value.date) : null,
    currency: value.currency ? String(value.currency).toUpperCase().slice(0, 3) : null,
    subtotal: number(value.subtotal), tax: number(value.tax), total: number(value.total),
    invoiceNumber: value.invoiceNumber ? String(value.invoiceNumber) : null,
    bookingReference: value.bookingReference ? String(value.bookingReference) : null,
    passengerName: value.passengerName ? String(value.passengerName) : null,
    flightNumber: value.flightNumber ? String(value.flightNumber) : null,
    routeFrom: value.routeFrom ? String(value.routeFrom) : null,
    routeTo: value.routeTo ? String(value.routeTo) : null,
    claimCategory: String(value.claimCategory || 'other'),
    lineItems: Array.isArray(value.lineItems) ? value.lineItems.slice(0, 100) : [],
    confidence: confidence == null ? 0 : Math.min(1, Math.max(0, confidence)),
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String).slice(0, 20) : [],
  };
}

export async function extractEvidence(ai, bytes, mimeType, filename) {
  if (mimeType === 'application/pdf') {
    const markdown = await ai.toMarkdown({
      name: filename || 'evidence.pdf',
      blob: new Blob([bytes], { type: mimeType }),
    });
    if (markdown?.format === 'error' || !markdown?.data) {
      throw new Error(markdown?.error || 'PDF extraction failed');
    }
    return normalizeClaim({ rawText: markdown.data, documentType: 'claim_evidence', confidence: 0.65 });
  }

  const base64 = Buffer.from(bytes).toString('base64');
  const result = await ai.run('@cf/moondream/moondream3.1-9B-A2B', {
    task: 'query',
    image: `data:${mimeType};base64,${base64}`,
    question: EXTRACTION_PROMPT,
    reasoning: false,
    temperature: 0,
    max_tokens: 4096,
  });
  const parsed = extractJson(result?.answer || result?.response);
  if (!parsed) throw new Error('OCR returned invalid structured data');
  return normalizeClaim(parsed);
}

function safe(value, fallback) {
  return String(value || '').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || fallback;
}

export function evidenceKey(id, claim, filename) {
  const date = claim.date || new Date().toISOString().slice(0, 10);
  const extension = String(filename || '').match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() || 'bin';
  return `default/evidence/${date.slice(0, 4)}/${date.slice(5, 7)}/${safe(claim.claimCategory, 'needs-review').toLowerCase()}/${date}_${safe(claim.vendor, 'unknown-vendor')}_${safe(id, 'document')}.${extension}`;
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}
