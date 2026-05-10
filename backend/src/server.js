const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { connect } = require('./db');
const { createRouter } = require('./router');
const { fail } = require('./response');
const { port, webDir } = require('./config');
const { registerAuthRoutes } = require('./domains/auth');
const { registerCatalogRoutes } = require('./domains/catalog');
const { registerCartRoutes } = require('./domains/cart');
const { registerOrderRoutes } = require('./domains/orders');
const { registerQuoteRoutes } = require('./domains/quotes');
const { registerServiceRoutes } = require('./domains/services');
const { registerAccountRoutes } = require('./domains/account');
const { registerDocumentRoutes } = require('./domains/documents');
const { registerContentRoutes } = require('./domains/content');
const { registerCommerceRoutes } = require('./domains/commerce');
const { registerSupportRoutes } = require('./domains/support');
const { registerAdminRoutes } = require('./domains/admin');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.normalize(path.join(webDir, requested));
  if (!filePath.startsWith(webDir)) return fail(res, 403, 'FORBIDDEN', 'Ruta no permitida.');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const notFoundPath = path.join(webDir, '404.html');
    if (fs.existsSync(notFoundPath)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(notFoundPath).pipe(res);
    }
    return fail(res, 404, 'NOT_FOUND', 'Página no encontrada.');
  }
  res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function buildRouter() {
  const router = createRouter();
  router.get('/api/health', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, data: { service: 'garperlux-backend', database: 'sqlite' } }));
  });
  registerAuthRoutes(router);
  registerCatalogRoutes(router);
  registerCartRoutes(router);
  registerOrderRoutes(router);
  registerQuoteRoutes(router);
  registerServiceRoutes(router);
  registerAccountRoutes(router);
  registerDocumentRoutes(router);
  registerContentRoutes(router);
  registerCommerceRoutes(router);
  registerSupportRoutes(router);
  registerAdminRoutes(router);
  return router;
}

function createServer() {
  const router = buildRouter();
  return http.createServer(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    if (req.url.startsWith('/api/')) return router.handle(req, res, {});
    return serveStatic(req, res);
  });
}

if (require.main === module) {
  connect({ reset: process.argv.includes('--reset-db') });
  createServer().listen(port, () => {
    console.log(`GarperLux backend: http://localhost:${port}`);
    console.log(`API health:        http://localhost:${port}/api/health`);
  });
}

module.exports = { createServer };
