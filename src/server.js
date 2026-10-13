require('dotenv').config();
const express = require('express');
const { setupDatabase } = require('./database/db');
const whatsappFlowRouter = require('./routes/whatsappFlow');

// Idempotent: creates missing tables/columns so schema changes apply on restart.
setupDatabase();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/whatsapp', whatsappFlowRouter);

// express.json rejects malformed bodies before a route can handle them. Match the
// endpoint's generic failure response and avoid exposing parser details to callers.
app.use((error, _req, res, _next) => {
  console.error(`Request body could not be parsed: ${error.message}`);
  res.status(500).type('text/plain').send('Internal Server Error');
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`WhatsApp Flow demo listening at http://localhost:${port}`);
  console.log(`THIS is the endpoint WhatsApp calls: http://localhost:${port}/api/whatsapp/flow`);
});
