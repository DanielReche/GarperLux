const { getDb } = require('../db');
const { readJson, requireFields, handleInputError } = require('../http');
const { ok, created, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');

function requestCode() {
  return `SAT-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function requestEvents(db, requestId) {
  return db.prepare('SELECT status, title, description, happened_at FROM service_request_events WHERE service_request_id = ? ORDER BY id').all(requestId);
}

function addRequestEvent(db, requestId, status, title, description = null) {
  db.prepare('INSERT INTO service_request_events (service_request_id, status, title, description) VALUES (?, ?, ?, ?)')
    .run(requestId, status, title, description);
}

function registerServiceRoutes(router) {
  router.get('/api/service-requests', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const rows = getDb().prepare('SELECT id, code, status, service_type, urgency, address, created_at FROM service_requests WHERE user_id = ? ORDER BY id DESC').all(user.id);
    return ok(res, rows);
  });

  router.get('/api/service-requests/:code', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const row = getDb().prepare('SELECT * FROM service_requests WHERE code = ? AND user_id = ?').get(params.code, user.id);
    if (!row) return fail(res, 404, 'REQUEST_NOT_FOUND', 'Solicitud no encontrada.');
    return ok(res, { ...row, payload: JSON.parse(row.payload_json), events: requestEvents(getDb(), row.id) });
  });

  router.post('/api/service-requests', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['serviceType', 'address', 'description']);
      const code = requestCode();
      const db = getDb();
      const result = db.prepare(`
        INSERT INTO service_requests (code, user_id, status, service_type, urgency, address, description, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(code, user.id, 'received', payload.serviceType, payload.urgency || 'normal', payload.address, payload.description, JSON.stringify(payload));
      addRequestEvent(db, result.lastInsertRowid, 'received', 'Solicitud recibida', 'Hemos registrado la solicitud y enviado confirmación.');
      addRequestEvent(db, result.lastInsertRowid, 'reviewing', 'En revisión', 'Estamos revisando la información para asignar técnico.');
      return created(res, { code, status: 'received' });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.patch('/api/service-requests/:code/status', async (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      const db = getDb();
      const row = db.prepare('SELECT * FROM service_requests WHERE code = ? AND user_id = ?').get(params.code, user.id);
      if (!row) return fail(res, 404, 'REQUEST_NOT_FOUND', 'Solicitud no encontrada.');
      const status = payload.status || row.status;
      db.prepare('UPDATE service_requests SET status = ? WHERE id = ?').run(status, row.id);
      addRequestEvent(db, row.id, status, payload.title || `Estado actualizado: ${status}`, payload.description || null);
      return ok(res, { code: row.code, status, events: requestEvents(db, row.id) });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.post('/api/service-requests/:code/cancel', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const db = getDb();
    const row = db.prepare('SELECT * FROM service_requests WHERE code = ? AND user_id = ?').get(params.code, user.id);
    if (!row) return fail(res, 404, 'REQUEST_NOT_FOUND', 'Solicitud no encontrada.');
    db.prepare('UPDATE service_requests SET status = ? WHERE id = ?').run('cancelled', row.id);
    addRequestEvent(db, row.id, 'cancelled', 'Solicitud cancelada', 'La solicitud se ha cancelado desde la web.');
    return ok(res, { code: row.code, status: 'cancelled', events: requestEvents(db, row.id) });
  });
}

module.exports = { registerServiceRoutes };
