const { getDb } = require('../db');
const { ok } = require('../response');

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function productDto(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    category: { id: row.category_id, slug: row.category_slug, name: row.category_name },
    brand: { id: row.brand_id, slug: row.brand_slug, name: row.brand_name },
    price: row.price,
    taxRate: row.tax_rate,
    stock: row.stock,
    safetyLevel: row.safety_level,
    proOnly: Boolean(row.pro_only),
    description: row.description,
    specs: parseJson(row.specs_json, {}),
    image: row.image || null,
  };
}

function variantDto(row) {
  return {
    id: row.id,
    sku: row.sku,
    finish: row.finish,
    amps: row.amps,
    price: row.price,
    stock: row.stock,
    isDefault: Boolean(row.is_default),
  };
}

function productSelect() {
  return `
    SELECT products.*, categories.slug AS category_slug, categories.name AS category_name,
           brands.slug AS brand_slug, brands.name AS brand_name
    FROM products
    JOIN categories ON categories.id = products.category_id
    JOIN brands ON brands.id = products.brand_id
  `;
}

function registerCatalogRoutes(router) {
  router.get('/api/catalog/categories', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM categories ORDER BY name').all();
    return ok(res, rows);
  });

  router.get('/api/catalog/brands', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM brands ORDER BY name').all();
    return ok(res, rows.map((brand) => ({ ...brand, professional: Boolean(brand.professional) })));
  });

  router.get('/api/catalog/products', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const q = `%${(url.searchParams.get('q') || '').trim()}%`;
    const category = url.searchParams.get('category');
    const brand = url.searchParams.get('brand');
    const params = [];
    const where = [];
    if (q !== '%%') {
      where.push('(products.name LIKE ? OR products.sku LIKE ? OR products.description LIKE ?)');
      params.push(q, q, q);
    }
    if (category) {
      where.push('categories.slug = ?');
      params.push(category);
    }
    if (brand) {
      where.push('brands.slug = ?');
      params.push(brand);
    }
    const sql = `${productSelect()} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY products.name`;
    return ok(res, getDb().prepare(sql).all(...params).map(productDto));
  });

  router.get('/api/catalog/products/:slug', (_req, res, { params }) => {
    const row = getDb().prepare(`${productSelect()} WHERE products.slug = ? OR products.sku = ?`).get(params.slug, params.slug);
    if (!row) return ok(res, null);
    const product = productDto(row);
    product.variants = getDb().prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY is_default DESC, finish, amps')
      .all(row.id)
      .map(variantDto);
    return ok(res, product);
  });

  router.get('/api/catalog/products/:slug/variants', (_req, res, { params }) => {
    const row = getDb().prepare('SELECT id FROM products WHERE slug = ? OR sku = ?').get(params.slug, params.slug);
    if (!row) return ok(res, []);
    return ok(res, getDb().prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY is_default DESC, finish, amps')
      .all(row.id)
      .map(variantDto));
  });
}

module.exports = { registerCatalogRoutes, productDto, productSelect };
