# WhatsApp Flows + dynamic SQLite data (educational PoC)

This small Express application demonstrates Meta's encrypted WhatsApp Flows endpoint. The Flow JSON declares screens, inputs, dropdowns, and bindings; the country, university, and course option arrays come from SQLite at runtime. No country-specific university or course option list is embedded in the Flow definition, so adding a row to the database changes what users see without touching the Flow.

The Flow also collects the user's first name, last name, and email. The WhatsApp phone number is identified automatically, and known names are pre-filled.

> **PoC status:** tested end to end on a real phone with Meta's test number, a Draft Flow, and an ngrok tunnel. It is not production-hardened; see [Moving beyond the PoC](#moving-beyond-the-poc).

## Flow screens

```text
WELCOME ──Start──> DETAILS ──Continue──> COUNTRY ──> UNIVERSITY ──> COURSE ──> CONFIRM ──Submit──> DONE
 static           pre-filled name,        fresh list    by country    by university  summary      row saved
                  email, auto phone       from SQLite
```

| Screen | What the user sees | Where the data comes from |
|---|---|---|
| `WELCOME` | Intro text and a Start button | Static; `INIT` returns it |
| `DETAILS` | WhatsApp number (read-only), first name, last name, email | `contacts` table, looked up by the session's phone |
| `COUNTRY` | Country dropdown | `countries` table, queried when Continue is pressed on DETAILS |
| `UNIVERSITY` | University dropdown | `universities` for the chosen country |
| `COURSE` | Course dropdown | `courses` for the chosen university |
| `CONFIRM` | Name, email, phone, and selections | Validated IDs resolved to names |
| `DONE` | Confirmation message | Shown after the `applications` row is inserted |

### Why there is a WELCOME screen

WhatsApp may reuse a cached `INIT` response when the user reopens an old Flow message, which showed stale country lists. `INIT` therefore only returns the static WELCOME screen. Every list is fetched by a button-triggered `data_exchange`, which is always sent to the endpoint, so each list is read from SQLite at the moment its screen opens.

A list does not refresh while its screen is already open. To see a newly added country, go back to WELCOME and press Start again (or reopen the message).

### How the phone number and names are known

WhatsApp does **not** send the user's phone number or profile name to a Flow endpoint. This project works around that:

- **Phone number:** `npm run send:flow` creates a random `flow_token`, stores `token → phone` in the `flow_sessions` table, and sends it with the message. WhatsApp includes the `flow_token` in every endpoint request, so the backend always knows whose Flow it is. Requests with an unknown token are rejected.
- **Names:** the send command can store a first and last name in the `contacts` table; the DETAILS screen pre-fills them via `init-value`. Whatever the user submits is saved back to `contacts`, so the next Flow is pre-filled with their name and email. In a real system these details would come from a CRM or lead database.

Messages sent without `npm run send:flow` (for example, a manual curl with a fixed `flow_token`) will fail at the DETAILS step with "Something went wrong".

## Architecture

```text
WhatsApp ──encrypted INIT / data_exchange / ping──> POST /api/whatsapp/flow
                                                      │ decrypt (RSA-OAEP + AES-GCM)
                                                      v
                                              Node.js + Express ──> SQLite
                                                      │ encrypt response
WhatsApp <──────────── next screen + dynamic data ────┘
```

- **Flow JSON** (`flow/flow.json`) defines screens, inputs, dropdowns, navigation, data shapes, bindings, and `data_exchange` actions. Dropdowns use `data-source` bindings such as `${data.countries}`; `data-source` is not a URL: the endpoint response fills the declared screen data.
- **Backend** decrypts the payload, resolves the `flow_token` to a phone, validates each selected database ID and the contact fields, queries SQLite, returns the next screen, and encrypts the response.
- **Database** is the source of truth for countries, universities, courses, contacts, Flow sessions, and submitted applications.

## Where each piece lives

