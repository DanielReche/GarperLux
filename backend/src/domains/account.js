const { getDb } = require('../db');
const { readJson, requireFields, handleInputError } = require('../http');
const { ok, created, noContent, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');
const { publicUser } = require('./auth');

function registerAccountRoutes(router) {
  router.get('/api/account/profile', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    return ok(res, publicUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(user.id)));
  });

  router.patch('/api/account/profile', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      const db = getDb();
      const current = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      const fullName = payload.fullName || [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim() || current.full_name;
      const email = payload.email ? String(payload.email).toLowerCase() : current.email;
      const birthDate = Object.prototype.hasOwnProperty.call(payload, 'birthDate')
        ? payload.birthDate || payload.birth_date || null
        : (payload.birth_date || current.birth_date);
      // end TEMP LOGS
      const marketingEmail = Object.prototype.hasOwnProperty.call(payload, 'marketingEmail') ? (payload.marketingEmail ? 1 : 0) : current.marketing_email;
      const orderNotifications = Object.prototype.hasOwnProperty.call(payload, 'orderNotifications') ? (payload.orderNotifications ? 1 : 0) : current.order_notifications;
      const tutorialReminders = Object.prototype.hasOwnProperty.call(payload, 'tutorialReminders') ? (payload.tutorialReminders ? 1 : 0) : current.tutorial_reminders;
      const smsUrgency = Object.prototype.hasOwnProperty.call(payload, 'smsUrgency') ? (payload.smsUrgency ? 1 : 0) : current.sms_urgency;

      try {
        db.prepare(`
          UPDATE users SET
            full_name = ?,
            email = ?,
            phone = COALESCE(?, phone),
            fiscal_id = COALESCE(?, fiscal_id),
            birth_date = ?,
            marketing_email = ?,
            order_notifications = ?,
            tutorial_reminders = ?,
            sms_urgency = ?
          WHERE id = ?
        `).run(fullName, email, payload.phone || null, payload.fiscalId || null, birthDate, marketingEmail, orderNotifications, tutorialReminders, smsUrgency, user.id);
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) {
          return fail(res, 409, 'EMAIL_EXISTS', 'Ya existe una cuenta con ese email.');
        }
        throw error;
      }
      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      return ok(res, publicUser(updated));
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

  router.get('/api/account/addresses/:id', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const address = getDb().prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(params.id, user.id);
    if (!address) return fail(res, 404, 'ADDRESS_NOT_FOUND', 'Dirección no encontrada.');
    return ok(res, address);
  });

  router.patch('/api/account/addresses/:id', async (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const current = getDb().prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(params.id, user.id);
      if (!current) return fail(res, 404, 'ADDRESS_NOT_FOUND', 'Dirección no encontrada.');
      const payload = await readJson(req);
      const normalized = {
        label: String(payload.label || current.label || '').trim(),
        recipient: String(payload.recipient || current.recipient || '').trim(),
        line1: String(payload.line1 || current.line1 || '').trim(),
        city: String(payload.city || current.city || '').trim(),
        province: String(payload.province || current.province || '').trim(),
        postalCode: String(payload.postalCode || payload.postal_code || current.postal_code || '').trim(),
        phone: Object.prototype.hasOwnProperty.call(payload, 'phone') ? (payload.phone || null) : current.phone,
        isDefault: Object.prototype.hasOwnProperty.call(payload, 'isDefault') ? !!payload.isDefault : !!current.is_default,
        isBilling: Object.prototype.hasOwnProperty.call(payload, 'isBilling') ? !!payload.isBilling : !!current.is_billing,
      };
      requireFields(normalized, ['line1', 'city', 'province', 'postalCode']);
      const label = normalized.label || normalized.line1 || 'Dirección';
      const recipient = normalized.recipient || user.full_name;
      if (!recipient) return fail(res, 422, 'MISSING_FIELD', 'El destinatario es obligatorio.');
      const db = getDb();
      if (normalized.isDefault) db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(user.id);
      db.prepare(`
        UPDATE addresses SET
          label = ?,
          recipient = ?,
          line1 = ?,
          city = ?,
          province = ?,
          postal_code = ?,
          phone = ?,
          is_default = ?,
          is_billing = ?
        WHERE id = ? AND user_id = ?
      `).run(label, recipient, normalized.line1, normalized.city, normalized.province, normalized.postalCode, normalized.phone, normalized.isDefault ? 1 : 0, normalized.isBilling ? 1 : 0, params.id, user.id);
      return ok(res, db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(params.id, user.id));
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.patch('/api/account/addresses/:id/default', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const db = getDb();
    const address = db.prepare('SELECT id FROM addresses WHERE id = ? AND user_id = ?').get(params.id, user.id);
    if (!address) return fail(res, 404, 'ADDRESS_NOT_FOUND', 'Dirección no encontrada.');
    db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(user.id);
    db.prepare('UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?').run(params.id, user.id);
    return ok(res, db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(params.id, user.id));
  });

  router.delete('/api/account/addresses/:id', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const result = getDb().prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(params.id, user.id);
    if (!result.changes) return fail(res, 404, 'ADDRESS_NOT_FOUND', 'Dirección no encontrada.');
    return noContent(res);
  });

  router.post('/api/account/addresses', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      const normalized = {
        label: String(payload.label || '').trim(),
        recipient: String(payload.recipient || '').trim(),
        line1: String(payload.line1 || '').trim(),
        city: String(payload.city || '').trim(),
        province: String(payload.province || '').trim(),
        postalCode: String(payload.postalCode || payload.postal_code || '').trim(),
        phone: payload.phone || null,
        isDefault: !!payload.isDefault,
        isBilling: !!payload.isBilling,
      };

      requireFields(normalized, ['line1', 'city', 'province', 'postalCode']);
      const label = String(normalized.label || normalized.line1 || 'Dirección').trim();
      const recipient = String(normalized.recipient || user.full_name || '').trim();
      if (!recipient) return fail(res, 422, 'MISSING_FIELD', 'El destinatario es obligatorio.');
      const result = getDb().prepare(`
        INSERT INTO addresses (user_id, label, recipient, line1, city, province, postal_code, phone, is_default, is_billing)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user.id, label, recipient, normalized.line1, normalized.city, normalized.province, normalized.postalCode, normalized.phone, normalized.isDefault ? 1 : 0, normalized.isBilling ? 1 : 0);
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
