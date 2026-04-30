const { getDb } = require('../db');
const { readJson, requireFields, handleInputError } = require('../http');
const { ok, created, noContent, fail } = require('../response');
const { hashPassword, verifyPassword, createToken } = require('../security');
const { sessionTtlHours } = require('../config');
const { requireAuth } = require('../middleware/auth');

function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    fiscalId: user.fiscal_id,
    proDiscount: user.pro_discount,
  };
}

function createSession(db, userId) {
  const token = createToken();
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, datetime('now', ?))
  `).run(token, userId, `+${sessionTtlHours} hours`);
  return token;
}

function resetUrl(token) {
  return `/recuperar-password.html?token=${encodeURIComponent(token)}`;
}

function registerAuthRoutes(router) {
  router.post('/api/auth/login', async (req, res) => {
    try {
      const payload = await readJson(req);
      requireFields(payload, ['email', 'password']);
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(payload.email).toLowerCase());
      if (!user || !verifyPassword(payload.password, user.password_hash)) {
        return fail(res, 401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
      }
      const token = createSession(db, user.id);
      return ok(res, { token, user: publicUser(user) });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.post('/api/auth/register', async (req, res) => {
    try {
      const payload = await readJson(req);
      requireFields(payload, ['fullName', 'email', 'password']);
      const role = payload.role === 'pro' ? 'pro' : 'particular';
      const db = getDb();
      const result = db.prepare(`
        INSERT INTO users (role, full_name, email, password_hash, phone, fiscal_id, pro_discount)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(role, payload.fullName, String(payload.email).toLowerCase(), hashPassword(payload.password), payload.phone || null, payload.fiscalId || null, role === 'pro' ? 10 : 0);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
      const token = createSession(db, user.id);
      return created(res, { token, user: publicUser(user) });
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) return fail(res, 409, 'EMAIL_EXISTS', 'Ya existe una cuenta con ese email.');
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.post('/api/auth/password/forgot', async (req, res) => {
    try {
      const payload = await readJson(req);
      requireFields(payload, ['email']);
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(payload.email).toLowerCase());
      let token = null;
      if (user) {
        token = createToken();
        db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(user.id);
        db.prepare(`
          INSERT INTO password_resets (token, user_id, expires_at)
          VALUES (?, ?, datetime('now', '+30 minutes'))
        `).run(token, user.id);
      }
      return ok(res, {
        sent: true,
        resetUrl: token ? resetUrl(token) : null,
        expiresInMinutes: 30,
      });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.post('/api/auth/password/reset', async (req, res) => {
    try {
      const payload = await readJson(req);
      requireFields(payload, ['token', 'password']);
      if (String(payload.password).length < 8) return fail(res, 422, 'WEAK_PASSWORD', 'La contraseña debe tener al menos 8 caracteres.');
      const db = getDb();
      const reset = db.prepare(`
        SELECT * FROM password_resets
        WHERE token = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      `).get(payload.token);
      if (!reset) return fail(res, 400, 'INVALID_RESET_TOKEN', 'El enlace de recuperación no es válido o ha caducado.');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(payload.password), reset.user_id);
      db.prepare('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE token = ?').run(payload.token);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(reset.user_id);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(reset.user_id);
      const token = createSession(db, user.id);
      return ok(res, { token, user: publicUser(user) });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.post('/api/auth/password/change', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const payload = await readJson(req);
      requireFields(payload, ['currentPassword', 'newPassword']);
      if (String(payload.newPassword).length < 8) return fail(res, 422, 'WEAK_PASSWORD', 'La contraseña debe tener al menos 8 caracteres.');
      const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      if (!verifyPassword(payload.currentPassword, row.password_hash)) return fail(res, 401, 'INVALID_PASSWORD', 'La contraseña actual no es correcta.');
      getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(payload.newPassword), user.id);
      return ok(res, { changed: true });
    } catch (error) {
      if (!handleInputError(res, error)) throw error;
    }
  });

  router.get('/api/me', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    return ok(res, publicUser(user));
  });

  router.post('/api/auth/logout', (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (token) getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return noContent(res);
  });
}

module.exports = { registerAuthRoutes, publicUser };
