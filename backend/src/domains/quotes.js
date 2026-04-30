const { getDb } = require('../db');
const { readJson, requireFields, handleInputError } = require('../http');
const { ok, created, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');

function quoteCode() {
  return `PRE-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function registerQuoteRoutes(router) {
  router.get('/api/quotes', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const rows = getDb().prepare('SELECT id, code, status, title, total, created_at FROM quotes WHERE user_id = ? ORDER BY id DESC').all(user.id);
    return ok(res, rows);
  });

  router.get('/api/quotes/:code', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const row = getDb().prepare('SELECT * FROM quotes WHERE code = ? AND user_id = ?').get(params.code, user.id);
    if (!row) return fail(res, 404, 'QUOTE_NOT_FOUND', 'Presupuesto no encontrado.');
    return ok(res, { ...row, payload: JSON.parse(row.payload_json) });
  });

  router.post('/api/quotes', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['title']);
      const items = Array.isArray(payload.items) ? payload.items : [];
      const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
      const code = quoteCode();
      getDb().prepare('INSERT INTO quotes (code, user_id, status, title, total, payload_json) VALUES (?, ?, ?, ?, ?, ?)').run(
        code,
        user.id,
        'draft',
        payload.title,
        total,
        JSON.stringify(payload)
      );
      return created(res, { code, status: 'draft', total });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });
}

module.exports = { registerQuoteRoutes };
