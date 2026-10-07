const base = 'http://localhost:3000/api/whatsapp';
async function post(payload) {
  const response = await fetch(`${base}/flow/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  console.log(JSON.stringify(body, null, 2));
  return body;
}
(async () => {
  let result = await post({ action: 'INIT', version: '3.0' });
  const country = result.data.countries.find(item => item.id === 'DE');
  result = await post({ action: 'data_exchange', screen: 'COUNTRY', data: { step: 'load_universities', country: country.id } });
  const university = result.data.universities.find(item => item.title === 'TU Munich');
  result = await post({ action: 'data_exchange', screen: 'UNIVERSITY', data: { step: 'load_courses', country: 'DE', university: String(university.id) } });
  const course = result.data.courses.find(item => item.title === 'Computer Science');
  result = await post({ action: 'data_exchange', screen: 'COURSE', data: { step: 'show_confirmation', country: 'DE', university: String(university.id), course: String(course.id) } });
  await post({ action: 'data_exchange', screen: 'CONFIRM', data: { step: 'submit_application', country: 'DE', university: String(university.id), course: String(course.id) } });
  console.log(`Stored applications: ${await (await fetch(`${base}/applications`)).text()}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
