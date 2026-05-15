const { getDb } = require('../db');
const { ok } = require('../response');

function parseJson(value, fallback) {
  if (typeof value === 'object' && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// Normaliza el nombre de marca a Title Case ("Inspire", "Schneider Electric").
// Hay marcas con una grafía registrada que conservamos tal cual ("TP-Link",
// "GarperLux", "EZVIZ"...). El scraper guarda los nombres en mayúsculas o
// minúsculas según la fuente; aquí se unifican antes de salir al cliente.
const BRAND_DISPLAY_OVERRIDES = {
  'tp-link': 'TP-Link',
  'garperlux': 'GarperLux',
  'bticino': 'BTicino',
  'ezviz': 'EZVIZ',
  'imou': 'IMOU',
  'eufy': 'eufy',
  'abb': 'ABB',
  'bjc': 'BJC',
  'dio': 'DIO',
  'ksix': 'Ksix',
  'sonoff': 'Sonoff',
  'siemens': 'Siemens',
  'mercusys': 'Mercusys',
  'philips': 'Philips',
  'tegui': 'Tegui',
  'nice': 'Nice',
  'erreka': 'Erreka',
  'pujol muntala': 'Pujol Muntalá',
  'pujol muntalá': 'Pujol Muntalá',
};
function titleCaseBrand(name) {
  if (!name) return name;
  const trimmed = String(name).trim();
  const key = trimmed.toLowerCase();
  if (BRAND_DISPLAY_OVERRIDES[key]) return BRAND_DISPLAY_OVERRIDES[key];
  // Capitaliza palabra a palabra preservando guiones (TP-Link → TP-Link).
  return trimmed
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part) || part === '-') return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

function productDto(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    category: { id: row.category_id, slug: row.category_slug, name: row.category_name },
    brand: {
      id: row.brand_id,
      slug: row.brand_slug,
      name: titleCaseBrand(row.brand_name),
      // Lo exponemos al cliente porque la ficha del producto lo usa para decidir
      // si añade la tarjeta "Declaración CE" en la vista pro.
      isOfficial: Boolean(row.brand_is_official),
    },
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
           brands.slug AS brand_slug, brands.name AS brand_name,
           brands.is_official AS brand_is_official
    FROM products
    JOIN categories ON categories.id = products.category_id
    JOIN brands ON brands.id = products.brand_id
  `;
}

function registerCatalogRoutes(router) {
  router.get('/api/catalog/categories', async (_req, res) => {
    const rows = await getDb().prepare('SELECT * FROM categories ORDER BY name').all();
    return ok(res, rows);
  });

  router.get('/api/catalog/brands', async (_req, res) => {
    const rows = await getDb().prepare('SELECT * FROM brands ORDER BY name').all();
    return ok(res, rows.map((brand) => ({
      id: brand.id,
      slug: brand.slug,
      name: titleCaseBrand(brand.name),
      professional: Boolean(brand.professional),
      isOfficial: Boolean(brand.is_official),
      logo: brand.logo || null,
      description: brand.description || null,
      country: brand.country || null,
      yearFounded: brand.year_founded || null,
      website: brand.website || null,
      categories: parseJson(brand.categories_json, []),
    })));
  });

  router.get('/api/catalog/products', async (req, res) => {
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
    return ok(res, (await getDb().prepare(sql).all(...params)).map(productDto));
  });

  router.get('/api/catalog/products/:slug', async (_req, res, { params }) => {
    const row = await getDb().prepare(`${productSelect()} WHERE products.slug = ? OR products.sku = ?`).get(params.slug, params.slug);
    if (!row) return ok(res, null);
    const product = productDto(row);
    product.variants = (await getDb().prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY is_default DESC, finish, amps').all(row.id)).map(variantDto);
    return ok(res, product);
  });

  router.get('/api/catalog/products/:slug/variants', async (_req, res, { params }) => {
    const row = await getDb().prepare('SELECT id FROM products WHERE slug = ? OR sku = ?').get(params.slug, params.slug);
    if (!row) return ok(res, []);
    return ok(res, (await getDb().prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY is_default DESC, finish, amps').all(row.id)).map(variantDto));
  });
}

module.exports = { registerCatalogRoutes, productDto, productSelect };
