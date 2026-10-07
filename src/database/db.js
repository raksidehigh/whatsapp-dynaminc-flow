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
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
}

if (require.main === module) {
  setupDatabase();
  console.log(`Database schema ready: ${dbPath}`);
}
module.exports = { db, setupDatabase };
