const database = require('./databaseService');

// Every Data API 3.0 response must identify the response protocol version.
const reply = (screen, data) => ({ version: '3.0', screen, data });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The flow_token was created by scripts/send-flow.js and mapped to the recipient's phone.
function phoneForSession(flowToken) {
  const phone = flowToken && database.phoneForToken(flowToken);
  if (!phone) throw new Error('Unknown flow_token; send the Flow with `npm run send:flow` so the phone number is known');
  return phone;
}

function contactDetails(phone) {
  const contact = database.getContact(phone) || {};
  return { phone, first_name: contact.first_name || '', last_name: contact.last_name || '', email: contact.email || '' };
}

function handleRequest(payload, log = console.log) {
  const { action, screen, data = {}, flow_token } = payload || {};
  log(`Action: ${action || '(missing)'}\nScreen: ${screen || '(none)'}`);
  log(`Data: ${JSON.stringify(data, null, 2)}`);

  // INIT is WhatsApp's initial endpoint handshake. WhatsApp may reuse a cached INIT
  // result when an old Flow message is reopened, so INIT only returns the static
  // WELCOME screen; its Start button fetches details and then countries fresh via data_exchange.
  if (action === 'INIT') return reply('WELCOME', {});
  // Meta's endpoint health check can send ping. It shares the encrypted transport
  // but does not navigate to a screen.
  if (action === 'ping') return { version: '3.0', data: { status: 'active' } };
  if (action !== 'data_exchange') throw new Error(`Unknown Flow action: ${action}`);

  const expectedScreen = {
    load_details: 'WELCOME',
    save_details: 'DETAILS',
    load_universities: 'COUNTRY',
    load_courses: 'UNIVERSITY',
    show_confirmation: 'COURSE',
    submit_application: 'CONFIRM'
  }[data.step];
  if (!expectedScreen) throw new Error(`Unknown data_exchange step: ${data.step}`);
  if (screen !== expectedScreen) throw new Error(`Unknown screen for step ${data.step}: ${screen}`);

  // The Flow's exchange payload declares a step so the endpoint can distinguish each interaction.
  switch (data.step) {
    case 'load_details': {
      const phone = phoneForSession(flow_token);
      log(`DB query: SELECT contacts WHERE phone = ${phone}`);
      return reply('DETAILS', contactDetails(phone));
    }
    case 'save_details': {
      const phone = phoneForSession(flow_token);
      const [first_name, last_name, email] = [data.first_name, data.last_name, data.email].map(value => String(value || '').trim());
      if (!first_name || !last_name || first_name.length > 80 || last_name.length > 80) throw new Error('First and last name are required (max 80 characters)');
      if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new Error('Invalid email address');
      database.saveContact(phone, { first_name, last_name, email });
      log('DB query: SELECT code, name FROM countries ORDER BY name');
      return reply('COUNTRY', { countries: database.countryOptions() });
    }
    case 'load_universities': {
      const country = database.getCountry(data.country);
      if (!country) throw new Error('Country not found');
      log(`DB query: SELECT universities WHERE country_id = ${country.id}`);
      return reply('UNIVERSITY', { country: country.code, country_name: country.name, universities: database.universitiesForCountry(country.code) });
    }
    case 'load_courses': {
      const university = database.getUniversity(data.university);
      if (!university) throw new Error('University not found');
      const country = database.getCountry(data.country);
      if (!country || university.country_id !== country.id) throw new Error('University does not belong to the selected country');
      log(`DB query: SELECT courses WHERE university_id = ${university.id}`);
      return reply('COURSE', { country: country.code, country_name: country.name, university: String(university.id), university_name: university.name, courses: database.coursesForUniversity(university.id) });
    }
    case 'show_confirmation': {
      const country = database.getCountry(data.country);
      const university = database.getUniversity(data.university);
      const course = database.getCourse(data.course);
      if (!country) throw new Error('Country not found');
      if (!university || university.country_id !== country.id) throw new Error('University not found for selected country');
      if (!course || course.university_id !== university.id) throw new Error('Course not found for selected university');
      const contact = contactDetails(phoneForSession(flow_token));
      return reply('CONFIRM', { full_name: `${contact.first_name} ${contact.last_name}`, email: contact.email, phone: contact.phone, country: country.code, country_name: country.name, university: String(university.id), university_name: university.name, course: String(course.id), course_name: course.name });
    }
    case 'submit_application': {
      const country = database.getCountry(data.country);
      const university = database.getUniversity(data.university);
      const course = database.getCourse(data.course);
      if (!country) throw new Error('Country not found');
      if (!university || university.country_id !== country.id) throw new Error('University not found for selected country');
      if (!course || course.university_id !== university.id) throw new Error('Course not found for selected university');
      const saved = database.saveApplication(country.id, university.id, course.id, contactDetails(phoneForSession(flow_token)));
      log(`Saved application row ${saved.id} at ${saved.created_at}`);
      return reply('DONE', { message: 'Your selection has been submitted.' });
    }
    default: throw new Error(`Unknown data_exchange step: ${data.step}`);
  }
}

module.exports = { handleRequest };
