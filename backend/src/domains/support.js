const { getDb } = require('../db');
const { readJson, requireFields, handleInputError } = require('../http');
const { ok, created, fail } = require('../response');
const { currentUser } = require('../middleware/auth');

function code(prefix) {
  return `${prefix}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function registerSupportRoutes(router) {
  router.post('/api/contact-messages', async (req, res) => {
    const user = currentUser(req);
    try {
      const payload = await readJson(req);
      requireFields(payload, ['reason', 'name', 'email', 'subject', 'message']);
      const messageCode = code('MSG');
      getDb().prepare(`
        INSERT INTO contact_messages (code, user_id, reason, name, email, phone, reference, subject, message, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        messageCode,
        user?.id || null,
        payload.reason,
        payload.name,
        payload.email,
        payload.phone || null,
        payload.reference || null,
        payload.subject,
        payload.message,
        JSON.stringify(payload)
      );
      return created(res, { code: messageCode, status: 'new' });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.post('/api/job-applications', async (req, res) => {
    try {
      const payload = await readJson(req);
      requireFields(payload, ['name', 'email', 'role']);
      const applicationCode = code('JOB');
      getDb().prepare(`
        INSERT INTO job_applications (code, name, email, phone, role, message, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(applicationCode, payload.name, payload.email, payload.phone || null, payload.role, payload.message || null, JSON.stringify(payload));
      return created(res, { code: applicationCode, status: 'received' });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/public/service-requests/:code', (req, res, { params }) => {
    const url = new URL(req.url, 'http://localhost');
    const email = (url.searchParams.get('email') || '').trim().toLowerCase();
    const row = getDb().prepare(`
      SELECT service_requests.*
      FROM service_requests
      LEFT JOIN users ON users.id = service_requests.user_id
      WHERE service_requests.code = ? AND (? = '' OR lower(users.email) = ? OR lower(json_extract(service_requests.payload_json, '$.email')) = ?)
    `).get(params.code, email, email, email);
    if (!row) return fail(res, 404, 'REQUEST_NOT_FOUND', 'Solicitud no encontrada.');
    const events = getDb().prepare('SELECT status, title, description, happened_at FROM service_request_events WHERE service_request_id = ? ORDER BY id').all(row.id);
    return ok(res, { ...row, payload: JSON.parse(row.payload_json), events });
  });
}

module.exports = { registerSupportRoutes };