| Thing | Location |
|---|---|
| Flow JSON | `flow/flow.json` |
| Backend endpoint | `src/routes/whatsappFlow.js` |
| Screen/step logic | `src/services/flowService.js` |
| DB queries | `src/services/databaseService.js` |
| Schema and seed | `src/database/` |
| Encryption | `src/crypto/flowCrypto.js` |
| Send a Flow to a number | `scripts/send-flow.js` |
| Database file | `data/whatsapp-flow.db` |
| RSA private / public key | `keys/private.pem` / `keys/public.pem` |
| Environment config | `.env` |

**THIS is the endpoint WhatsApp calls:** `POST https://YOUR_PUBLIC_HOST/api/whatsapp/flow`. Only this route accepts Meta's encrypted protocol. `/api/whatsapp/flow/simulate` is for local plaintext simulation and must never be configured in Meta.

### Database tables

| Table | Purpose |
|---|---|
| `countries`, `universities`, `courses` | Catalogue shown in the dropdowns |
| `contacts` | Known people by phone: first name, last name, email (used for pre-fill) |
| `flow_sessions` | `flow_token → phone` for each sent Flow message |
| `applications` | Submitted selections plus phone, name, and email |

The server runs the idempotent schema setup on start, so new tables and columns are added to an existing database automatically.

## How a request is handled

Each step's `data_exchange` payload carries a `step` name; the backend checks it was sent from the expected screen.

| Request | From screen | Backend does | Returns |
|---|---|---|---|
| `INIT` | – | Nothing dynamic | `WELCOME` |
| `ping` | – | Health check | `{ "status": "active" }` |
| `load_details` | `WELCOME` | `flow_token` → phone → contact | `DETAILS` |
| `save_details` | `DETAILS` | Validates and saves name/email; queries countries | `COUNTRY` |
| `load_universities` | `COUNTRY` | Queries universities for the country | `UNIVERSITY` |
| `load_courses` | `UNIVERSITY` | Checks university belongs to country; queries courses | `COURSE` |
| `show_confirmation` | `COURSE` | Validates the three IDs; adds contact details | `CONFIRM` |
| `submit_application` | `CONFIRM` | Validates again; inserts `applications` row | `DONE` |

Meta encrypts the request fields `encrypted_aes_key`, `encrypted_flow_data`, and `initial_vector`. The code uses RSA-OAEP with SHA-256 to unwrap the AES key and AES-GCM with the 16-byte IV to decrypt. The response is AES-GCM encrypted with the bitwise-inverted IV, auth tag appended, returned as base64 text. Every response includes `"version": "3.0"` to match the Flow's `data_api_version`.

**Flow JSON text tip:** a `${data.x}` binding is only substituted when it is the whole string. To mix fixed text with data, use a nested expression in backticks, e.g. `` "`'Country: ' ${data.country_name}`" `` (Flow JSON 6.0+).

## Setup and local run

Requires Node.js 18+ (built-in `fetch`). From the project directory:

```bash
npm install
cp .env.example .env
node scripts/generate-keys.js
npm run db:setup
npm run db:seed
npm start
```

The key generator creates an encrypted 2048-bit RSA private key with passphrase `change-me` by default. For another passphrase:

```bash
KEY_PASSPHRASE='your-passphrase' node scripts/generate-keys.js
```

and set the **same** value as `PRIVATE_KEY_PASSPHRASE` in `.env`. If they differ, every encrypted request fails with `bad decrypt` in the server log.

The **public key** is registered with Meta for the business phone number; the **private key** stays on the server. `.env`, `keys/*.pem`, and the database are ignored by Git; never commit or share them.

If port 3000 is already used by another app, set `PORT=3001` (or any free port) in `.env`. The test scripts read `PORT` from `.env`.

The seed creates Germany, United Kingdom, Canada, Australia, and India, with several universities each and three courses per university. Seeding is safe to run more than once.

### Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `PORT` | server, test scripts | Default 3000 |
| `DEBUG_FLOW` | server | `true` logs decrypted actions, screens, data, and queries |
| `PRIVATE_KEY_PATH`, `PRIVATE_KEY_PASSPHRASE` | server | Must match the generated key |
| `DATABASE_PATH` | everything | Default `data/whatsapp-flow.db` |
| `WHATSAPP_PHONE_NUMBER_ID` | `send:flow` | From the app's WhatsApp → API Setup page |
| `WHATSAPP_FLOW_ID` | `send:flow` | From the Flow's page in WhatsApp Manager |
| `WHATSAPP_TOKEN` | `send:flow` | Access token; secret, keep only in `.env` |
| `GRAPH_API_VERSION` | `send:flow` | Default `v25.0`; match the version shown on API Setup |
| `FLOW_MODE` | `send:flow` | `draft` (default) or `published` |

## Local tests (no WhatsApp needed)

With the server running in another terminal:

```bash
npm run test:local       # plaintext: WELCOME → DETAILS → Germany → TU Munich → Computer Science → submit
npm run test:encrypted   # encrypts an INIT with your public key, checks the decrypted WELCOME response
curl http://localhost:3000/api/whatsapp/applications   # view saved applications (use your PORT)
```

`test:local` creates a test contact (`910000000000`, "Test User") and a session, then walks every step through `/api/whatsapp/flow/simulate`. It saves a real `applications` row. It does not exercise encryption. `test:encrypted` checks the code's encryption round trip only; it does not prove Meta interoperability.

## Testing on a real phone

### 1. Run the server and a tunnel

Meta cannot reach `localhost`. In two terminals:

```bash
npm start
ngrok http 3001          # use your PORT
```

Copy the `https://….ngrok-free.app` (or `.ngrok-free.dev`) URL. Free ngrok URLs change on every restart; when that happens, update the endpoint URL in the Flow.

### 2. Get IDs and a token from the Meta app

developers.facebook.com → your app → **WhatsApp → API Setup**:

- **Generate access token** and copy it (temporary tokens last about 24 hours).
- Note the **Phone number ID** and the WhatsApp Business Account ID ("Messaging account ID") of the **test number** shown under *From*.
- Under **To**, add and verify each phone number that will receive the Flow (test numbers allow up to 5).
- Click **Send message** to send the `hello_world` template, then **reply to it from the phone**. This opens the 24-hour window needed for Flow messages.

Leave the app's mode as it is. Use the test number, not a production number: the public key is registered per phone number, and replacing a production number's key would break any existing Flows on it.

Put `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_TOKEN` in `.env`.

### 3. Register the public key on the phone number

```bash
TOKEN=...; PHONE_ID=...
curl -s -X POST "https://graph.facebook.com/v25.0/$PHONE_ID/whatsapp_business_encryption" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "business_public_key=$(cat keys/public.pem)"
# Verify: should show business_public_key_signature_status VALID
curl -s "https://graph.facebook.com/v25.0/$PHONE_ID/whatsapp_business_encryption" -H "Authorization: Bearer $TOKEN"
```

If you regenerate keys, register the new public key again.

### 4. Create the Flow

business.facebook.com → **WhatsApp Manager** → select the **test number's WhatsApp account** (the Flow must be in the same account as the sending number) → **Account tools → Flows → Create Flow**.

1. Pick any name and a blank/default template.
2. Replace the editor JSON with `flow/flow.json` (`pbcopy < flow/flow.json` on macOS), check **Flow JSON errors = 0**, and **Save**.
3. Open the **Endpoint** tab and complete each step:
   - **Endpoint URI:** the full URL including the path, e.g. `https://xxxx.ngrok-free.app/api/whatsapp/flow`
   - **Add phone number:** the test number
   - **Sign public key:** turns green automatically after step 3 (do not generate a new key here)
   - **Connect Meta app:** your app
   - **Health check:** should succeed and log `Action: ping` on the server
4. Do not publish. Draft Flows can be sent with `mode: draft`.

