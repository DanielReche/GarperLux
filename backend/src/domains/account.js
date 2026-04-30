const { getDb } = require('../db');
const { readJson, requireFields, handleInputError } = require('../http');
const { ok, created, noContent, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');

function registerAccountRoutes(router) {
  router.patch('/api/account/profile', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      const fullName = payload.fullName || [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim() || user.full_name;
      getDb().prepare('UPDATE users SET full_name = ?, phone = COALESCE(?, phone), fiscal_id = COALESCE(?, fiscal_id) WHERE id = ?')
        .run(fullName, payload.phone || null, payload.fiscalId || null, user.id);
      return ok(res, { id: user.id, fullName, phone: payload.phone || user.phone, fiscalId: payload.fiscalId || user.fiscal_id });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/account/fiscal-profile', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    return ok(res, getDb().prepare('SELECT * FROM fiscal_profiles WHERE user_id = ?').get(user.id) || null);
  });

  router.put('/api/account/fiscal-profile', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['legalName', 'taxId']);
      getDb().prepare(`
        INSERT INTO fiscal_profiles (
          user_id, legal_name, tax_id, legal_form, vat_regime, cnae, license_number, license_expires,
          license_region, fiscal_address, postal_code, city, province, country, iban, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          legal_name = excluded.legal_name,
          tax_id = excluded.tax_id,
          legal_form = excluded.legal_form,
          vat_regime = excluded.vat_regime,
          cnae = excluded.cnae,
          license_number = excluded.license_number,
          license_expires = excluded.license_expires,
          license_region = excluded.license_region,
          fiscal_address = excluded.fiscal_address,
          postal_code = excluded.postal_code,
          city = excluded.city,
          province = excluded.province,
          country = excluded.country,
          iban = excluded.iban,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        user.id,
        payload.legalName,
        payload.taxId,
        payload.legalForm || null,
        payload.vatRegime || null,
        payload.cnae || null,
        payload.licenseNumber || null,
        payload.licenseExpires || null,
        payload.licenseRegion || null,
        payload.fiscalAddress || null,
        payload.postalCode || null,
        payload.city || null,
        payload.province || null,
        payload.country || 'España',
        payload.iban || null
      );
      return ok(res, getDb().prepare('SELECT * FROM fiscal_profiles WHERE user_id = ?').get(user.id));
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/account/addresses', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    return ok(res, getDb().prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(user.id));
  });

  router.post('/api/account/addresses', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['label', 'recipient', 'line1', 'city', 'province', 'postalCode']);
      const result = getDb().prepare(`
        INSERT INTO addresses (user_id, label, recipient, line1, city, province, postal_code, phone, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user.id, payload.label, payload.recipient, payload.line1, payload.city, payload.province, payload.postalCode, payload.phone || null, payload.isDefault ? 1 : 0);
      return created(res, { id: result.lastInsertRowid });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/account/payment-methods', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    return ok(res, getDb().prepare('SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(user.id));
  });

  router.post('/api/account/payment-methods', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['type', 'label']);
      const db = getDb();
      if (payload.isDefault) db.prepare('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?').run(user.id);
      const result = db.prepare(`
        INSERT INTO payment_methods (user_id, type, label, last4, brand, exp_month, exp_year, holder, allow_recurring, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        user.id,
        payload.type,
        payload.label,
        payload.last4 || null,
        payload.brand || null,
        payload.expMonth || null,
        payload.expYear || null,
        payload.holder || null,
        payload.allowRecurring ? 1 : 0,
        payload.isDefault ? 1 : 0
      );
      return created(res, db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(result.lastInsertRowid));
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.patch('/api/account/payment-methods/:id/default', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const db = getDb();
    const method = db.prepare('SELECT id FROM payment_methods WHERE id = ? AND user_id = ?').get(params.id, user.id);
    if (!method) return fail(res, 404, 'PAYMENT_METHOD_NOT_FOUND', 'Método de pago no encontrado.');
    db.prepare('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?').run(user.id);
    db.prepare('UPDATE payment_methods SET is_default = 1 WHERE id = ?').run(params.id);
    return ok(res, db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(params.id));
  });

  router.delete('/api/account/payment-methods/:id', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    getDb().prepare('DELETE FROM payment_methods WHERE id = ? AND user_id = ?').run(params.id, user.id);
    return noContent(res);
  });

  router.get('/api/account/favorites', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const rows = getDb().prepare(`
      SELECT products.id, products.sku, products.name, products.slug, products.price
      FROM favorites
      JOIN products ON products.id = favorites.product_id
      WHERE favorites.user_id = ?
      ORDER BY favorites.created_at DESC
    `).all(user.id);
    return ok(res, rows);
  });

  router.post('/api/account/favorites/:sku', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const db = getDb();
    const product = db.prepare('SELECT id FROM products WHERE sku = ? OR slug = ?').get(params.sku, params.sku);
    if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado.');
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)').run(user.id, product.id);
    return created(res, { sku: params.sku });
  });

  router.delete('/api/account/favorites/:sku', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    getDb().prepare(`
      DELETE FROM favorites
      WHERE user_id = ? AND product_id IN (SELECT id FROM products WHERE sku = ? OR slug = ?)
    `).run(user.id, params.sku, params.sku);
    return noContent(res);
  });
}

module.exports = { registerAccountRoutes };
