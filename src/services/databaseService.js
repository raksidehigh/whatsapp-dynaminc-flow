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

function saveApplication(countryId, universityId, courseId) {
  const info = db.prepare(`INSERT INTO applications(country_id, university_id, course_id)
    VALUES (?, ?, ?)`).run(countryId, universityId, courseId);
  return db.prepare(`SELECT a.id, c.name AS country, u.name AS university, co.name AS course, a.created_at
    FROM applications a JOIN countries c ON c.id = a.country_id
    JOIN universities u ON u.id = a.university_id JOIN courses co ON co.id = a.course_id
    WHERE a.id = ?`).get(info.lastInsertRowid);
}

module.exports = { countryOptions, universitiesForCountry, coursesForUniversity, getCountry, getUniversity, getCourse, saveApplication };
