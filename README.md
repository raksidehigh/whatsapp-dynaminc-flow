# WhatsApp Flows + dynamic SQLite data (educational PoC)

This small Express application demonstrates Meta's encrypted WhatsApp Flows endpoint. The Flow JSON declares dropdowns and bindings; the country, university, and course option arrays come from SQLite at runtime. No country-specific university or course option list is embedded in the Flow definition.

> **PoC warning:** local simulation proves the database and application logic only. The Meta endpoint uses Meta's encrypted request/response protocol, but a real WhatsApp test still requires a configured business phone number, registered public key, published Flow, and reachable HTTPS endpoint. Do not use this demo unchanged for production.

## Architecture

```text
WhatsApp
   |
   | Flow opens
   v
Flow JSON
   |
   | encrypted INIT / data_exchange
   v
POST /api/whatsapp/flow
   |
   | decrypt
   v
Node.js + Express
   |
   v
SQLite
   |
   | dynamic data
   v
Node.js
   |
   | encrypt
   v
WhatsApp
   |
   v
Dynamic Flow screen
```

### Who does what?

- **Flow JSON** (`flow/flow.json`) defines screens, inputs, dropdowns, buttons, navigation, data shapes, bindings, and `data_exchange` actions. The dropdown uses the supported component `data-source` binding `${data.countries}` (and equivalent university/course bindings). `data-source` is not a URL or backend property: the endpoint response fills the declared screen data.
- **Backend** decrypts the incoming payload, validates each selected database ID, queries SQLite, returns dynamic screen data, and encrypts the response.
- **Database** is the source of truth for countries, universities, courses, and submitted applications.

## Where each piece lives

| Thing | Location |
|---|---|
| Flow JSON | `flow/flow.json` |
| Backend endpoint | `src/routes/whatsappFlow.js` |
| Database | `data/whatsapp-flow.db` |
| DB logic and seed | `src/database/` |
| Encryption | `src/crypto/flowCrypto.js` |
| RSA private key | `keys/private.pem` |
| RSA public key | `keys/public.pem` |
| Environment config | `.env` |
| Flow endpoint URL | Meta Flow endpoint configuration |

**THIS is the endpoint WhatsApp calls:** `POST https://YOUR_PUBLIC_HOST/api/whatsapp/flow` (locally, `http://localhost:3000/api/whatsapp/flow`). Only this route accepts Meta's encrypted protocol. `/api/whatsapp/flow/simulate` is for local plaintext simulation and must never be configured in Meta.

## How the magic happens

1. WhatsApp initializes the endpoint for the first screen with an encrypted request whose action is `INIT`. After decryption the action resembles:

   ```json
   { "action": "INIT" }
   ```

   The endpoint queries `SELECT code, name FROM countries ORDER BY name` and replies with the `COUNTRY` screen plus a `countries` array. The Flow binds that array into its Dropdown.

2. The user chooses Germany. Pressing Continue runs the Flow's `data_exchange` action. After decryption, the relevant data resembles:

   ```json
   { "action": "data_exchange", "data": { "step": "load_universities", "country": "DE" } }
   ```

   The backend resolves DE to its database id, runs a parameterized query equivalent to `SELECT * FROM universities WHERE country_id = 1`, and returns `screen: UNIVERSITY` plus the dynamic university array.

3. The user chooses TU Munich. The next `data_exchange` contains its database id. The backend verifies it belongs to the selected country, queries `SELECT * FROM courses WHERE university_id = 1`, then returns the `COURSE` screen and the runtime course options.

4. The user chooses Computer Science. Another exchange validates the three linked IDs and returns the `CONFIRM` screen with display names. The final Submit button sends a last `data_exchange`; the backend validates the values again, inserts an `applications` row with a UTC timestamp, and returns the terminal `DONE` screen.

Meta encrypts the request body fields `encrypted_aes_key`, `encrypted_flow_data`, and `initial_vector`. The code uses RSA-OAEP with SHA-256 to unwrap the AES key and AES-GCM with the provided 16-byte IV to decrypt the payload. The response is JSON encrypted with AES-GCM using the bitwise-inverted IV; its authentication tag is appended to the ciphertext, which is returned as base64 text. These details follow Meta's official endpoint example.

**Example version detail:** Meta's currently published basic Node.js endpoint sample demonstrates the cryptography but its sample response omits a `version` property. This project returns `"version": "3.0"` on every response to match the Flow's `data_api_version`; validate the JSON against the current Flow Builder/schema for the target account before publishing.

## Setup and local run

Requires a supported Node.js release (Node 18+ for built-in `fetch`). From the project directory:

```bash
npm install
cp .env.example .env
node scripts/generate-keys.js
npm run db:setup
npm run db:seed
npm start
```

The key generator creates an encrypted 2048-bit RSA private key using passphrase `change-me` by default, plus its public key. `.env.example` already contains that passphrase. For another passphrase run `KEY_PASSPHRASE='your-passphrase' node scripts/generate-keys.js` and set the same `PRIVATE_KEY_PASSPHRASE` in `.env`.

