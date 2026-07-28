import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git', '.next', '.open-next', '.worktrees', 'node_modules']);
const forbidden = [
  new RegExp(['ax', 'iom', '[ _-]?x'].join(''), 'i'),
  new RegExp(['tenant_', 'ikigai'].join(''), 'i'),
  new RegExp(['axi', 'om_story'].join(''), 'i'),
  new RegExp(['ikigai', '\\.nonarkara\\.org'].join(''), 'i'),
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
  /TELEGRAM_BOT_TOKEN\s*=\s*\d{8,}:[A-Za-z0-9_-]{30,}/,
  /(?:SESSION_SECRET|APP_PASSWORD)\s*=\s*[A-Za-z0-9+/=_-]{40,}/,
  /gh[opsu]_[A-Za-z0-9]{30,}/,
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}

const failures = [];
for (const path of await files(root)) {
  if (/\.(?:ico|png|jpe?g|gif|webp|woff2?|lock)$/i.test(path)) continue;
  const content = await readFile(path, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(content)) failures.push(`${relative(root, path)} matched ${pattern}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Public boundary audit passed.');
