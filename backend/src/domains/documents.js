const { getDb } = require('../db');
const { ok, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function decorate(row) {
  if (!row) return row;
  return { ...row, payload: parseJson(row.payload_json, {}) };
}

function registerDocumentRoutes(router) {
  router.get('/api/documents', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const url = new URL(req.url, 'http://localhost');
    const type = url.searchParams.get('type');
    const params = [user.id];
    let where = 'WHERE user_id = ?';
    if (type) {
      where += ' AND type = ?';
      params.push(type);
    }
    const rows = await getDb().prepare(`SELECT * FROM documents ${where} ORDER BY issued_at DESC`).all(...params);
    return ok(res, rows.map(decorate));
  });

  router.get('/api/documents/summary', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const db = getDb();
    const row = async (sql, ...args) => await db.prepare(sql).get(user.id, ...args);
    // Trimestre en curso = año/trimestre del max(issued_at) del usuario, fallback a now.
    const stats = {
      invoices: {
        total: row(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS sum FROM documents WHERE user_id = ? AND type = 'invoice'`),
        quarter: row(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS sum FROM documents WHERE user_id = ? AND type = 'invoice' AND issued_at >= date('now','start of month','-2 months','start of month')`),
        pending: row(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS sum FROM documents WHERE user_id = ? AND type = 'invoice' AND json_extract(payload_json,'$.paid') = 0`),
      },
      delivery_notes: {
        total: row(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS sum FROM documents WHERE user_id = ? AND type = 'delivery_note'`),
        month: row(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS sum FROM documents WHERE user_id = ? AND type = 'delivery_note' AND issued_at >= date('now','start of month')`),
      },
    };
    return ok(res, stats);
  });

  router.get('/api/documents/:code', async (req, res, { params }) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const row = await getDb().prepare('SELECT * FROM documents WHERE code = ? AND user_id = ?').get(params.code, user.id);
    if (!row) return fail(res, 404, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado.');
    return ok(res, decorate(row));
  });
}

module.exports = { registerDocumentRoutes };
