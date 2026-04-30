function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function ok(res, data = null, meta = undefined) {
  sendJson(res, 200, { ok: true, data, ...(meta ? { meta } : {}) });
}

function created(res, data = null) {
  sendJson(res, 201, { ok: true, data });
}

function noContent(res) {
  res.writeHead(204);
  res.end();
}

function fail(res, status, code, message, details = undefined) {
  sendJson(res, status, { ok: false, error: { code, message, ...(details ? { details } : {}) } });
}

module.exports = { sendJson, ok, created, noContent, fail };
