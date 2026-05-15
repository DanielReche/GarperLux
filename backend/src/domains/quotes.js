const { getDb } = require('../db');
const { readJson, requireFields, handleInputError } = require('../http');
const { ok, created, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');

function quoteCode() {
  return `PRE-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function registerQuoteRoutes(router) {
  router.get('/api/quotes', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const rows = await getDb().prepare('SELECT id, code, status, title, total, created_at FROM quotes WHERE user_id = ? ORDER BY id DESC').all(user.id);
    return ok(res, rows);
  });

  router.get('/api/quotes/:code', async (req, res, { params }) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const row = await getDb().prepare('SELECT * FROM quotes WHERE code = ? AND user_id = ?').get(params.code, user.id);
    if (!row) return fail(res, 404, 'QUOTE_NOT_FOUND', 'Presupuesto no encontrado.');
    return ok(res, { ...row, payload: JSON.parse(row.payload_json) });
  });

  router.post('/api/quotes', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['title']);
      const items = Array.isArray(payload.items) ? payload.items : [];
      const subtotalCalc = items.reduce((sum, item) => {
        const lineTotal = Number(item.lineTotal);
        if (Number.isFinite(lineTotal)) return sum + lineTotal;
        const unit = Number(item.unitPrice ?? item.price ?? 0);
        return sum + unit * Number(item.quantity || 1);
      }, 0);
      const subtotal = Number(payload.subtotal ?? subtotalCalc);
      const tax = Number(payload.tax ?? subtotal * 0.21);
      const total = Number(payload.total ?? subtotal + tax);
      const status = ['draft','sent','accepted','rejected'].includes(payload.status) ? payload.status : 'draft';
      const code = quoteCode();
      await getDb().prepare('INSERT INTO quotes (code, user_id, status, title, total, payload_json) VALUES (?, ?, ?, ?, ?, ?)').run(
        code,
        user.id,
        status,
        payload.title,
        total,
        JSON.stringify({ ...payload, subtotal, tax, total, status })
      );
      return created(res, { code, status, total });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });
}

module.exports = { registerQuoteRoutes };
