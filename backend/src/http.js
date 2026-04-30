const { fail } = require('./response');

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('JSON inválido.');
    error.status = 400;
    error.code = 'INVALID_JSON';
    throw error;
  }
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');
  if (missing.length) {
    const error = new Error('Faltan campos obligatorios.');
    error.status = 422;
    error.code = 'VALIDATION_ERROR';
    error.details = { missing };
    throw error;
  }
}

function handleInputError(res, error) {
  if (!error.status) return false;
  fail(res, error.status, error.code || 'REQUEST_ERROR', error.message, error.details);
  return true;
}

module.exports = { readJson, requireFields, handleInputError };
