const { getDb } = require('../db');
const { ok } = require('../response');
const { requireAuth } = require('../middleware/auth');

function registerDocumentRoutes(router) {
  router.get('/api/documents', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const url = new URL(req.url, 'http://localhost');
    const type = url.searchParams.get('type');
    const params = [user.id];
    let where = 'WHERE user_id = ?';
    if (type) {
      where += ' AND type = ?';
      params.push(type);
    }
    const rows = getDb().prepare(`SELECT * FROM documents ${where} ORDER BY issued_at DESC`).all(...params);
    return ok(res, rows);
  });
}

module.exports = { registerDocumentRoutes };
