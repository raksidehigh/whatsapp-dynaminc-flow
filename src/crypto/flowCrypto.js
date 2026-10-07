const crypto = require('node:crypto');

// Meta sends three base64 values. RSA-OAEP unwraps a random AES key; AES-GCM
// decrypts the Flow JSON. Keep all cryptographic bytes private from logs.
function decryptRequest(body, privateKeyPem, passphrase) {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body || {};
  if (![encrypted_aes_key, encrypted_flow_data, initial_vector].every(v => typeof v === 'string' && v.length)) {
    throw new Error('Malformed encrypted request: required fields are missing');
  }
  const aesKey = crypto.privateDecrypt({
    key: privateKeyPem,
    passphrase: passphrase || undefined,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256'
  }, Buffer.from(encrypted_aes_key, 'base64'));
  const iv = Buffer.from(initial_vector, 'base64');
  if (iv.length !== 16) throw new Error('Invalid Flow IV length');
  const encrypted = Buffer.from(encrypted_flow_data, 'base64');
  if (encrypted.length <= 16) throw new Error('Encrypted Flow data is too short');
  const decipher = crypto.createDecipheriv(`aes-${aesKey.length * 8}-gcm`, aesKey, iv, { authTagLength: 16 });
  decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
  return { payload: JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8')), aesKey, iv };
}

function encryptResponse(response, aesKey, iv) {
  const flippedIv = Buffer.from(iv.map(byte => byte ^ 0xff));
  const cipher = crypto.createCipheriv(`aes-${aesKey.length * 8}-gcm`, aesKey, flippedIv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(response), 'utf8'), cipher.final()]);
  // WhatsApp expects the GCM authentication tag appended to ciphertext and a base64 text body.
  return Buffer.concat([ciphertext, cipher.getAuthTag()]).toString('base64');
}

module.exports = { decryptRequest, encryptResponse };
