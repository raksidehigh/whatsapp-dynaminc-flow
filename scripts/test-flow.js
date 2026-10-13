require('dotenv').config();
const { setupDatabase } = require('../src/database/db');
const database = require('../src/services/databaseService');
const base = `http://localhost:${process.env.PORT || 3000}/api/whatsapp`;

// Mirror scripts/send-flow.js: a known contact plus a session token, without contacting WhatsApp.
setupDatabase();
const testPhone = '910000000000';
database.saveContact(testPhone, { first_name: 'Test', last_name: 'User' });
const flow_token = database.createSession(testPhone);
async function post(payload) {
  const response = await fetch(`${base}/flow/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  console.log(JSON.stringify(body, null, 2));
  return body;
}
(async () => {
  let result = await post({ action: 'INIT', version: '3.0' });
  result = await post({ action: 'data_exchange', screen: 'WELCOME', flow_token, data: { step: 'load_details' } });
  if (result.data.first_name !== 'Test' || result.data.phone !== testPhone) throw new Error('Details were not pre-filled');
  result = await post({ action: 'data_exchange', screen: 'DETAILS', flow_token, data: { step: 'save_details', first_name: 'Test', last_name: 'User', email: 'test@example.com' } });
  const country = result.data.countries.find(item => item.id === 'DE');
  result = await post({ action: 'data_exchange', screen: 'COUNTRY', flow_token, data: { step: 'load_universities', country: country.id } });
  const university = result.data.universities.find(item => item.title === 'TU Munich');
  result = await post({ action: 'data_exchange', screen: 'UNIVERSITY', flow_token, data: { step: 'load_courses', country: 'DE', university: String(university.id) } });
  const course = result.data.courses.find(item => item.title === 'Computer Science');
  result = await post({ action: 'data_exchange', screen: 'COURSE', flow_token, data: { step: 'show_confirmation', country: 'DE', university: String(university.id), course: String(course.id) } });
  await post({ action: 'data_exchange', screen: 'CONFIRM', flow_token, data: { step: 'submit_application', country: 'DE', university: String(university.id), course: String(course.id) } });
  console.log(`Stored applications: ${await (await fetch(`${base}/applications`)).text()}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
