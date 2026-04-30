const { getDb } = require('../db');
const { readJson, requireFields, handleInputError } = require('../http');
const { ok, created, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');

function code(prefix) {
  return `${prefix}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function registerCommerceRoutes(router) {
  router.get('/api/catalog/products/:sku/reviews', (_req, res, { params }) => {
    const rows = getDb().prepare(`
      SELECT reviews.*
      FROM reviews
      JOIN products ON products.id = reviews.product_id
      WHERE (products.sku = ? OR products.slug = ?) AND reviews.status IN ('pending','published')
      ORDER BY reviews.created_at DESC
    `).all(params.sku, params.sku);
    return ok(res, rows.map((row) => ({ ...row, tags: parseJson(row.tags_json, []) })));
  });

  router.post('/api/reviews', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['sku', 'rating', 'title', 'body', 'displayName']);
      const product = getDb().prepare('SELECT id FROM products WHERE sku = ? OR slug = ?').get(payload.sku, payload.sku);
      if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado.');
      const result = getDb().prepare(`
        INSERT INTO reviews (user_id, product_id, order_code, rating, title, body, display_name, tags_json, verified_purchase, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        user.id,
        product.id,
        payload.orderCode || null,
        Number(payload.rating),
        payload.title,
        payload.body,
        payload.displayName,
        JSON.stringify(payload.tags || []),
        payload.verifiedPurchase ? 1 : 0,
        'pending'
      );
      return created(res, { id: result.lastInsertRowid, status: 'pending' });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/returns', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const rows = getDb().prepare('SELECT * FROM returns WHERE user_id = ? ORDER BY id DESC').all(user.id);
    return ok(res, rows.map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) })));
  });

  router.post('/api/returns', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['orderCode', 'reason', 'shippingMethod', 'refundMethod']);
      const returnCode = code('DEV');
      getDb().prepare(`
        INSERT INTO returns (code, user_id, order_code, status, reason, shipping_method, refund_method, amount, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        returnCode,
        user.id,
        payload.orderCode,
        'requested',
        payload.reason,
        payload.shippingMethod,
        payload.refundMethod,
        Number(payload.amount || 0),
        JSON.stringify(payload)
      );
      return created(res, { code: returnCode, status: 'requested' });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/recurring-orders', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const rows = getDb().prepare('SELECT * FROM recurring_orders WHERE user_id = ? ORDER BY id DESC').all(user.id);
    return ok(res, rows.map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) })));
  });

  router.post('/api/recurring-orders', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['name', 'frequency']);
      const recurringCode = code('REC');
      getDb().prepare(`
        INSERT INTO recurring_orders (code, user_id, name, frequency, next_run_at, status, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(recurringCode, user.id, payload.name, payload.frequency, payload.nextRunAt || null, 'active', JSON.stringify(payload));
      return created(res, { code: recurringCode, status: 'active' });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });
}

module.exports = { registerCommerceRoutes };
