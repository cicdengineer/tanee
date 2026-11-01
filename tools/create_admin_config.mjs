import {pbkdf2Sync, randomBytes} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

const output = process.argv[2];
const username = process.argv[3] || 'taneeupdate';
if (!output || !/^[a-zA-Z0-9_-]{3,50}$/.test(username)) {
  process.stderr.write('Usage: node tools/create_admin_config.mjs <output-file> [username]\nPassword is read from stdin.\n');
  process.exit(1);
}

const password = await new Promise(resolve => {
  let value = '';
  if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', chunk => {
    for (const ch of chunk.toString('utf8')) {
      if (ch === '\r' || ch === '\n') { process.stdin.pause(); resolve(value); return; }
      value += ch;
    }
  });
});
if (password.length < 10) { process.stderr.write('Password must be at least 10 characters.\n'); process.exit(1); }

const iterations = 600000;
const salt = randomBytes(24).toString('hex');
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
const php = `<?php\nreturn [\n    'username' => ${JSON.stringify(username)},\n    'salt' => ${JSON.stringify(salt)},\n    'iterations' => ${iterations},\n    'password_hash' => ${JSON.stringify(hash)},\n];\n`;
const path = resolve(output);
await mkdir(dirname(path), {recursive:true});
await writeFile(path, php, {mode:0o600});
process.stdout.write(`Wrote private admin configuration to ${path}\n`);
