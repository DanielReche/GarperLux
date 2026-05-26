const { getDb } = require('../db');
const { readJson, requireFields, handleInputError } = require('../http');
const { ok, created, noContent, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');

function getActiveCart(db, userId) {
  let cart = db.prepare('SELECT * FROM carts WHERE user_id = ? AND status = ? ORDER BY id DESC LIMIT 1').get(userId, 'active');
  if (!cart) {
    const result = db.prepare('INSERT INTO carts (user_id) VALUES (?)').run(userId);
    cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(result.lastInsertRowid);
  }
  return cart;
}

function cartDto(db, cart) {
  const items = db.prepare(`
    SELECT cart_items.quantity, products.id, products.sku, products.name, products.slug, products.price, products.stock
    FROM cart_items
    JOIN products ON products.id = cart_items.product_id
    WHERE cart_items.cart_id = ?
    ORDER BY products.name
  `).all(cart.id);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { id: cart.id, status: cart.status, items, subtotal, tax: Number((subtotal * 0.21).toFixed(2)), total: Number((subtotal * 1.21).toFixed(2)) };
}

function registerCartRoutes(router) {
  router.get('/api/cart', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const db = getDb();
    return ok(res, cartDto(db, getActiveCart(db, user.id)));
  });

  router.post('/api/cart/items', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['sku']);
      const db = getDb();
      const product = db.prepare('SELECT * FROM products WHERE sku = ? OR slug = ?').get(payload.sku, payload.sku);
      if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado.');
      if (product.pro_only && user.role !== 'pro') return fail(res, 403, 'PRO_ONLY', 'Este producto requiere perfil profesional.');
      const cart = getActiveCart(db, user.id);
      db.prepare(`
        INSERT INTO cart_items (cart_id, product_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity
      `).run(cart.id, product.id, Math.max(1, Number(payload.quantity || 1)));
      db.prepare('UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cart.id);
      return created(res, cartDto(db, cart));
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.delete('/api/cart/items/:sku', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const db = getDb();
    const cart = getActiveCart(db, user.id);
    db.prepare(`
      DELETE FROM cart_items
      WHERE cart_id = ? AND product_id IN (SELECT id FROM products WHERE sku = ? OR slug = ?)
    `).run(cart.id, params.sku, params.sku);
    return noContent(res);
  });
}

module.exports = { registerCartRoutes, getActiveCart, cartDto };
