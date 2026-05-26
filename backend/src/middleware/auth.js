const { getDb } = require('../db');
const { fail } = require('../response');

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  return type === 'Bearer' ? token : null;
}

function currentUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  return getDb().prepare(`
    SELECT users.id, users.role, users.full_name, users.email, users.phone, users.fiscal_id, users.birth_date, users.marketing_email, users.order_notifications, users.tutorial_reminders, users.sms_urgency, users.pro_discount
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > CURRENT_TIMESTAMP
  `).get(token) || null;
}

function requireAuth(req, res) {
  const user = currentUser(req);
  if (!user) {
    fail(res, 401, 'UNAUTHORIZED', 'Debes iniciar sesión para acceder a este recurso.');
    return null;
  }
  return user;
}

function requireRole(req, res, roles) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!roles.includes(user.role)) {
    fail(res, 403, 'FORBIDDEN', 'Tu perfil no tiene permisos para esta operación.');
    return null;
  }
  return user;
}

module.exports = { currentUser, requireAuth, requireRole };
