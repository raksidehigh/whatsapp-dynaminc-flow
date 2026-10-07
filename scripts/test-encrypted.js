// Offline protocol smoke test: create a Meta-shaped encrypted envelope with this
// project's public key, POST it to the real endpoint, then decrypt the response.
// This exercises encryption but does not contact WhatsApp or prove Meta interoperability.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const root = path.join(__dirname, '..');
const publicKey = fs.readFileSync(path.join(root, 'keys/public.pem'), 'utf8');
const privateKey = fs.readFileSync(path.join(root, process.env.PRIVATE_KEY_PATH || 'keys/private.pem'), 'utf8');
const passphrase = process.env.PRIVATE_KEY_PASSPHRASE;
const aesKey = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv, { authTagLength: 16 });
const plaintext = Buffer.from(JSON.stringify({ action: 'INIT', version: '3.0', data: {} }));
const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
const envelope = {
  encrypted_aes_key: crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aesKey).toString('base64'),
  encrypted_flow_data: encrypted.toString('base64'),
  initial_vector: iv.toString('base64')
};

(async () => {
  const response = await fetch('http://localhost:3000/api/whatsapp/flow', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope)
  });
  if (!response.ok) throw new Error(`Encrypted endpoint returned HTTP ${response.status}`);
  const encryptedResponse = Buffer.from(await response.text(), 'base64');
  const flippedIv = Buffer.from(iv.map(byte => byte ^ 0xff));
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, flippedIv, { authTagLength: 16 });
  decipher.setAuthTag(encryptedResponse.subarray(-16));
  const clearResponse = Buffer.concat([decipher.update(encryptedResponse.subarray(0, -16)), decipher.final()]);
  const result = JSON.parse(clearResponse.toString('utf8'));
  if (result.screen !== 'COUNTRY' || !Array.isArray(result.data.countries)) throw new Error('Unexpected decrypted Flow response');
  console.log(`Encrypted endpoint round-trip succeeded. Screen=${result.screen}; countries=${result.data.countries.length}.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
