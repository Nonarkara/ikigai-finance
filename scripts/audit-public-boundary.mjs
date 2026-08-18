import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
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

// Audit exactly the files git can publish: tracked plus untracked-not-ignored.
// A gitignored file (.dev.vars, .wrangler/) can never reach the public repo, so
// flagging a maintainer's real .dev.vars would be a false positive; a file that
// is force-added becomes tracked and is included again. Falls back to a plain
// tree walk if git is unavailable.
function files() {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    return out.split('\0').filter(Boolean);
  } catch {
    console.error('Public boundary audit requires git to determine the publishable file set.');
    process.exit(1);
  }
}

const failures = [];
for (const path of files()) {
  if (/\.(?:ico|png|jpe?g|gif|webp|woff2?|lock)$/i.test(path)) continue;
  let content;
  try { content = await readFile(path, 'utf8'); } catch { continue; }
  for (const pattern of forbidden) {
    if (pattern.test(content)) failures.push(`${relative(root, path)} matched ${pattern}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Public boundary audit passed.');
