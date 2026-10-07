const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: process.env.KEY_PASSPHRASE || 'change-me' }
});
const dir = path.join(__dirname, '..', 'keys');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'private.pem'), privateKey, { mode: 0o600 });
fs.writeFileSync(path.join(dir, 'public.pem'), publicKey, { mode: 0o644 });
console.log('Generated keys/private.pem (keep secret) and keys/public.pem (register with Meta).');
console.log(`Use PRIVATE_KEY_PASSPHRASE=${process.env.KEY_PASSPHRASE || 'change-me'} in .env for this pair.`);
