/**
 * Single-owner deployment allowlist.
 *
 * The app is one company, not one hard-coded person. Each clone supplies its
 * own comma-separated OWNER_EMAILS value. An empty list fails closed.
 */
export function parseOwnerEmails(value = process.env.OWNER_EMAILS || '') {
  return Object.freeze(
    [...new Set(
      String(value)
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    )],
  );
}

export function isAllowedOwner(email, configured = process.env.OWNER_EMAILS || '') {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return parseOwnerEmails(configured).includes(normalized);
}
