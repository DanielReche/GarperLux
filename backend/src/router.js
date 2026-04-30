const { fail } = require('./response');

function compilePath(path) {
  const keys = [];
  const pattern = path
    .replace(/\/+$/, '')
    .replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
  return { keys, regex: new RegExp(`^${pattern || '/'}$`) };
}

function createRouter() {
  const routes = [];

  function add(method, path, handler) {
    routes.push({ method, path, ...compilePath(path), handler });
  }

  async function handle(req, res, context) {
    const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
    const route = routes.find((candidate) => candidate.method === req.method && candidate.regex.test(pathname));
    if (!route) return fail(res, 404, 'NOT_FOUND', 'Ruta no encontrada.');

    const match = pathname.match(route.regex);
    const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
    try {
      return await route.handler(req, res, { ...context, params });
    } catch (error) {
      console.error(error);
      return fail(res, 500, 'INTERNAL_ERROR', 'Error interno del servidor.');
    }
  }

  return {
    get: (path, handler) => add('GET', path, handler),
    post: (path, handler) => add('POST', path, handler),
    put: (path, handler) => add('PUT', path, handler),
    patch: (path, handler) => add('PATCH', path, handler),
    delete: (path, handler) => add('DELETE', path, handler),
    handle,
  };
}

module.exports = { createRouter };
