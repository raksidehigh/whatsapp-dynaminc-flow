// Sends the Flow to one WhatsApp number.
// Usage: npm run send:flow -- <phone> [first name] [last name]
//   e.g. npm run send:flow -- 919667709270 Rahul Sharma
// WhatsApp never tells a Flow endpoint who the user is, so this script creates a random
// flow_token mapped to the recipient's phone; WhatsApp echoes it on every endpoint request.
// Optional names are stored as the contact's known details so the DETAILS screen is pre-filled.
require('dotenv').config();
const { setupDatabase } = require('../src/database/db');
const database = require('../src/services/databaseService');

const [phone, firstName, lastName] = process.argv.slice(2);
const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_FLOW_ID, GRAPH_API_VERSION = 'v25.0', FLOW_MODE = 'draft' } = process.env;

if (!/^\d{8,15}$/.test(phone || '')) {
  console.error('Usage: npm run send:flow -- <phone with country code, digits only> [first name] [last name]');
  process.exit(1);
}
const missing = Object.entries({ WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_FLOW_ID }).filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  console.error(`Missing ${missing.join(', ')} (set in .env or export in this terminal)`);
  process.exit(1);
}

setupDatabase();
if (firstName || lastName) database.saveContact(phone, { first_name: firstName, last_name: lastName });
const flowToken = database.createSession(phone);

(async () => {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: 'Find your course' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: WHATSAPP_FLOW_ID,
            flow_token: flowToken,
            flow_cta: 'Start',
            mode: FLOW_MODE,
            flow_action: 'data_exchange'
          }
        }
      }
    })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`WhatsApp API error ${response.status}: ${JSON.stringify(body.error || body)}`);
  console.log(`Sent Flow to +${phone} (message ${body.messages?.[0]?.id})`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
