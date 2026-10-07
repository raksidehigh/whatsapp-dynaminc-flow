const { db, setupDatabase } = require('./db');
setupDatabase();

const catalog = {
  Germany: ['TU Munich', 'RWTH Aachen', 'TU Berlin'],
  'United Kingdom': ['Imperial College London', 'University College London', 'University of Manchester'],
  Canada: ['University of Toronto', 'University of British Columbia'],
  India: ['IIT Delhi', 'IIT Bombay', 'IIT Madras'],
  Australia: ['University of Melbourne', 'University of Sydney']
};
const courses = ['Computer Science', 'Data Science', 'Electrical Engineering'];

const seed = db.transaction(() => {
  const addCountry = db.prepare('INSERT OR IGNORE INTO countries(name, code) VALUES (?, ?)');
  const addUniversity = db.prepare('INSERT OR IGNORE INTO universities(country_id, name) VALUES (?, ?)');
  const addCourse = db.prepare('INSERT OR IGNORE INTO courses(university_id, name) VALUES (?, ?)');
  for (const [name, code] of [['Germany','DE'], ['United Kingdom','UK'], ['Canada','CA'], ['Australia','AU'], ['India','IN']]) {
    addCountry.run(name, code);
    const country = db.prepare('SELECT id FROM countries WHERE code = ?').get(code);
    for (const universityName of catalog[name]) {
      addUniversity.run(country.id, universityName);
      const university = db.prepare('SELECT id FROM universities WHERE country_id = ? AND name = ?').get(country.id, universityName);
      for (const course of courses) addCourse.run(university.id, course);
    }
  }
});
seed();
console.log('Seeded countries, universities, and courses.');