Put the Flow ID (in the browser URL) in `.env` as `WHATSAPP_FLOW_ID`.

### 5. Send the Flow

```bash
npm run send:flow -- <phone, country code, digits only> [first name] [last name]
# e.g.
npm run send:flow -- 919999999999 Asha Verma
```

The names are optional; when given (or already stored from a previous submission) they appear pre-filled.

`Sent Flow to +… (message wamid…)` means Meta **accepted** the request, not that it was delivered. Delivery failures are only reported via webhooks, which this PoC does not configure. If nothing arrives, see the troubleshooting table.

### 6. Complete it on the phone

Start → Start → check the pre-filled details, enter an email → choose country, university, course → Submit. Then:

```bash
curl http://localhost:3001/api/whatsapp/applications
```

The newest row contains the phone, name, email, and selections.

To see that data is live, add a row while the server runs (for example a new country with its universities and courses) and press Start again on the WELCOME screen: the new option appears with no restart and no Flow change.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Server crashes with `EADDRINUSE` | Another app uses the port; change `PORT` in `.env` and in the ngrok command |
| `bad decrypt` in the server log | `PRIVATE_KEY_PASSPHRASE` doesn't match the key; regenerate with `KEY_PASSPHRASE` set to the same value |
| Health check: `404 Cannot POST /` | Endpoint URI is missing `/api/whatsapp/flow` |
| Health check fails / times out | Server or ngrok not running, or the ngrok URL changed |
| Test number not listed when adding the phone number | Flow was created in a different WhatsApp account; recreate it in the test number's account |
| Phone shows "Something went wrong" | Key on the number isn't the current `public.pem` (re-register), or the message wasn't sent with `npm run send:flow` (unknown `flow_token`) |
| API error `190` / "Authentication Error" | Token expired or empty; generate a new one and update `WHATSAPP_TOKEN` |
| `Sent Flow …` but nothing arrives | Recipient not in the test number's **To** list, or the recipient hasn't messaged the business in the last 24 hours. Send `hello_world` from API Setup and have them reply, then send again |
| Error `131047` | Outside the 24-hour window; the recipient must message the number first |
| CONFIRM shows `${data.…}` literally | Old Flow JSON; re-paste `flow/flow.json` (uses nested expressions) |
| Country list is stale | Go back to WELCOME and press Start; lists refresh per screen open |

With `DEBUG_FLOW=true` the server log shows each decrypted action, screen, data, query, and response. It never prints keys, AES material, or tokens. Errors return HTTP 500 with a generic body (as in Meta's official example); the reason is only in the server log.

## Moving beyond the PoC

- **Hosting:** a stable HTTPS host instead of a laptop and tunnel.
- **Token:** a permanent System User access token from Business Settings, kept in a secret manager.
- **Phone number:** the business's real number needs its own public key registration; check first whether it already has one used by other Flows.
- **Publishing:** publish the Flow and set `FLOW_MODE=published`.
- **Reaching new users:** outside the 24-hour window, send the Flow inside an approved message template with a Flow button rather than an interactive message.
- **Contact data:** load names from the CRM; consider a webhook to read the WhatsApp profile name from inbound messages.
- **Errors:** return the current screen with `error_message` for validation problems instead of HTTP 500.
- **Operations:** monitoring, rate limits, request-size limits, session expiry, database backups, and a security review.

## Official references

- [Meta WhatsApp Flows documentation](https://developers.facebook.com/docs/whatsapp/flows/)
- [Flows getting started guide](https://developers.facebook.com/docs/whatsapp/flows/gettingstarted/)
- [Meta Flow endpoint guide](https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint/)
- [Meta WhatsApp Flows Tools repository](https://github.com/WhatsApp/WhatsApp-Flows-Tools)
- [Official Node.js basic endpoint example](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/endpoint/nodejs/basic)

Meta renames WhatsApp Manager labels from time to time; if a button name differs, the linked guides are the authority.
