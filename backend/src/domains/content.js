const { getDb } = require('../db');
const { readJson } = require('../http');
const { ok, created, noContent, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');

function parseJsonSafe(val) { try { return val ? JSON.parse(val) : []; } catch(e) { return []; } }

function registerContentRoutes(router) {
  router.get('/api/content/tutorials', async (_req, res) => {
    const rows = await getDb().prepare('SELECT * FROM tutorials ORDER BY title').all();
    return ok(res, rows.map((row) => ({ ...row, relatedProductSkus: parseJsonSafe(row.related_product_skus) })));
  });

  router.get('/api/account/saved-tutorials', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const rows = await getDb().prepare(`
      SELECT tutorials.*, saved_tutorials.progress, saved_tutorials.notes, saved_tutorials.saved_at
      FROM saved_tutorials
      JOIN tutorials ON tutorials.id = saved_tutorials.tutorial_id
      WHERE saved_tutorials.user_id = ?
      ORDER BY saved_tutorials.saved_at DESC
    `).all(user.id);
    return ok(res, rows.map((row) => ({ ...row, relatedProductSkus: parseJsonSafe(row.related_product_skus) })));
  });

  router.post('/api/account/saved-tutorials/:slug', async (req, res, { params }) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const tutorial = await getDb().prepare('SELECT id FROM tutorials WHERE slug = ?').get(params.slug);
    if (!tutorial) return fail(res, 404, 'TUTORIAL_NOT_FOUND', 'Tutorial no encontrado.');
    const payload = await readJson(req).catch(() => ({}));
    await getDb().prepare(`
      INSERT INTO saved_tutorials (user_id, tutorial_id, progress, notes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, tutorial_id) DO UPDATE SET
        progress = excluded.progress,
        notes = excluded.notes,
        saved_at = CURRENT_TIMESTAMP
    `).run(user.id, tutorial.id, payload.progress || 0, payload.notes || null);
    return created(res, { slug: params.slug, progress: payload.progress || 0 });
  });

  router.delete('/api/account/saved-tutorials/:slug', async (req, res, { params }) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    await getDb().prepare(`
      DELETE FROM saved_tutorials
      WHERE user_id = ? AND tutorial_id IN (SELECT id FROM tutorials WHERE slug = ?)
    `).run(user.id, params.slug);
    return noContent(res);
  });
}

module.exports = { registerContentRoutes };
