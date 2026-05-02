const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { databaseDir, databaseFile } = require('./config');
const { hashPassword } = require('./security');

let database;

function connect({ reset = false } = {}) {
  fs.mkdirSync(databaseDir, { recursive: true });
  if (reset && fs.existsSync(databaseFile)) fs.unlinkSync(databaseFile);

  database = new DatabaseSync(databaseFile);
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA journal_mode = WAL;');
  migrate(database);
  seed(database);
  return database;
}

function getDb() {
  if (!database) return connect();
  return database;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('particular','pro','admin')),
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT,
      fiscal_id TEXT,
      pro_discount INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      professional INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      brand_id INTEGER NOT NULL REFERENCES brands(id),
      price REAL NOT NULL,
      tax_rate REAL NOT NULL DEFAULT 21,
      stock INTEGER NOT NULL DEFAULT 0,
      safety_level TEXT NOT NULL DEFAULT 'basic',
      pro_only INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      specs_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku TEXT NOT NULL UNIQUE,
      finish TEXT NOT NULL,
      amps TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      PRIMARY KEY(cart_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      recipient TEXT NOT NULL,
      line1 TEXT NOT NULL,
      city TEXT NOT NULL,
      province TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      phone TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_billing INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      last4 TEXT,
      brand TEXT,
      exp_month TEXT,
      exp_year TEXT,
      holder TEXT,
      allow_recurring INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS fiscal_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      legal_name TEXT NOT NULL,
      tax_id TEXT NOT NULL,
      legal_form TEXT,
      vat_regime TEXT,
      cnae TEXT,
      license_number TEXT,
      license_expires TEXT,
      license_region TEXT,
      fiscal_address TEXT,
      postal_code TEXT,
      city TEXT,
      province TEXT,
      country TEXT NOT NULL DEFAULT 'España',
      iban TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total REAL NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      happened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      title TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS service_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'received',
      service_type TEXT NOT NULL,
      urgency TEXT NOT NULL DEFAULT 'normal',
      address TEXT NOT NULL,
      description TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS service_request_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_request_id INTEGER NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      happened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('invoice','delivery_note')),
      code TEXT NOT NULL UNIQUE,
      related_order_code TEXT,
      total REAL NOT NULL DEFAULT 0,
      issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tutorials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      safety_level TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      reviewer TEXT NOT NULL,
      related_product_skus TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS saved_tutorials (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tutorial_id INTEGER NOT NULL REFERENCES tutorials(id) ON DELETE CASCADE,
      progress INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, tutorial_id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      order_code TEXT,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      display_name TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      verified_purchase INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      order_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      reason TEXT NOT NULL,
      shipping_method TEXT NOT NULL,
      refund_method TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recurring_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      next_run_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      reference TEXT,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'received',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);


  const usersColumns = db.prepare('PRAGMA table_info(users)').all().map((row) => row.name);
  const addColumn = (columnSql, columnName) => {
    if (!usersColumns.includes(columnName)) db.exec(`ALTER TABLE users ADD COLUMN ${columnSql}`);
  };

  addColumn('birth_date TEXT', 'birth_date');
  addColumn('marketing_email INTEGER NOT NULL DEFAULT 1', 'marketing_email');
  addColumn('order_notifications INTEGER NOT NULL DEFAULT 1', 'order_notifications');
  addColumn('tutorial_reminders INTEGER NOT NULL DEFAULT 0', 'tutorial_reminders');
  addColumn('sms_urgency INTEGER NOT NULL DEFAULT 0', 'sms_urgency');
  ensureColumn(db, 'payment_methods', 'brand', 'TEXT');
  ensureColumn(db, 'payment_methods', 'exp_month', 'TEXT');
  ensureColumn(db, 'payment_methods', 'exp_year', 'TEXT');
  ensureColumn(db, 'payment_methods', 'holder', 'TEXT');
  ensureColumn(db, 'payment_methods', 'allow_recurring', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'addresses', 'is_billing', 'INTEGER NOT NULL DEFAULT 0');
}

