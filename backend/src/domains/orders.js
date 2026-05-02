const { getDb } = require('../db');
const { readJson, handleInputError } = require('../http');
const { ok, created, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');
const { getActiveCart, cartDto } = require('./cart');

function orderCode() {
  return `GLX-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function orderEvents(db, orderId) {
  return db.prepare('SELECT status, title, description, happened_at FROM order_events WHERE order_id = ? ORDER BY id').all(orderId);
}

function addOrderEvent(db, orderId, status, title, description = null) {
  db.prepare('INSERT INTO order_events (order_id, status, title, description) VALUES (?, ?, ?, ?)')
    .run(orderId, status, title, description);
}

const SHIPPING_METHODS = [
  { id: 'pickup', label: 'Recogida en tienda', price: 0, eta: 'Hoy en tienda' },
  { id: 'standard', label: 'Envío estándar', price: 4.9, eta: '24-48 h' },
  { id: 'express', label: 'Envío urgente', price: 8.9, eta: 'Mañana laborable' },
];

const COUPONS = {
  GLX5: { code: 'GLX5', type: 'percent', value: 5, label: '5% de descuento' },
  ENVIO0: { code: 'ENVIO0', type: 'shipping', value: 100, label: 'Envío estándar gratis' },
  PRO10: { code: 'PRO10', type: 'percent', value: 10, label: '10% profesional', roles: ['pro'] },
};

function money(value) {
  return Number(value.toFixed(2));
}

function checkoutTotals(summary, payload, user) {
  const shippingMethod = SHIPPING_METHODS.find((method) => method.id === payload.shippingMethod) || SHIPPING_METHODS[1];
  const couponCode = String(payload.couponCode || '').trim().toUpperCase();
  const coupon = couponCode ? COUPONS[couponCode] : null;
  if (couponCode && !coupon) return { error: ['COUPON_NOT_FOUND', 'Cupón no válido.'] };
  if (coupon?.roles && !coupon.roles.includes(user.role)) return { error: ['COUPON_NOT_ALLOWED', 'Este cupón no está disponible para tu tipo de cuenta.'] };

  const subtotal = money(summary.subtotal);
  const tax = money(subtotal * 0.21);
  let shipping = shippingMethod.price;
  let discount = 0;
  if (coupon?.type === 'percent') discount = money(subtotal * (coupon.value / 100));
  if (coupon?.type === 'shipping') shipping = 0;
  const total = money(Math.max(0, subtotal + tax + shipping - discount));
  return { subtotal, tax, shipping, discount, total, shippingMethod, coupon: coupon || null };
}

function registerOrderRoutes(router) {
  router.get('/api/orders', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const rows = getDb().prepare('SELECT id, code, status, total, created_at FROM orders WHERE user_id = ? ORDER BY id DESC').all(user.id);
    return ok(res, rows);
  });

  router.get('/api/checkout/options', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const db = getDb();
    const cart = getActiveCart(db, user.id);
    const summary = cartDto(db, cart);
    const paymentMethods = db.prepare('SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(user.id);
    const addresses = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(user.id);
    return ok(res, {
      cart: summary,
      totals: checkoutTotals(summary, { shippingMethod: 'standard' }, user),
      shippingMethods: SHIPPING_METHODS,
      paymentMethods,
      addresses,
      coupons: Object.values(COUPONS).filter((coupon) => !coupon.roles || coupon.roles.includes(user.role)),
    });
  });

  router.get('/api/orders/:code', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const row = getDb().prepare('SELECT * FROM orders WHERE code = ? AND user_id = ?').get(params.code, user.id);
    if (!row) return fail(res, 404, 'ORDER_NOT_FOUND', 'Pedido no encontrado.');
    return ok(res, { ...row, payload: JSON.parse(row.payload_json), events: orderEvents(getDb(), row.id) });
  });

  router.post('/api/orders/checkout', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      const db = getDb();
      const cart = getActiveCart(db, user.id);
      const summary = cartDto(db, cart);
      if (summary.items.length === 0) return fail(res, 422, 'EMPTY_CART', 'No se puede crear un pedido con el carrito vacío.');
      const totals = checkoutTotals(summary, payload, user);
      if (totals.error) return fail(res, 422, totals.error[0], totals.error[1]);
      let paymentMethod = null;
      if (payload.paymentMethodId) {
        paymentMethod = db.prepare('SELECT * FROM payment_methods WHERE id = ? AND user_id = ?').get(payload.paymentMethodId, user.id);
        if (!paymentMethod) return fail(res, 422, 'PAYMENT_METHOD_NOT_FOUND', 'Método de pago no encontrado.');
      } else {
        paymentMethod = db.prepare('SELECT * FROM payment_methods WHERE user_id = ? AND is_default = 1 ORDER BY id DESC LIMIT 1').get(user.id) || null;
      }
      const code = orderCode();
      const result = db.prepare('INSERT INTO orders (code, user_id, status, total, payload_json) VALUES (?, ?, ?, ?, ?)').run(
        code,
        user.id,
        'confirmed',
        totals.total,
        JSON.stringify({ cart: summary, checkout: payload, totals, paymentMethod })
      );
      addOrderEvent(db, result.lastInsertRowid, 'confirmed', 'Pedido recibido', 'Hemos registrado el pedido correctamente.');
      addOrderEvent(db, result.lastInsertRowid, 'paid', 'Pago confirmado', paymentMethod ? `Pago confirmado con ${paymentMethod.label}.` : 'El pago se ha confirmado en modo demo.');
      addOrderEvent(db, result.lastInsertRowid, 'preparing', 'En preparación', 'Estamos preparando el pedido en almacén.');
      db.prepare('UPDATE carts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('ordered', cart.id);
      db.prepare('INSERT INTO documents (user_id, type, code, related_order_code, total) VALUES (?, ?, ?, ?, ?)').run(user.id, 'invoice', `FAC-${code}`, code, totals.total);
      
      const updateStock = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?');
      for (const item of summary.items) {
        updateStock.run(item.quantity, item.id);
      }

      return created(res, { code, status: 'confirmed', total: totals.total, totals, shippingMethod: totals.shippingMethod, coupon: totals.coupon });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.patch('/api/orders/:code/status', async (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      const db = getDb();
      const row = db.prepare('SELECT * FROM orders WHERE code = ? AND user_id = ?').get(params.code, user.id);
      if (!row) return fail(res, 404, 'ORDER_NOT_FOUND', 'Pedido no encontrado.');
      const status = payload.status || row.status;
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, row.id);
      addOrderEvent(db, row.id, status, payload.title || `Estado actualizado: ${status}`, payload.description || null);
      return ok(res, { code: row.code, status, events: orderEvents(db, row.id) });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });
}

module.exports = { registerOrderRoutes };
