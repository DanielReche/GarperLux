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

  router.get('/api/recurring-orders/:code', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const row = getDb().prepare('SELECT * FROM recurring_orders WHERE code = ? AND user_id = ?').get(params.code, user.id);
    if (!row) return fail(res, 404, 'RECURRING_NOT_FOUND', 'Pedido recurrente no encontrado.');
    return ok(res, { ...row, payload: parseJson(row.payload_json, {}) });
  });

  router.delete('/api/recurring-orders/:code', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const result = getDb().prepare('DELETE FROM recurring_orders WHERE code = ? AND user_id = ?').run(params.code, user.id);
    if (!result.changes) return fail(res, 404, 'RECURRING_NOT_FOUND', 'Pedido recurrente no encontrado.');
    return ok(res, { code: params.code, deleted: true });
  });

  router.get('/api/account/reorder-suggestions', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const fullUser = getDb().prepare('SELECT pro_discount FROM users WHERE id = ?').get(user.id);
    const proDiscount = Number(fullUser?.pro_discount || 0);
    const orders = getDb().prepare(`SELECT id, code, payload_json, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC`).all(user.id);
    const aggregate = new Map();
    const now = Date.now();
    for (const order of orders) {
      const payload = parseJson(order.payload_json, {});
      const items = payload.cart?.items || [];
      const orderDate = new Date(String(order.created_at).replace(' ', 'T')).getTime();
      const ageDays = isFinite(orderDate) ? Math.max(0, Math.round((now - orderDate) / 86400000)) : null;
      for (const item of items) {
        if (!item.sku) continue;
        const existing = aggregate.get(item.sku) || { sku: item.sku, name: item.name, totalQty: 0, lastQty: 0, lastAtDays: ageDays, occurrences: 0, unitPrice: item.proPrice || item.price };
        existing.totalQty += Number(item.quantity || 0);
        existing.occurrences += 1;
        if (existing.lastAtDays == null || (ageDays != null && ageDays < existing.lastAtDays)) {
          existing.lastAtDays = ageDays;
          existing.lastQty = Number(item.quantity || 0);
        }
        aggregate.set(item.sku, existing);
      }
    }

    const enriched = [];
    for (const item of aggregate.values()) {
      const product = getDb().prepare('SELECT id, sku, name, price, stock FROM products WHERE sku = ?').get(item.sku);
      if (!product) continue;
      const unit = proDiscount > 0 ? Math.round(product.price * (1 - proDiscount / 100) * 100) / 100 : product.price;
      const avgPerOrder = item.totalQty / item.occurrences;
      // Heurística simple: tasa diaria ~ totalQty / max(lastAtDays, 30); previsión = lastQty / tasa
      const dailyRate = item.totalQty / Math.max(item.lastAtDays || 30, 30);
      const predictedDaysLeft = dailyRate > 0 ? Math.round(item.lastQty / dailyRate) : null;
      enriched.push({
        sku: product.sku,
        name: product.name,
        productId: product.id,
        stock: product.stock,
        unitPrice: unit,
        originalPrice: product.price,
        suggestedQty: Math.max(1, Math.round(avgPerOrder)),
        lastQty: item.lastQty,
        lastAtDays: item.lastAtDays,
        occurrences: item.occurrences,
        predictedDaysLeft,
      });
    }
    enriched.sort((a, b) => b.occurrences - a.occurrences || (a.lastAtDays || 999) - (b.lastAtDays || 999));
    return ok(res, enriched.slice(0, 12));
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
