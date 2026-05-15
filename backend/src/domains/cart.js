const { getDb } = require('../db');
const { readJson, requireFields, handleInputError } = require('../http');
const { ok, created, noContent, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');

async function getActiveCart(db, userId) {
  let cart = await db.prepare('SELECT * FROM carts WHERE user_id = ? AND status = ? ORDER BY id DESC LIMIT 1').get(userId, 'active');
  if (!cart) {
    const result = await db.prepare('INSERT INTO carts (user_id) VALUES (?)').run(userId);
    cart = await db.prepare('SELECT * FROM carts WHERE id = ?').get(result.lastInsertRowid);
  }
  return cart;
}

async function cartDto(db, cart) {
  const items = (await db.prepare(`
    SELECT cart_items.quantity, products.id, products.sku, products.name, products.slug, products.price, products.stock, products.specs_json
    FROM cart_items
    JOIN products ON products.id = cart_items.product_id
    WHERE cart_items.cart_id = ?
    ORDER BY products.name
  `).all(cart.id)).map(item => {
    let image = null;
    if (item.specs_json) {
      try {
        const specs = typeof item.specs_json === 'string' ? JSON.parse(item.specs_json) : item.specs_json;
        image = specs._images?.[0] || null;
      } catch (e) {}
    }
    return { ...item, image };
  });
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { id: cart.id, status: cart.status, items, subtotal, tax: Number((subtotal * 0.21).toFixed(2)), total: Number((subtotal * 1.21).toFixed(2)) };
}

function registerCartRoutes(router) {
  router.get('/api/cart', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const db = getDb();
    return ok(res, await cartDto(db, await getActiveCart(db, user.id)));
  });

  router.post('/api/cart/items', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['sku']);
      const db = getDb();
      const product = await db.prepare('SELECT * FROM products WHERE sku = ? OR slug = ?').get(payload.sku, payload.sku);
      if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado.');
      if (product.pro_only && user.role !== 'pro') return fail(res, 403, 'PRO_ONLY', 'Este producto requiere perfil profesional.');
      const cart = await getActiveCart(db, user.id);
      const requestedQty = Math.max(1, Number(payload.quantity || 1));

      // Stock validation: check how much is already in the cart for this product
      const existingItem = await db.prepare('SELECT quantity FROM cart_items WHERE cart_id = ? AND product_id = ?').get(cart.id, product.id);
      const alreadyInCart = existingItem ? Number(existingItem.quantity) : 0;
      const maxCanAdd = Math.max(0, product.stock - alreadyInCart);
      const actualQty = Math.min(requestedQty, maxCanAdd);

      if (actualQty <= 0) {
        return fail(res, 422, 'STOCK_EXCEEDED', `No queda stock suficiente. Ya tienes ${alreadyInCart} uds en la cesta (stock: ${product.stock}).`);
      }

      await db.prepare(`
        INSERT INTO cart_items (cart_id, product_id, quantity)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE quantity = LEAST(cart_items.quantity + VALUES(quantity), ?)
      `).run(cart.id, product.id, actualQty, product.stock);
      await db.prepare('UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cart.id);
      return created(res, await cartDto(db, cart));
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.delete('/api/cart/items/:sku', async (req, res, { params }) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const db = getDb();
    const cart = await getActiveCart(db, user.id);
    await db.prepare(`
      DELETE FROM cart_items
      WHERE cart_id = ? AND product_id IN (SELECT id FROM products WHERE sku = ? OR slug = ?)
    `).run(cart.id, params.sku, params.sku);
    return noContent(res);
  });
}

module.exports = { registerCartRoutes, getActiveCart, cartDto };