function ensureColumn(db, table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function seed(db) {
  const users = Number(db.prepare('SELECT COUNT(*) AS total FROM users').get().total);
  if (users > 0) {
    ensureAdminUser(db);
    seedProductVariants(db);
    return;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (role, full_name, email, password_hash, phone, fiscal_id, pro_discount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run('particular', 'Antonio García', 'antonio.garcia@correo.com', hashPassword('garperlux123'), '600111222', null, 0);
  insertUser.run('pro', 'Jose Luis García', 'chispas@instaladoreseljaen.es', hashPassword('garperlux123'), '600333444', 'B12345678', 22);
  ensureAdminUser(db);

  const insertCategory = db.prepare('INSERT INTO categories (slug, name, parent_id, description) VALUES (?, ?, ?, ?)');
  insertCategory.run('mecanismos', 'Mecanismos', null, 'Interruptores, enchufes, marcos y series compatibles.');
  insertCategory.run('iluminacion', 'Iluminación', null, 'Lámparas, bombillas LED, tiras y proyectores.');
  insertCategory.run('domotica', 'Domótica', null, 'Control inteligente para vivienda y local.');
  insertCategory.run('proteccion', 'Protección eléctrica', null, 'Magnetotérmicos, diferenciales y cuadros.');

  const insertBrand = db.prepare('INSERT INTO brands (slug, name, professional) VALUES (?, ?, ?)');
  insertBrand.run('simon', 'Simón', 1);
  insertBrand.run('ledvance', 'Ledvance', 1);
  insertBrand.run('schneider', 'Schneider Electric', 1);
  insertBrand.run('garperlux', 'GarperLux', 0);

  const categoryBySlug = (slug) => db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug).id;
  const brandBySlug = (slug) => db.prepare('SELECT id FROM brands WHERE slug = ?').get(slug).id;
  const insertProduct = db.prepare(`
    INSERT INTO products (sku, name, slug, category_id, brand_id, price, stock, safety_level, pro_only, description, specs_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertProduct.run('SIM-75201-39', 'Interruptor conmutador Simon 75 grafito', 'interruptor-conmutador-simon-75-grafito', categoryBySlug('mecanismos'), brandBySlug('simon'), 12.95, 38, 'basic', 0, 'Mecanismo compatible con marcos Simon 75.', JSON.stringify({ voltage: '250V', amps: '10AX', finish: 'Grafito' }));
  insertProduct.run('LED-A60-9W-2700K', 'Bombilla LED A60 9W cálida', 'bombilla-led-a60-9w-calida', categoryBySlug('iluminacion'), brandBySlug('ledvance'), 4.5, 120, 'basic', 0, 'Bombilla LED de luz cálida para uso doméstico.', JSON.stringify({ lumens: 806, kelvin: 2700, socket: 'E27' }));
  insertProduct.run('SCH-A9R60240', 'Diferencial Schneider 40A 30mA', 'diferencial-schneider-40a-30ma', categoryBySlug('proteccion'), brandBySlug('schneider'), 49.9, 14, 'pro', 1, 'Diferencial para cuadro eléctrico. Instalación por profesional autorizado.', JSON.stringify({ poles: 2, amps: '40A', sensitivity: '30mA' }));
  [
    ['27101-31', 'Interruptor unipolar Simón 27 blanco', 'interruptor-unipolar-simon-27-blanco', 'mecanismos', 'simon', 5.42, 86, 'basic', 0],
    ['27201-31', 'Conmutador Simón 27 blanco', 'conmutador-simon-27-blanco', 'mecanismos', 'simon', 6.18, 74, 'basic', 0],
    ['27431-31', 'Base enchufe schuko Simón 27 blanco', 'base-enchufe-schuko-simon-27-blanco', 'mecanismos', 'simon', 7.9, 62, 'basic', 0],
    ['75101-39', 'Marco Simón 75 grafito 1 elemento', 'marco-simon-75-grafito-1-elemento', 'mecanismos', 'simon', 3.85, 140, 'basic', 0],
    ['27502-31', 'Doble interruptor Simón 27 blanco', 'doble-interruptor-simon-27-blanco', 'mecanismos', 'simon', 9.4, 33, 'basic', 0],
    ['8718699-04', 'Bombilla LED Philips E27 cálida', 'bombilla-led-philips-e27-calida', 'iluminacion', 'ledvance', 4.2, 95, 'basic', 0],
    ['A9F74225', 'Magnetotérmico Schneider iC60N 25A', 'magnetotermico-schneider-ic60n-25a', 'proteccion', 'schneider', 18.6, 41, 'pro', 1],
    ['SHL-1M-G3', 'Relé domótico Shelly 1 Mini Gen3', 'rele-domotico-shelly-1-mini-gen3', 'domotica', 'garperlux', 16.9, 57, 'medium', 0],
    ['WH-DA-3', 'Detector de agua WiFi', 'detector-agua-wifi', 'domotica', 'garperlux', 19.95, 24, 'basic', 0],
    ['UNI-T-A03', 'Buscapolos profesional UNI-T', 'buscapolos-profesional-uni-t', 'proteccion', 'garperlux', 8.95, 51, 'basic', 0],
    ['PRY-MNG3-1.5', 'Cable manguera 3x1,5 mm²', 'cable-manguera-3x15', 'proteccion', 'garperlux', 1.15, 500, 'basic', 0],
    ['LX-PR50-65', 'Proyector LED exterior 50W IP65', 'proyector-led-exterior-50w-ip65', 'iluminacion', 'garperlux', 24.9, 29, 'basic', 0],
    ['LEG-401222', 'Cuadro superficie Legrand 12 módulos', 'cuadro-superficie-legrand-12-modulos', 'proteccion', 'garperlux', 22.5, 18, 'pro', 1],
  ].forEach(([sku, name, slug, category, brand, price, stock, safety, proOnly]) => {
    insertProduct.run(sku, name, slug, categoryBySlug(category), brandBySlug(brand), price, stock, safety, proOnly, `${name}. Producto incorporado al catálogo provisional GarperLux.`, JSON.stringify({ provisional: true }));
  });

  const insertAddress = db.prepare(`
    INSERT INTO addresses (user_id, label, recipient, line1, city, province, postal_code, phone, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAddress.run(1, 'Casa', 'Antonio García', 'Calle Real 12', 'Mengíbar', 'Jaén', '23620', '600111222', 1);
  insertAddress.run(2, 'Nave taller', 'Jose Luis García', 'Polígono Industrial 4', 'Jaén', 'Jaén', '23009', '600333444', 1);

  db.prepare('INSERT INTO payment_methods (user_id, type, label, last4, is_default) VALUES (?, ?, ?, ?, ?)').run(1, 'card', 'Visa personal', '4242', 1);
  db.prepare('INSERT INTO payment_methods (user_id, type, label, last4, is_default) VALUES (?, ?, ?, ?, ?)').run(2, 'bank_transfer', 'Transferencia empresa', null, 1);

  db.prepare(`
    INSERT INTO fiscal_profiles (user_id, legal_name, tax_id, legal_form, vat_regime, cnae, license_number, license_expires, license_region, fiscal_address, postal_code, city, province, country, iban)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(2, 'Jose Luis García - El Chispas Instalaciones', 'B12345678', 'Autónomo', 'General', '4321 — Instalaciones eléctricas', 'BT-123456-AND', '2031-04', 'Andalucía', 'Polígono Los Olivares, nave 24', '23009', 'Jaén', 'Jaén', 'España', 'ES1200491234567890123456');

  db.prepare(`
    INSERT INTO tutorials (slug, title, difficulty, safety_level, minutes, reviewer, related_product_skus)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('cambiar-interruptor-sin-riesgos', 'Cambiar un interruptor sin riesgos', 'media', 'basic', 35, 'Alfonso Torres', JSON.stringify(['SIM-75201-39']));

  seedProductVariants(db);
}


function ensureAdminUser(db) {
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@garperlux.local');
  if (exists) return;
  db.prepare(`
    INSERT INTO users (role, full_name, email, password_hash, phone, fiscal_id, pro_discount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('admin', 'Administración GarperLux', 'admin@garperlux.local', hashPassword('garperlux123'), '953212223', null, 0);
}

function seedProductVariants(db) {
  const variants = Number(db.prepare('SELECT COUNT(*) AS total FROM product_variants').get().total);
  if (variants > 0) return;

  const product = db.prepare('SELECT id FROM products WHERE sku = ?').get('27101-31');
  if (!product) return;

  const insertVariant = db.prepare(`
    INSERT INTO product_variants (product_id, sku, finish, amps, price, stock, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['27101-31', 'Blanco', '10 A', 5.42, 86, 1],
    ['27101-32', 'Marfil', '10 A', 5.62, 34, 0],
    ['27101-39', 'Aluminio', '10 A', 6.25, 19, 0],
    ['27101-31-16A', 'Blanco', '16 A', 6.10, 42, 0],
    ['27101-32-16A', 'Marfil', '16 A', 6.30, 18, 0],
    ['27101-39-16A', 'Aluminio', '16 A', 6.90, 11, 0],
    ['27101-31-20A', 'Blanco', '20 A', 7.20, 12, 0],
    ['27101-32-20A', 'Marfil', '20 A', 7.40, 8, 0],
    ['27101-39-20A', 'Aluminio', '20 A', 8.10, 5, 0],
  ].forEach((variant) => insertVariant.run(product.id, ...variant));
}

module.exports = { connect, getDb };
