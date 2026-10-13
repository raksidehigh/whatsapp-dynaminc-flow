const crypto = require('node:crypto');
const { db } = require('../database/db');

const countryOptions = () => db.prepare('SELECT code AS id, name AS title FROM countries ORDER BY name').all();
const universitiesForCountry = code => db.prepare(`
  SELECT u.id, u.name AS title FROM universities u
  JOIN countries c ON c.id = u.country_id WHERE c.code = ? ORDER BY u.name
`).all(code).map(row => ({ ...row, id: String(row.id) }));
const coursesForUniversity = id => db.prepare('SELECT id, name AS title FROM courses WHERE university_id = ? ORDER BY name')
  .all(id).map(row => ({ ...row, id: String(row.id) }));
const getCountry = code => db.prepare('SELECT * FROM countries WHERE code = ?').get(code);
const getUniversity = id => db.prepare('SELECT * FROM universities WHERE id = ?').get(Number(id));
const getCourse = id => db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(id));

const getContact = phone => db.prepare('SELECT * FROM contacts WHERE phone = ?').get(phone);
const phoneForToken = token => db.prepare('SELECT phone FROM flow_sessions WHERE token = ?').get(token)?.phone;

function createSession(phone) {
  const token = crypto.randomUUID();
  db.prepare('INSERT INTO flow_sessions(token, phone) VALUES (?, ?)').run(token, phone);
  return token;
}

// Missing (null) fields keep their stored value, so a partial update never erases known details.
function saveContact(phone, { first_name = null, last_name = null, email = null }) {
  db.prepare(`INSERT INTO contacts(phone, first_name, last_name, email) VALUES (?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      first_name = COALESCE(excluded.first_name, contacts.first_name),
      last_name = COALESCE(excluded.last_name, contacts.last_name),
      email = COALESCE(excluded.email, contacts.email),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(phone, first_name, last_name, email);
}

function saveApplication(countryId, universityId, courseId, contact) {
  const info = db.prepare(`INSERT INTO applications(country_id, university_id, course_id, phone, first_name, last_name, email)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(countryId, universityId, courseId, contact.phone, contact.first_name, contact.last_name, contact.email);
  return db.prepare(`SELECT a.id, a.phone, a.first_name, a.last_name, a.email, c.name AS country, u.name AS university, co.name AS course, a.created_at
    FROM applications a JOIN countries c ON c.id = a.country_id
    JOIN universities u ON u.id = a.university_id JOIN courses co ON co.id = a.course_id
    WHERE a.id = ?`).get(info.lastInsertRowid);
}

module.exports = {
  countryOptions, universitiesForCountry, coursesForUniversity, getCountry, getUniversity, getCourse,
  getContact, phoneForToken, createSession, saveContact, saveApplication
};
