import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
if (!fs.existsSync('.env.local'))
  fs.writeFileSync(
    '.env.local',
    `DRAW_HMAC_SECRET=${randomBytes(48).toString('hex')}\nIP_HASH_SALT=${randomBytes(48).toString('hex')}\n`,
    { mode: 0o600 },
  );