The **public key** is registered with Meta for your WhatsApp business phone number so Meta can encrypt AES keys for your endpoint. The **private key** stays on the server and decrypts them. `keys/private.pem` is ignored by Git; never commit or share it. Keep backups securely and use a secret manager in production.

The database seed creates Germany, United Kingdom, Canada, Australia, and India, multiple universities per country, and three courses per university. Seeding is safe to run more than once.

## Local simulation (plaintext only)

With the server running in another terminal:

```bash
npm run test:local
```

This script simulates INIT → Germany → TU Munich → Computer Science → submit. It calls `/api/whatsapp/flow/simulate` with decrypted example payloads; it does **not** simulate WhatsApp encryption and is not a protocol test. View persisted selections with:

```bash
curl http://localhost:3000/api/whatsapp/applications
```

To exercise the encrypted endpoint locally without WhatsApp, run `npm run test:encrypted`. It creates a temporary Meta-shaped encrypted request using your generated public key, sends it to `/api/whatsapp/flow`, then decrypts and checks the response. This checks the code's encryption round trip only; it does not prove live Meta interoperability.

You can try one step directly:

```bash
curl -s http://localhost:3000/api/whatsapp/flow/simulate \
  -H 'Content-Type: application/json' \
  -d '{"action":"INIT","version":"3.0"}'
```

The actual encrypted route requires Meta-shaped cryptographic input; plaintext JSON sent to it should fail decryption. `DEBUG_FLOW=true` prints decrypted action, screen, demo data, query intent, and response data. It does not print private keys, AES keys, tokens, or credentials.

## Expose it for WhatsApp

Meta cannot reach `localhost` on your computer: localhost is only reachable from the same machine. Start a tunnel in another terminal, for example:

```bash
ngrok http 3000
```

If ngrok gives `https://xxxx.ngrok-free.app`, configure this full URL as the endpoint:

```text
https://xxxx.ngrok-free.app/api/whatsapp/flow
```

Cloudflare Tunnel is another option. Use a stable HTTPS URL for longer testing; free tunnel URLs can change.

## Connect it to Meta

Meta changes WhatsApp Manager labels and account workflows over time. Use the current [Flows getting started guide](https://developers.facebook.com/docs/whatsapp/flows/gettingstarted/), [Flow endpoint implementation guide](https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint/), and [WhatsApp Flows Tools](https://github.com/WhatsApp/WhatsApp-Flows-Tools) as the authority for the UI and API sequence. The official docs endpoint was rate-limited while preparing this demo; the exact navigation text may vary by account. Do not assume every account shows identical controls.

1. Set up the WhatsApp Business Platform environment and a business phone number with the required Flow permissions.
2. Create a Flow using the current Flow creation tool in WhatsApp Manager or the Graph API Flow workflow.
3. Upload or paste `flow/flow.json` in the Flow editor and validate it with the current Meta tooling. Screen data `__example__` values are editor/schema examples only; selectable runtime options come from endpoint replies.
4. Register the generated **public** key (`keys/public.pem`) for the relevant business phone number using Meta's current public-key registration process. Keep `keys/private.pem` and its passphrase on the server.
5. Configure the Flow's data endpoint to the tunnel URL ending in `/api/whatsapp/flow`. Configure the required encryption/public-key settings through the current Meta endpoint setup process. Do not point Meta at `/flow/simulate`.
6. Save and publish the Flow as required by the current tool. Send/launch it using the supported WhatsApp Flow message mechanism for your test number.
7. Select Germany, confirm that the returned university/course values are from SQLite, submit, then check `/api/whatsapp/applications` or query the `applications` table.

The exact endpoint-association step and key-registration UI can differ depending on whether you use WhatsApp Manager or the Graph API and the current account/API version. The linked Meta guides are the source for current labels and account-specific steps; this README deliberately does not invent fixed button names.

## Logs and errors

With `DEBUG_FLOW=true`, local development logs show the decrypted action, screen, safe demo data, query being made, and next-screen data. They never dump cryptographic material. Malformed, undecryptable, unsupported-action, and invalid-selection endpoint requests return HTTP 500 with a generic text response, matching Meta's official Node.js endpoint example's failure behavior. Detailed reasons stay in the server log. The endpoint cannot return an encrypted Flow error object when it could not decrypt the request.

## Development and production boundaries

- **Local simulation:** `test:local` exercises database lookup, validation, transitions, and insertion using plaintext simulated payloads.
- **Encrypted endpoint:** Implements Meta's RSA/AES request and response encryption. Actual interoperability still needs testing with a registered key and WhatsApp's endpoint test/Flow runtime.
- **Development:** ngrok or Cloudflare Tunnel exposes the local HTTP listener through HTTPS for Meta callbacks.
- **Production:** Use a stable HTTPS host, secret-managed private key/passphrase, operational monitoring, rate limits, request-size controls, durable database backups, and security review. This teaching project is not production-hardened.

## Official references

- [Meta WhatsApp Flows documentation](https://developers.facebook.com/docs/whatsapp/flows/)
- [Meta Flow endpoint guide](https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint/)
- [Meta WhatsApp Flows Tools repository](https://github.com/WhatsApp/WhatsApp-Flows-Tools)
- [Official Node.js basic endpoint example](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/endpoint/nodejs/basic)
