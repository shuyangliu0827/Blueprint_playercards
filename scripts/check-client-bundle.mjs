import fs from 'node:fs';
import path from 'node:path';
const root = '.next/static';
const files = [];
function walk(p) {
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const file = path.join(p, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.js')) files.push(file);
  }
}
walk(root);
const values = fs.existsSync('.env.local')
  ? fs
      .readFileSync('.env.local', 'utf8')
      .split('\n')
      .filter((l) => /^(DRAW_HMAC_SECRET|IP_HASH_SALT)=/.test(l))
      .map((l) => l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, ''))
  : [];
for (const file of files) {
  const s = fs.readFileSync(file, 'utf8');
  if (
    values.some((v) => v.length > 20 && s.includes(v)) ||
    s.includes('rarity_registry.json') ||
    s.includes('firstDrawRelativeWeights') ||
    s.includes('IP_HASH_SALT')
  )
    throw Error('Server-only content found in ' + file);
}
console.log('Client bundles scanned:', files.length, '; no secrets/probability registry detected');
