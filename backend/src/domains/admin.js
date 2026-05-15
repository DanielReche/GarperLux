const { getDb } = require('../db');
const { readJson, requireFields, handleInputError } = require('../http');
const { ok, created, fail } = require('../response');
const { requireRole } = require('../middleware/auth');

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

async function requireAdmin(req, res) {
  return await requireRole(req, res, ['admin']);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `producto-${Date.now()}`;
}

async function audit(db, admin, action, entityType, entityId, payload = {}) {
  await db.prepare(`
    INSERT INTO admin_audit (admin_user_id, action, entity_type, entity_id, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(admin.id, action, entityType, String(entityId), JSON.stringify(payload));
}

async function categoryId(db, payload) {
  if (payload.categoryId) return Number(payload.categoryId);
  if (payload.categorySlug) {
    const row = await db.prepare('SELECT id FROM categories WHERE slug = ?').get(payload.categorySlug);
    if (row) return row.id;
  }
  return null;
}

async function brandId(db, payload) {
  if (payload.brandId) return Number(payload.brandId);
  if (payload.brandSlug) {
    const row = await db.prepare('SELECT id FROM brands WHERE slug = ?').get(payload.brandSlug);
    if (row) return row.id;
  }
  return null;
}

async function orderEvents(db, orderId) {
  return await db.prepare('SELECT status, title, description, happened_at FROM order_events WHERE order_id = ? ORDER BY id').all(orderId);
}

async function serviceEvents(db, requestId) {
  return await db.prepare('SELECT status, title, description, happened_at FROM service_request_events WHERE service_request_id = ? ORDER BY id').all(requestId);
}

function registerAdminRoutes(router) {
  router.get('/api/admin/summary', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const db = getDb();
    return ok(res, {
      orders: Number(await db.prepare('SELECT COUNT(*) AS total FROM orders').get().total),
      pendingOrders: Number(await db.prepare("SELECT COUNT(*) AS total FROM orders WHERE status NOT IN ('completed','cancelled')").get().total),
      serviceRequests: Number(await db.prepare('SELECT COUNT(*) AS total FROM service_requests').get().total),
      openServiceRequests: Number(await db.prepare("SELECT COUNT(*) AS total FROM service_requests WHERE status NOT IN ('resolved','cancelled')").get().total),
      pendingReviews: Number(await db.prepare("SELECT COUNT(*) AS total FROM reviews WHERE status = 'pending'").get().total),
      openReturns: Number(await db.prepare("SELECT COUNT(*) AS total FROM returns WHERE status NOT IN ('refunded','rejected')").get().total),
      newMessages: Number(await db.prepare("SELECT COUNT(*) AS total FROM contact_messages WHERE status = 'new'").get().total),
      newApplications: Number(await db.prepare("SELECT COUNT(*) AS total FROM job_applications WHERE status = 'received'").get().total),
    });
  });

  router.get('/api/admin/products', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const url = new URL(req.url, 'http://localhost');
    const q = `%${(url.searchParams.get('q') || '').trim()}%`;
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 30)));
    const offset = (page - 1) * limit;
    const params = [];
    const where = [];
    if (q !== '%%') {
      where.push('(products.name LIKE ? OR products.sku LIKE ? OR products.description LIKE ?)');
      params.push(q, q, q);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const db = getDb();
    const total = Number(await db.prepare(`
      SELECT COUNT(*) AS total
      FROM products
      JOIN categories ON categories.id = products.category_id
      JOIN brands ON brands.id = products.brand_id
      ${whereSql}
    `).get(...params).total);
    const rows = await db.prepare(`
      SELECT products.*, categories.slug AS category_slug, categories.name AS category_name,
             brands.slug AS brand_slug, brands.name AS brand_name
      FROM products
      JOIN categories ON categories.id = products.category_id
      JOIN brands ON brands.id = products.brand_id
      ${whereSql}
      ORDER BY products.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    return ok(res, rows.map((row) => ({ ...row, specs: parseJson(row.specs_json, {}), pro_only: Boolean(row.pro_only) })), { page, limit, total });
  });

  router.post('/api/admin/products', async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['sku', 'name', 'price', 'stock']);
      const db = getDb();
      const resolvedCategoryId = await categoryId(db, payload);
      const resolvedBrandId = await brandId(db, payload);
      if (!resolvedCategoryId) return fail(res, 422, 'CATEGORY_REQUIRED', 'Categoría no encontrada.');
      if (!resolvedBrandId) return fail(res, 422, 'BRAND_REQUIRED', 'Marca no encontrada.');
      const slug = payload.slug || slugify(payload.name);
      const result = await db.prepare(`
        INSERT INTO products (sku, name, slug, category_id, brand_id, price, tax_rate, stock, safety_level, pro_only, description, specs_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.sku,
        payload.name,
        slug,
        resolvedCategoryId,
        resolvedBrandId,
        Number(payload.price),
        Number(payload.taxRate || 21),
        Number(payload.stock),
        payload.safetyLevel || 'basic',
        payload.proOnly ? 1 : 0,
        payload.description || '',
        JSON.stringify(payload.specs || {})
      );
      await audit(db, admin, 'create', 'product', payload.sku, payload);
      return created(res, { id: result.lastInsertRowid, sku: payload.sku, slug });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.patch('/api/admin/products/:sku', async (req, res, { params }) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const payload = await readJson(req);
      const db = getDb();
      const row = await db.prepare('SELECT * FROM products WHERE sku = ? OR slug = ?').get(params.sku, params.sku);
      if (!row) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado.');
      const nextCategoryId = await categoryId(db, payload) || row.category_id;
      const nextBrandId = await brandId(db, payload) || row.brand_id;
      await db.prepare(`
        UPDATE products
        SET sku = ?, name = ?, slug = ?, category_id = ?, brand_id = ?, price = ?, tax_rate = ?,
            stock = ?, safety_level = ?, pro_only = ?, description = ?, specs_json = ?
        WHERE id = ?
      `).run(
        payload.sku || row.sku,
        payload.name || row.name,
        payload.slug || row.slug,
        nextCategoryId,
        nextBrandId,
        payload.price === undefined ? row.price : Number(payload.price),
        payload.taxRate === undefined ? row.tax_rate : Number(payload.taxRate),
        payload.stock === undefined ? row.stock : Number(payload.stock),
        payload.safetyLevel || row.safety_level,
        payload.proOnly === undefined ? row.pro_only : payload.proOnly ? 1 : 0,
        payload.description === undefined ? row.description : payload.description,
        JSON.stringify(payload.specs === undefined ? parseJson(row.specs_json, {}) : payload.specs),
        row.id
      );
      await audit(db, admin, 'update', 'product', row.sku, payload);
      return ok(res, await db.prepare('SELECT * FROM products WHERE id = ?').get(row.id));
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.patch('/api/admin/products/:sku/stock', async (req, res, { params }) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const payload = await readJson(req);
      const db = getDb();
      const row = await db.prepare('SELECT * FROM products WHERE sku = ? OR slug = ?').get(params.sku, params.sku);
      if (!row) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado.');
      const stock = payload.stock === undefined ? row.stock + Number(payload.delta || 0) : Number(payload.stock);
      await db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(Math.max(0, stock), row.id);
      await audit(db, admin, 'stock', 'product', row.sku, { before: row.stock, after: Math.max(0, stock) });
      return ok(res, await db.prepare('SELECT * FROM products WHERE id = ?').get(row.id));
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/admin/audit', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const rows = await getDb().prepare(`
      SELECT admin_audit.*, users.full_name AS admin_name
      FROM admin_audit
      LEFT JOIN users ON users.id = admin_audit.admin_user_id
      ORDER BY admin_audit.id DESC
      LIMIT 100
    `).all();
    return ok(res, rows.map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) })));
  });

  router.get('/api/admin/orders', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const rows = await getDb().prepare(`
      SELECT orders.*, users.full_name AS customer_name, users.email AS customer_email
      FROM orders
      LEFT JOIN users ON users.id = orders.user_id
      ORDER BY orders.id DESC
      LIMIT 100
    `).all();
    return ok(res, rows.map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) })));
  });

  router.patch('/api/admin/orders/:code/status', async (req, res, { params }) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const payload = await readJson(req);
      const db = getDb();
      const row = await db.prepare('SELECT * FROM orders WHERE code = ?').get(params.code);
      if (!row) return fail(res, 404, 'ORDER_NOT_FOUND', 'Pedido no encontrado.');
      const status = payload.status || row.status;
      await db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, row.id);
      await db.prepare('INSERT INTO order_events (order_id, status, title, description) VALUES (?, ?, ?, ?)')
        .run(row.id, status, payload.title || `Estado actualizado: ${status}`, payload.description || 'Actualizado desde administración.');
      await audit(db, admin, 'status', 'order', row.code, { status });
      return ok(res, { ...row, status, events: await orderEvents(db, row.id) });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/admin/service-requests', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const rows = await getDb().prepare(`
      SELECT service_requests.*, users.full_name AS customer_name, users.email AS customer_email
      FROM service_requests
      LEFT JOIN users ON users.id = service_requests.user_id
      ORDER BY service_requests.id DESC
      LIMIT 100
    `).all();
    return ok(res, rows.map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) })));
  });

  router.patch('/api/admin/service-requests/:code/status', async (req, res, { params }) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const payload = await readJson(req);
      const db = getDb();
      const row = await db.prepare('SELECT * FROM service_requests WHERE code = ?').get(params.code);
      if (!row) return fail(res, 404, 'REQUEST_NOT_FOUND', 'Solicitud no encontrada.');
      const status = payload.status || row.status;
      await db.prepare('UPDATE service_requests SET status = ? WHERE id = ?').run(status, row.id);
      await db.prepare('INSERT INTO service_request_events (service_request_id, status, title, description) VALUES (?, ?, ?, ?)')
        .run(row.id, status, payload.title || `Estado actualizado: ${status}`, payload.description || 'Actualizado desde administración.');
      await audit(db, admin, 'status', 'service_request', row.code, { status });
      return ok(res, { ...row, status, events: await serviceEvents(db, row.id) });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/admin/reviews', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const rows = await getDb().prepare(`
      SELECT reviews.*, products.sku, products.name AS product_name, users.email AS customer_email
      FROM reviews
      JOIN products ON products.id = reviews.product_id
      LEFT JOIN users ON users.id = reviews.user_id
      ORDER BY reviews.id DESC
      LIMIT 100
    `).all();
    return ok(res, rows.map((row) => ({ ...row, tags: parseJson(row.tags_json, []) })));
  });

  router.patch('/api/admin/reviews/:id/status', async (req, res, { params }) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const payload = await readJson(req);
      const status = payload.status || 'published';
      const db = getDb();
      const result = await db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, params.id);
      if (result.changes === 0) return fail(res, 404, 'REVIEW_NOT_FOUND', 'Reseña no encontrada.');
      await audit(db, admin, 'status', 'review', params.id, { status });
      return ok(res, await db.prepare('SELECT * FROM reviews WHERE id = ?').get(params.id));
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/admin/returns', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const rows = await getDb().prepare(`
      SELECT returns.*, users.full_name AS customer_name, users.email AS customer_email
      FROM returns
      LEFT JOIN users ON users.id = returns.user_id
      ORDER BY returns.id DESC
      LIMIT 100
    `).all();
    return ok(res, rows.map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) })));
  });

  router.patch('/api/admin/returns/:code/status', async (req, res, { params }) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const payload = await readJson(req);
      const status = payload.status || 'reviewing';
      const db = getDb();
      const result = await db.prepare('UPDATE returns SET status = ? WHERE code = ?').run(status, params.code);
      if (result.changes === 0) return fail(res, 404, 'RETURN_NOT_FOUND', 'Devolución no encontrada.');
      await audit(db, admin, 'status', 'return', params.code, { status });
      return ok(res, await db.prepare('SELECT * FROM returns WHERE code = ?').get(params.code));
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/admin/contact-messages', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    return ok(res, (await getDb().prepare('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 100').all()).map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) })));
  });

  router.patch('/api/admin/contact-messages/:code/status', async (req, res, { params }) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const payload = await readJson(req);
      const result = await getDb().prepare('UPDATE contact_messages SET status = ? WHERE code = ?').run(payload.status || 'in_progress', params.code);
      if (result.changes === 0) return fail(res, 404, 'MESSAGE_NOT_FOUND', 'Mensaje no encontrado.');
      await audit(getDb(), admin, 'status', 'contact_message', params.code, { status: payload.status || 'in_progress' });
      return ok(res, await getDb().prepare('SELECT * FROM contact_messages WHERE code = ?').get(params.code));
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/admin/job-applications', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    return ok(res, (await getDb().prepare('SELECT * FROM job_applications ORDER BY id DESC LIMIT 100').all()).map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) })));
  });

  router.patch('/api/admin/job-applications/:code/status', async (req, res, { params }) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const payload = await readJson(req);
      const result = await getDb().prepare('UPDATE job_applications SET status = ? WHERE code = ?').run(payload.status || 'reviewing', params.code);
      if (result.changes === 0) return fail(res, 404, 'APPLICATION_NOT_FOUND', 'Candidatura no encontrada.');
      await audit(getDb(), admin, 'status', 'job_application', params.code, { status: payload.status || 'reviewing' });
      return ok(res, await getDb().prepare('SELECT * FROM job_applications WHERE code = ?').get(params.code));
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });
}

module.exports = { registerAdminRoutes };
