const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || 'data/whatsapp-flow.db';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

function setupDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS countries (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS universities (
      id INTEGER PRIMARY KEY,
      country_id INTEGER NOT NULL REFERENCES countries(id),
      name TEXT NOT NULL,
      UNIQUE(country_id, name)
    );
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY,
      university_id INTEGER NOT NULL REFERENCES universities(id),
      name TEXT NOT NULL,
      UNIQUE(university_id, name)
    );
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY,
      country_id INTEGER NOT NULL REFERENCES countries(id),
      university_id INTEGER NOT NULL REFERENCES universities(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      phone TEXT,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS contacts (
      phone TEXT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    -- WhatsApp never tells the endpoint who the user is. Each sent Flow message gets a
    -- random flow_token mapped to the recipient's phone; WhatsApp echoes it on every request.
    CREATE TABLE IF NOT EXISTS flow_sessions (
      token TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  // Databases created before contact details existed need the new application columns added in place.
  const columns = db.prepare('PRAGMA table_info(applications)').all().map(column => column.name);
  for (const column of ['phone', 'first_name', 'last_name', 'email']) {
    if (!columns.includes(column)) db.exec(`ALTER TABLE applications ADD COLUMN ${column} TEXT`);
  }
}

if (require.main === module) {
  setupDatabase();
  console.log(`Database schema ready: ${dbPath}`);
}
module.exports = { db, setupDatabase };
