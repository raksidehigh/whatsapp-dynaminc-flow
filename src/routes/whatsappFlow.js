const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { decryptRequest, encryptResponse } = require('../crypto/flowCrypto');
const flowService = require('../services/flowService');
const { db } = require('../database/db');

const router = express.Router();
const debug = process.env.DEBUG_FLOW === 'true';
const privateKeyPath = path.resolve(process.env.PRIVATE_KEY_PATH || 'keys/private.pem');

// THIS is the endpoint WhatsApp calls: POST /api/whatsapp/flow.
router.post('/flow', (req, res) => {
  console.log('\n--------------------------------------------------\nWHATSAPP FLOW REQUEST\n--------------------------------------------------');
  try {
    if (!fs.existsSync(privateKeyPath)) throw new Error(`Private key not found at ${privateKeyPath}; generate keys first`);
    const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
    const { payload, aesKey, iv } = decryptRequest(req.body, privateKeyPem, process.env.PRIVATE_KEY_PASSPHRASE);
    const log = debug ? console.log : () => {};
    const response = flowService.handleRequest(payload, log);
    if (debug) console.log(`Next screen: ${response.screen}\nResponse data: ${JSON.stringify(response.data, null, 2)}`);
    console.log('--------------------------------------------------\nFLOW RESPONSE\n--------------------------------------------------');
    // WhatsApp expects the encrypted base64 string as the entire HTTP response body, not JSON.
    res.status(200).type('text/plain').send(encryptResponse(response, aesKey, iv));
  } catch (error) {
    console.error(`Flow request failed: ${error.message}`);
    // Meta's official endpoint example returns HTTP 500 with a generic text body on errors.
    // Do not send a made-up JSON error shape; without a successfully decrypted AES key we
    // cannot construct the encrypted Flow response anyway.
    res.status(500).type('text/plain').send('Internal Server Error');
  }
});

// Local-only simulator accepts plaintext payloads. Never configure this route as the Meta endpoint.
router.post('/flow/simulate', (req, res) => {
  try {
    const response = flowService.handleRequest(req.body, debug ? console.log : () => {});
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/applications', (_req, res) => {
  const rows = db.prepare(`SELECT a.id, a.phone, a.first_name, a.last_name, a.email, c.name AS country, u.name AS university, co.name AS course, a.created_at
    FROM applications a JOIN countries c ON c.id=a.country_id JOIN universities u ON u.id=a.university_id
    JOIN courses co ON co.id=a.course_id ORDER BY a.id DESC`).all();
  res.json(rows);
});

module.exports = router;
