const fs = require('node:fs');
const mysql = require('mysql2/promise');
const { databaseDir, databaseFile } = require('./config');
const { hashPassword } = require('./security');

class DatabaseWrapper {
  constructor(pool) { this.pool = pool; }
  async exec(sql) {
    await this.pool.query(sql);
  }
  prepare(sql) {
    return {
      get: async (...args) => {
        const [rows] = await this.pool.execute(sql, args);
        return rows[0];
      },
      all: async (...args) => {
        const [rows] = await this.pool.execute(sql, args);
        return rows;
      },
      run: async (...args) => {
        const [result] = await this.pool.execute(sql, args);
        return { lastInsertRowid: result.insertId, changes: result.affectedRows };
      }
    };
  }
}

let pool;
let databaseWrapper;

async function connect({ reset = false } = {}) {
  pool = mysql.createPool({
    host: '127.0.0.1',
    port: 6446,
    user: 'garperlux',
    password: 'garperlux',
    database: 'garperlux',
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  databaseWrapper = new DatabaseWrapper(pool);

  if (reset) {
    const [tables] = await pool.query('SHOW TABLES');
    for (const row of tables) {
      const tableName = Object.values(row)[0];
      await pool.query('DROP TABLE IF EXISTS ' + tableName);
    }
  }

  await migrate(databaseWrapper);
  await seed(databaseWrapper);
  return databaseWrapper;
}

function getDb() {
  if (!databaseWrapper) throw new Error("Database not initialized");
  return databaseWrapper;
}

async function migrate(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT,
      fiscal_id TEXT,
      pro_discount INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(255) PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token VARCHAR(255) PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(255) NOT NULL UNIQUE,
      name TEXT NOT NULL,
      parent_id INTEGER,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS brands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(255) NOT NULL UNIQUE,
      name TEXT NOT NULL,
      professional INTEGER NOT NULL DEFAULT 0,
      is_official INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sku VARCHAR(255) NOT NULL UNIQUE,
      name TEXT NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      category_id INTEGER NOT NULL,
      brand_id INTEGER NOT NULL,
      price REAL NOT NULL,
      tax_rate REAL NOT NULL DEFAULT 21,
      stock INTEGER NOT NULL DEFAULT 0,
      safety_level VARCHAR(255) NOT NULL DEFAULT 'basic',
      pro_only INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      specs_json JSON DEFAULT (JSON_OBJECT()),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INTEGER NOT NULL,
      sku VARCHAR(255) NOT NULL UNIQUE,
      finish TEXT NOT NULL,
      amps TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS carts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INTEGER,
      status VARCHAR(255) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      cart_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      PRIMARY KEY(cart_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INTEGER NOT NULL,
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
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INTEGER NOT NULL,
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
      user_id INTEGER PRIMARY KEY,
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
      country VARCHAR(255) NOT NULL DEFAULT 'España',
      iban TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(255) NOT NULL UNIQUE,
      user_id INTEGER,
      status VARCHAR(255) NOT NULL DEFAULT 'pending',
      total REAL NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      happened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(255) NOT NULL UNIQUE,
      user_id INTEGER,
      status VARCHAR(255) NOT NULL DEFAULT 'draft',
      title TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      payload_json JSON DEFAULT (JSON_OBJECT()),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS service_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(255) NOT NULL UNIQUE,
      user_id INTEGER,
      status VARCHAR(255) NOT NULL DEFAULT 'received',
      service_type TEXT NOT NULL,
      urgency VARCHAR(255) NOT NULL DEFAULT 'normal',
      address TEXT NOT NULL,
      description TEXT NOT NULL,
      payload_json JSON DEFAULT (JSON_OBJECT()),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS service_request_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      service_request_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      happened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INTEGER,
      type TEXT NOT NULL,
      code VARCHAR(255) NOT NULL UNIQUE,
      related_order_code TEXT,
      total REAL NOT NULL DEFAULT 0,
      issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tutorials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(255) NOT NULL UNIQUE,
      title TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      safety_level TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      reviewer TEXT NOT NULL,
      related_product_skus JSON DEFAULT (JSON_ARRAY())
    );

    CREATE TABLE IF NOT EXISTS saved_tutorials (
      user_id INTEGER NOT NULL,
      tutorial_id INTEGER NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, tutorial_id)
    );

    CREATE TABLE IF NOT EXISTS tips (
      id INT AUTO_INCREMENT PRIMARY KEY,
      number INTEGER NOT NULL UNIQUE,
      category TEXT NOT NULL,
      body TEXT NOT NULL,
      author TEXT NOT NULL,
      author_initials TEXT NOT NULL,
      published_at TEXT NOT NULL,
      dark INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INTEGER,
      product_id INTEGER NOT NULL,
      order_code TEXT,
      rating INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      display_name TEXT NOT NULL,
      tags_json JSON DEFAULT (JSON_ARRAY()),
      verified_purchase INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(255) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(255) NOT NULL UNIQUE,
      user_id INTEGER,
      order_code TEXT NOT NULL,
      status VARCHAR(255) NOT NULL DEFAULT 'requested',
      reason TEXT NOT NULL,
      shipping_method TEXT NOT NULL,
      refund_method TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payload_json JSON DEFAULT (JSON_OBJECT()),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recurring_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(255) NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      next_run_at TEXT,
      status VARCHAR(255) NOT NULL DEFAULT 'active',
      payload_json JSON DEFAULT (JSON_OBJECT()),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(255) NOT NULL UNIQUE,
      user_id INTEGER,
      reason TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      reference TEXT,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(255) NOT NULL DEFAULT 'new',
      payload_json JSON DEFAULT (JSON_OBJECT()),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(255) NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL,
      message TEXT,
      status VARCHAR(255) NOT NULL DEFAULT 'received',
      payload_json JSON DEFAULT (JSON_OBJECT()),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_audit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json JSON DEFAULT (JSON_OBJECT()),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS help_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(255) NOT NULL UNIQUE,
      name TEXT NOT NULL,
      short_label TEXT NOT NULL,
      description TEXT,
      icon_svg TEXT,
      accent VARCHAR(255) NOT NULL DEFAULT 'default',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS help_articles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category_id INTEGER NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      question TEXT NOT NULL,
      answer_html TEXT NOT NULL,
      keywords VARCHAR(255) NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0
    );
  `);


  const usersColumns = (await db.prepare('SHOW COLUMNS FROM users').all()).map((row) => row.Field);
  const addColumn = async (columnSql, columnName) => {
    if (!usersColumns.includes(columnName)) await await db.exec(`ALTER TABLE users ADD COLUMN ${columnSql}`);
  };

  await addColumn('birth_date TEXT', 'birth_date');
  await addColumn('marketing_email INTEGER NOT NULL DEFAULT 1', 'marketing_email');
  await addColumn('order_notifications INTEGER NOT NULL DEFAULT 1', 'order_notifications');
  await addColumn('tutorial_reminders INTEGER NOT NULL DEFAULT 0', 'tutorial_reminders');
  await addColumn('sms_urgency INTEGER NOT NULL DEFAULT 0', 'sms_urgency');
  await ensureColumn(db, 'payment_methods', 'brand', 'TEXT');
  await ensureColumn(db, 'payment_methods', 'exp_month', 'TEXT');
  await ensureColumn(db, 'payment_methods', 'exp_year', 'TEXT');
  await ensureColumn(db, 'payment_methods', 'holder', 'TEXT');
  await ensureColumn(db, 'payment_methods', 'allow_recurring', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'addresses', 'is_billing', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'documents', 'payload_json', "JSON DEFAULT (JSON_OBJECT())");
  await ensureColumn(db, 'products', 'image', 'TEXT');
  await ensureColumn(db, 'brands', 'logo', 'TEXT');
  await ensureColumn(db, 'brands', 'description', 'TEXT');
  await ensureColumn(db, 'brands', 'country', 'TEXT');
  await ensureColumn(db, 'brands', 'year_founded', 'TEXT');
  await ensureColumn(db, 'brands', 'website', 'TEXT');
  await ensureColumn(db, 'brands', 'categories_json', "JSON DEFAULT (JSON_ARRAY())");
  await ensureColumn(db, 'brands', 'is_official', 'INTEGER NOT NULL DEFAULT 0');
  // Tutoriales: contenido enriquecido para el catálogo de Hazlo Tú Mismo (18+ guías).
  // La columna `content_json` lleva toda la estructura editorial (intro, secciones, pasos,
  // FAQs) — se serializa así para evitar tablas hijas que multiplicarían joins.
  await ensureColumn(db, 'tutorials', 'excerpt', 'TEXT');
  await ensureColumn(db, 'tutorials', 'category', 'TEXT');
  await ensureColumn(db, 'tutorials', 'location', "VARCHAR(255) NOT NULL DEFAULT 'interior'");
  await ensureColumn(db, 'tutorials', 'has_video', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'tutorials', 'cover_photo_id', 'TEXT');
  await ensureColumn(db, 'tutorials', 'cover_gradient', 'TEXT');
  await ensureColumn(db, 'tutorials', 'content_json', "JSON DEFAULT (JSON_OBJECT())");
  await ensureColumn(db, 'tutorials', 'published_at', 'TEXT');
  await ensureColumn(db, 'tutorials', 'views', 'INTEGER NOT NULL DEFAULT 0');

  // ── Claves foráneas (restauradas desde el esquema SQLite original) ─────────
  // Relaciones con users — CASCADE en tablas hijas propias, SET NULL en referencias opcionales
  await ensureFK(db, 'sessions',           'fk_sessions_user',          'user_id',           'users', 'id', 'CASCADE');
  await ensureFK(db, 'password_resets',    'fk_password_resets_user',   'user_id',           'users', 'id', 'CASCADE');
  await ensureFK(db, 'carts',              'fk_carts_user',             'user_id',           'users', 'id', 'CASCADE');
  await ensureFK(db, 'addresses',          'fk_addresses_user',         'user_id',           'users', 'id', 'CASCADE');
  await ensureFK(db, 'payment_methods',    'fk_payment_methods_user',   'user_id',           'users', 'id', 'CASCADE');
  await ensureFK(db, 'fiscal_profiles',    'fk_fiscal_profiles_user',   'user_id',           'users', 'id', 'CASCADE');
  await ensureFK(db, 'recurring_orders',   'fk_recurring_orders_user',  'user_id',           'users', 'id', 'CASCADE');
  await ensureFK(db, 'saved_tutorials',    'fk_saved_tutorials_user',   'user_id',           'users', 'id', 'CASCADE');
  await ensureFK(db, 'favorites',          'fk_favorites_user',         'user_id',           'users', 'id', 'CASCADE');
  await ensureFK(db, 'orders',             'fk_orders_user',            'user_id',           'users', 'id', 'SET NULL');
  await ensureFK(db, 'quotes',             'fk_quotes_user',            'user_id',           'users', 'id', 'SET NULL');
  await ensureFK(db, 'service_requests',   'fk_service_requests_user',  'user_id',           'users', 'id', 'SET NULL');
  await ensureFK(db, 'documents',          'fk_documents_user',         'user_id',           'users', 'id', 'SET NULL');
  await ensureFK(db, 'reviews',            'fk_reviews_user',           'user_id',           'users', 'id', 'SET NULL');
  await ensureFK(db, 'returns',            'fk_returns_user',           'user_id',           'users', 'id', 'SET NULL');
  await ensureFK(db, 'contact_messages',   'fk_contact_messages_user',  'user_id',           'users', 'id', 'SET NULL');
  await ensureFK(db, 'admin_audit',        'fk_admin_audit_user',       'admin_user_id',     'users', 'id', 'SET NULL');
  // Relaciones con categorías y marcas
  await ensureFK(db, 'categories',         'fk_categories_parent',      'parent_id',         'categories', 'id', 'SET NULL');
  await ensureFK(db, 'products',           'fk_products_category',      'category_id',       'categories', 'id');
  await ensureFK(db, 'products',           'fk_products_brand',         'brand_id',          'brands',     'id');
  // Relaciones con productos
  await ensureFK(db, 'product_variants',   'fk_variants_product',       'product_id',        'products', 'id', 'CASCADE');
  await ensureFK(db, 'favorites',          'fk_favorites_product',      'product_id',        'products', 'id', 'CASCADE');
  await ensureFK(db, 'reviews',            'fk_reviews_product',        'product_id',        'products', 'id', 'CASCADE');
  await ensureFK(db, 'cart_items',         'fk_cart_items_product',     'product_id',        'products', 'id');
  // Relaciones con carts, orders, service_requests, tutorials
  await ensureFK(db, 'cart_items',         'fk_cart_items_cart',        'cart_id',           'carts',            'id', 'CASCADE');
  await ensureFK(db, 'order_events',       'fk_order_events_order',     'order_id',          'orders',           'id', 'CASCADE');
  await ensureFK(db, 'service_request_events', 'fk_sre_request',        'service_request_id','service_requests', 'id', 'CASCADE');
  await ensureFK(db, 'saved_tutorials',    'fk_saved_tutorials_tut',    'tutorial_id',       'tutorials',        'id', 'CASCADE');
  await ensureFK(db, 'help_articles',      'fk_help_articles_category', 'category_id',       'help_categories',  'id', 'CASCADE');

  // ── CHECK constraints (restaurados desde el esquema SQLite original) ───────
  await ensureCheck(db, 'users',      'chk_users_role',      "role IN ('particular','pro','admin')");
  await ensureCheck(db, 'cart_items', 'chk_cart_items_qty',  'quantity > 0');
  await ensureCheck(db, 'documents',  'chk_documents_type',  "type IN ('invoice','delivery_note')");
}

async function ensureColumn(db, table, column, definition) {
  const exists = (await db.prepare(`SHOW COLUMNS FROM ${table}`).all()).some((row) => row.Field === column);
  if (!exists) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * Añade una clave foránea solo si no existe ya.
 * Consulta INFORMATION_SCHEMA para ser idempotente (seguro ejecutar en cada arranque).
 * @param {string} onDelete  'CASCADE' | 'SET NULL' | null (→ RESTRICT por defecto)
 */
async function ensureFK(db, table, constraintName, column, refTable, refCol, onDelete = null) {
  try {
    const exists = await db.prepare(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    `).get(table, constraintName);
    if (!exists) {
      const onDeleteClause = onDelete ? ` ON DELETE ${onDelete}` : '';
      await db.exec(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraintName}\` FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\`(\`${refCol}\`)${onDeleteClause}`);
    }
  } catch (err) {
    // No interrumpimos el arranque si la FK falla (p.ej. datos huérfanos previos).
    // Se loguea para que el desarrollador pueda limpiar la BD si fuera necesario.
    console.warn(`[ensureFK] No se pudo añadir ${constraintName} en ${table}: ${err.message}`);
  }
}

/**
 * Añade un CHECK constraint solo si no existe ya.
 * Requiere MySQL 8.0.16+.
 */
async function ensureCheck(db, table, constraintName, checkExpr) {
  try {
    const exists = await db.prepare(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'CHECK'
    `).get(table, constraintName);
    if (!exists) {
      await db.exec(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraintName}\` CHECK (${checkExpr})`);
    }
  } catch (err) {
    console.warn(`[ensureCheck] No se pudo añadir ${constraintName} en ${table}: ${err.message}`);
  }
}

async function seed(db) {
  const users = Number((await db.prepare('SELECT COUNT(*) AS total FROM users').get()).total);
  if (users > 0) {
    await ensureAdminUser(db);
    await seedBrands(db);
    await seedProductVariants(db);
    await seedDemoAccountData(db);
    return;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (role, full_name, email, password_hash, phone, fiscal_id, pro_discount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  await insertUser.run('particular', 'Antonio García', 'antonio.garcia@correo.com', hashPassword('garperlux123'), '600111222', null, 0);
  await insertUser.run('pro', 'Jose Luis García', 'chispas@instaladoreseljaen.es', hashPassword('garperlux123'), '600333444', 'B12345678', 22);
  await ensureAdminUser(db);

  const insertCategory = db.prepare('INSERT INTO categories (slug, name, parent_id, description) VALUES (?, ?, ?, ?)');
  await await insertCategory.run('mecanismos', 'Mecanismos', null, 'Interruptores, enchufes, marcos y series compatibles.');
  await await insertCategory.run('iluminacion', 'Iluminación', null, 'Lámparas, bombillas LED, tiras y proyectores.');
  await await insertCategory.run('domotica', 'Domótica', null, 'Control inteligente para vivienda y local.');
  await await insertCategory.run('proteccion', 'Protección eléctrica', null, 'Magnetotérmicos, diferenciales y cuadros.');

  const insertBrand = db.prepare('INSERT INTO brands (slug, name, professional) VALUES (?, ?, ?)');
  await insertBrand.run('simon', 'Simón', 1);
  await insertBrand.run('lexman', 'Lexman', 1);
  await insertBrand.run('schneider', 'Schneider Electric', 1);
  await insertBrand.run('garperlux', 'GarperLux', 0);

  await seedBrands(db);

  const categoryBySlug = async (slug) => (await db.prepare("SELECT id FROM categories WHERE slug = ?").get(slug)).id;
  const brandBySlug = async (slug) => (await db.prepare("SELECT id FROM brands WHERE slug = ?").get(slug)).id;
  const insertProduct = db.prepare(`
    INSERT INTO products (sku, name, slug, category_id, brand_id, price, stock, safety_level, pro_only, description, specs_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await await insertProduct.run('SIM-75201-39', 'Interruptor conmutador Simon 75 grafito', 'interruptor-conmutador-simon-75-grafito', await categoryBySlug('mecanismos'), await brandBySlug('simon'), 12.95, 38, 'basic', 0, 'Mecanismo compatible con marcos Simon 75.', JSON.stringify({ voltage: '250V', amps: '10AX', finish: 'Grafito' }));
  await await insertProduct.run('LED-A60-9W-2700K', 'Bombilla LED A60 9W cálida', 'bombilla-led-a60-9w-calida', await categoryBySlug('iluminacion'), await brandBySlug('lexman'), 4.5, 120, 'basic', 0, 'Bombilla LED de luz cálida para uso doméstico.', JSON.stringify({ lumens: 806, kelvin: 2700, socket: 'E27' }));
  await await insertProduct.run('SCH-A9R60240', 'Diferencial Schneider 40A 30mA', 'diferencial-schneider-40a-30ma', await categoryBySlug('proteccion'), await brandBySlug('schneider'), 49.9, 14, 'pro', 1, 'Diferencial para cuadro eléctrico. Instalación por profesional autorizado.', JSON.stringify({ poles: 2, amps: '40A', sensitivity: '30mA' }));
  const itemsToInsert = [
    ['27101-31', 'Interruptor unipolar Simn 27 blanco', 'interruptor-unipolar-simon-27-blanco', 'mecanismos', 'simon', 5.42, 86, 'basic', 0],
    ['27201-31', 'Conmutador Simón 27 blanco', 'conmutador-simon-27-blanco', 'mecanismos', 'simon', 6.18, 74, 'basic', 0],
    ['27431-31', 'Base enchufe schuko Simón 27 blanco', 'base-enchufe-schuko-simon-27-blanco', 'mecanismos', 'simon', 7.9, 62, 'basic', 0],
    ['75101-39', 'Marco Simón 75 grafito 1 elemento', 'marco-simon-75-grafito-1-elemento', 'mecanismos', 'simon', 3.85, 140, 'basic', 0],
    ['27502-31', 'Doble interruptor Simón 27 blanco', 'doble-interruptor-simon-27-blanco', 'mecanismos', 'simon', 9.4, 33, 'basic', 0],
    ['8718699-04', 'Bombilla LED Lexman E27 cálida', 'bombilla-led-lexman-e27-calida', 'iluminacion', 'lexman', 4.2, 95, 'basic', 0],
    ['A9F74225', 'Magnetotérmico Schneider iC60N 25A', 'magnetotermico-schneider-ic60n-25a', 'proteccion', 'schneider', 18.6, 41, 'pro', 1],
    ['SHL-1M-G3', 'Relé domótico Shelly 1 Mini Gen3', 'rele-domotico-shelly-1-mini-gen3', 'domotica', 'garperlux', 16.9, 57, 'medium', 0],
    ['WH-DA-3', 'Detector de agua WiFi', 'detector-agua-wifi', 'domotica', 'garperlux', 19.95, 24, 'basic', 0],
    ['UNI-T-A03', 'Buscapolos profesional UNI-T', 'buscapolos-profesional-uni-t', 'proteccion', 'garperlux', 8.95, 51, 'basic', 0],
    ['PRY-MNG3-1.5', 'Cable manguera 3x1,5 mm²', 'cable-manguera-3x15', 'proteccion', 'garperlux', 1.15, 500, 'basic', 0],
    ['LX-PR50-65', 'Proyector LED exterior 50W IP65', 'proyector-led-exterior-50w-ip65', 'iluminacion', 'garperlux', 24.9, 29, 'basic', 0],
    ['LEG-401222', 'Cuadro superficie Legrand 12 módulos', 'cuadro-superficie-legrand-12-modulos', 'proteccion', 'garperlux', 22.5, 18, 'pro', 1],
  ];
  for (const [sku, name, slug, category, brand, price, stock, safety, proOnly] of itemsToInsert) {

    await insertProduct.run(sku, name, slug, await categoryBySlug(category), await brandBySlug(brand), price, stock, safety, proOnly, `${name}. Producto incorporado al catálogo provisional GarperLux.`, JSON.stringify({ provisional: true }));
  
  }

  const insertAddress = db.prepare(`
    INSERT INTO addresses (user_id, label, recipient, line1, city, province, postal_code, phone, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await insertAddress.run(1, 'Casa', 'Antonio García', 'Calle Real 12', 'Mengíbar', 'Jaén', '23620', '600111222', 1);
  await insertAddress.run(2, 'Nave taller', 'Jose Luis García', 'Polígono Industrial 4', 'Jaén', 'Jaén', '23009', '600333444', 1);

  await db.prepare('INSERT INTO payment_methods (user_id, type, label, last4, is_default) VALUES (?, ?, ?, ?, ?)').run(1, 'card', 'Visa personal', '4242', 1);
  await db.prepare('INSERT INTO payment_methods (user_id, type, label, last4, is_default) VALUES (?, ?, ?, ?, ?)').run(2, 'bank_transfer', 'Transferencia empresa', null, 1);

  db.prepare(`
    INSERT INTO fiscal_profiles (user_id, legal_name, tax_id, legal_form, vat_regime, cnae, license_number, license_expires, license_region, fiscal_address, postal_code, city, province, country, iban)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(2, 'Jose Luis García - El Chispas Instalaciones', 'B12345678', 'Autónomo', 'General', '4321 — Instalaciones eléctricas', 'BT-123456-AND', '2031-04', 'Andalucía', 'Polígono Los Olivares, nave 24', '23009', 'Jaén', 'Jaén', 'España', 'ES1200491234567890123456');

  await seedTutorialsCatalog(db);
  await seedTipsCatalog(db);

  await seedProductVariants(db);
  await seedDemoAccountData(db);
}

async function seedBrands(db) {
  // Migración: Ledvance → Lexman. Reasigna productos al nuevo slug y elimina el viejo.
  const oldBrand = await db.prepare("SELECT id FROM brands WHERE slug = 'ledvance'").get();
  if (oldBrand) {
    db.prepare(`
      INSERT INTO brands (slug, name, professional, is_official)
      VALUES ('lexman', 'Lexman', 1, 0)
      ON DUPLICATE KEY UPDATE slug=slug
    `).run();
    const newBrandId = (await db.prepare("SELECT id FROM brands WHERE slug = 'lexman'").get()).id;
    await db.prepare("UPDATE products SET brand_id = ? WHERE brand_id = ?").run(newBrandId, oldBrand.id);
    await db.prepare("DELETE FROM brands WHERE slug = 'ledvance'").run();
  }

  // UPSERT: si la marca ya existe (por scraper), actualiza la metadata oficial
  // (logo, descripción, país, año, web, categorías) sin tocar la columna name
  // que ya pueda tener un valor distinto en mayúsculas.
  const upsert = db.prepare(`
    INSERT INTO brands (slug, name, professional, is_official, logo, description, country, year_founded, website, categories_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      professional = VALUES(professional),
      is_official = VALUES(is_official),
      logo = VALUES(logo),
      description = VALUES(description),
      country = VALUES(country),
      year_founded = VALUES(year_founded),
      website = VALUES(website),
      categories_json = VALUES(categories_json)
  `);

  const brands = [
    ['simon', 'Simon', 1, 1, '/assets/img/marcas/simon.jpg',
      'Fabricante español de mecanismos eléctricos. Series 27, 75, 82 y 100. La gama 27 sigue siendo la más vendida desde 1986.',
      'España', '1916', 'https://www.simonelectric.com', ['Mecanismos']],
    ['schneider', 'Schneider Electric', 1, 1, '/assets/img/marcas/schneider.jpg',
      'Multinacional francesa especializada en gestión energética and automatización. Protecciones Acti9 and Resi9, domótica Wiser.',
      'Francia', '1836', 'https://www.se.com/es', ['Mecanismos', 'Protecciones eléctricas']],
    ['niessen', 'Niessen', 1, 0, '/assets/img/marcas/niessen.jpg',
      'Mecanismos premium con acabados de diseño. Series Sky, Zenit and Tacto. Marca histórica de Oiartzun, ahora parte de ABB.',
      'España', '1929', 'https://new.abb.com/niessen', ['Mecanismos']],
    ['legrand', 'Legrand', 1, 1, '/assets/img/marcas/legrand.jpg',
      'Grupo francés de infraestructura eléctrica. Cuadros modulares, protecciones, mecanismos Valena and Niloé, gestión de cables.',
      'Francia', '1865', 'https://www.legrand.es', ['Protecciones eléctricas']],
    ['televes', 'Televes', 1, 0, '/assets/img/marcas/televes.jpg',
      'Empresa gallega líder en telecomunicaciones. Antenas de TV, distribución de señal, fibra óptica and equipamiento de cabecera.',
      'España', '1958', 'https://www.televes.com', ['Antenas y telecomunicaciones']],
    ['shelly', 'Shelly', 1, 1, '/assets/img/marcas/shelly.png',
      'Domótica Wi-Fi sin nube obligatoria. Relés, módulos de control and sensores. El estándar de facto para automatización en vivienda existente.',
      'Bulgaria', '2017', 'https://www.shelly.com', ['Domótica']],
    ['chint', 'Chint', 1, 0, '/assets/img/marcas/chint.jpg',
      'Multinacional especializada en material eléctrico industrial. Magnetotérmicos, diferenciales, contactores and protecciones de baja tensión.',
      'China', '1984', 'https://www.chint.com', ['Protecciones eléctricas']],
    ['hager', 'Hager', 1, 1, '/assets/img/marcas/hager.jpg',
      'Cuadros modulares de gama profesional, telerruptores, magnetotérmicos and diferenciales tipo F. Referente en distribución de energía.',
      'Alemania', '1955', 'https://www.hager.es', ['Mecanismos', 'Protecciones eléctricas']],
    ['tegui', 'Tegui', 1, 0, '/assets/img/marcas/tegui.jpg',
      'Marca española especializada en porteros and videoporteros para comunidades and viviendas unifamiliares. Ahora parte de Legrand.',
      'España', null, 'https://www.legrand.es', ['Porteros y videoporteros']],
    ['fermax', 'Fermax', 1, 1, '/assets/img/marcas/fermax.jpg',
      'Fabricante valenciano de videoporteros, porteros automáticos and control de accesos. Referencia en el sector residencial.',
      'España', '1949', 'https://www.fermax.com', ['Porteros y videoporteros']],
    ['erreka', 'Erreka', 1, 0, '/assets/img/marcas/erreka.jpg',
      'Empresa vasca especializada en automatismos para puertas and accesos. Motores de puertas correderas, batientes and garaje.',
      'España', null, 'https://www.erreka.com', ['Automatismos']],
    ['nice', 'Nice', 1, 0, '/assets/img/marcas/nice.png',
      'Multinacional italiana de automatización de puertas, persianas and control de accesos. Motores para garaje, correderas and batientes.',
      'Italia', '1993', 'https://www.niceforyou.com', ['Automatismos']],
    ['pujol-muntala', 'Pujol Muntalá', 1, 0, '/assets/img/marcas/pujol.jpg',
      'Fabricante español de automatismos para puertas and persianas. Motores tubulares, centrales de maniobra and accesorios.',
      'España', null, 'https://www.pujol.com', ['Automatismos']],
    ['clemsa', 'Clemsa', 1, 0, '/assets/img/marcas/clemsa.png',
      'Empresa española especializada en automatismos para puertas de garaje, mandos a distancia and control de accesos.',
      'España', '1961', 'https://www.clemsa.es', ['Automatismos']],
    ['hikvision', 'Hikvision', 1, 0, '/assets/img/marcas/hikvision.jpg',
      'Líder mundial en videovigilancia. Cámaras IP, grabadores NVR/DVR and sistemas de seguridad profesional.',
      'China', '2001', 'https://www.hikvision.com', ['Seguridad']],
    ['dahua', 'Dahua', 1, 0, '/assets/img/marcas/dahua.jpg',
      'Soluciones de videovigilancia and seguridad. Cámaras IP, grabadores, intercomunicadores and control de accesos.',
      'China', '2001', 'https://www.dahuasecurity.com', ['Seguridad']],
    ['tapo', 'Tapo', 1, 0, '/assets/img/marcas/tapo.png',
      'Marca de TP-Link enfocada en seguridad doméstica and domótica asequible. Cámaras Wi-Fi, enchufes inteligentes and bombillas smart.',
      'China', null, 'https://www.tapo.com', ['Seguridad']],
    ['philips', 'Philips', 1, 0, '/assets/img/marcas/philips.jpg',
      'División de iluminación (ahora Signify). Bombillas LED, luminarias profesionales and sistema domótico Philips Hue.',
      'Países Bajos', '1891', 'https://www.signify.com', ['Iluminación', 'Domótica']],
    ['matel', 'Matel', 1, 0, '/assets/img/marcas/matel.jpg',
      'Fabricante español de iluminación LED and material eléctrico. Bombillas, downlights, plafones and proyectores LED con amplio catálogo.',
      'España', null, 'https://www.matelelectro.com', ['Iluminación']],
    ['lighted', 'LightEd', 1, 0, '/assets/img/marcas/lighted.webp',
      'Marca española de iluminación LED profesional. Bombillas, tubos, paneles and proyectores con relación calidad-precio orientada al instalador.',
      'España', null, 'https://www.lighted.es', ['Iluminación']],
    ['osram', 'Osram', 1, 0, '/assets/img/marcas/osram.jpg',
      'Multinacional alemana de iluminación. Bombillas LED, tubos fluorescentes, drivers and soluciones de iluminación profesional e industrial.',
      'Alemania', '1919', 'https://www.osram.com', ['Iluminación']],
    ['lexman', 'Lexman', 1, 0, '/assets/img/marcas/lexman.jpg',
      'Marca de iluminación LED de gama media-alta distribuida en grandes superficies. Bombillas, plafones, tiras LED and proyectores con buena relación calidad-precio.',
      'Francia', '2003', 'https://www.leroymerlin.es/marcas/lexman', ['Iluminación']],
  ];

  for (const [slug, name, professional, isOfficial, logo, description, country, yearFounded, website, categories] of brands) {

    await upsert.run(slug, name, professional, isOfficial, logo, description, country, yearFounded, website, JSON.stringify(categories));
  
  }
}

async function seedTutorialsCatalog(db) {
  // El catálogo vive en seeds/tutorials-catalog.json para que el contenido editorial
  // (intro, pasos, FAQs por tutorial) sea editable sin tocar lógica de DB.
  const catalogPath = require('node:path').join(__dirname, '..', 'seeds', 'tutorials-catalog.json');
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  } catch (err) {
    console.warn(`[seedTutorialsCatalog] catálogo no encontrado en ${catalogPath}: ${err.message}`);
    return;
  }

  const insertTutorial = db.prepare(`
    INSERT IGNORE INTO tutorials (
      slug, title, difficulty, safety_level, minutes, reviewer,
      related_product_skus, excerpt, category, location, has_video,
      cover_photo_id, cover_gradient, content_json, published_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Si la fila ya existe (DB con seed antiguo), refresca los campos ricos
  // para que el reseed siempre traiga el contenido canónico. No tocamos `views`
  // (contador dinámico).
  const updateRich = db.prepare(`
    UPDATE tutorials SET
      title = ?, difficulty = ?, safety_level = ?, minutes = ?, reviewer = ?,
      related_product_skus = ?, excerpt = ?, category = ?, location = ?,
      has_video = ?, cover_photo_id = ?, cover_gradient = ?, content_json = ?,
      published_at = COALESCE(published_at, ?)
    WHERE slug = ?
  `);

  // Limpia slugs del seed antiguo que ya no están en el catálogo nuevo. ON DELETE
  // CASCADE quita también las entradas de saved_tutorials que apuntaban a ellos.
  const obsoleteSlugs = ['cambiar-interruptor-sin-riesgos', 'instalar-videoportero-wifi', 'cortar-luz-circuito-correcto', 'polimetro-sin-miedo', 'temperatura-de-color', 'cambiar-enchufe-doble'];
  const placeholders = obsoleteSlugs.map(() => '?').join(',');
  await db.prepare(`DELETE FROM tutorials WHERE slug IN (${placeholders})`).run(...obsoleteSlugs);

  const publishedAt = new Date().toISOString().split('T')[0];

  for (const t of catalog) {
    const skus = JSON.stringify(t.related_product_skus || []);
    const content = JSON.stringify(t.content || {});
    const hasVideo = t.has_video ? 1 : 0;
    await insertTutorial.run(
      t.slug, t.title, t.difficulty, t.safety_level, t.minutes, t.reviewer,
      skus, t.excerpt || null, t.category || null, t.location || 'interior', hasVideo,
      t.cover_photo_id || null, t.cover_gradient || null, content, publishedAt,
    );
    await updateRich.run(
      t.title, t.difficulty, t.safety_level, t.minutes, t.reviewer,
      skus, t.excerpt || null, t.category || null, t.location || 'interior',
      hasVideo, t.cover_photo_id || null, t.cover_gradient || null, content,
      publishedAt, t.slug,
    );
  }
}

async function seedTipsCatalog(db) {
  // El catálogo de consejos (47 tips firmados por Alfonso Torres y otros) vive en
  // seeds/consejos-catalog.json. UPSERT por `number` para que reseed actualice
  // textos sin perder identidad.
  const catalogPath = require('node:path').join(__dirname, '..', 'seeds', 'consejos-catalog.json');
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  } catch (err) {
    console.warn(`[seedTipsCatalog] catálogo no encontrado en ${catalogPath}: ${err.message}`);
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO tips (number, category, body, author, author_initials, published_at, dark)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      category = VALUES(category),
      body = VALUES(body),
      author = VALUES(author),
      author_initials = VALUES(author_initials),
      published_at = VALUES(published_at),
      dark = VALUES(dark)
  `);

  for (const tip of catalog) {
    await upsert.run(
      tip.number,
      tip.category,
      tip.body,
      tip.author || 'Equipo GarperLux',
      tip.author_initials || (tip.author ? tip.author.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : 'EG'),
      tip.published_at,
      tip.dark ? 1 : 0,
    );
  }
}

async function seedHelpCenter(db) {
  // El catálogo del centro de ayuda vive en seeds/help-center.json para que
  // el contenido editorial (categorías + preguntas/respuestas) sea editable
  // sin tocar lógica de DB. Cada vez que arranca se hace upsert idempotente:
  // - mantiene IDs si las categorías/artículos ya existen
  // - actualiza textos y orden si han cambiado en el JSON
  // - elimina categorías/artículos cuyos slugs ya no aparecen en el JSON
  const catalogPath = require('node:path').join(__dirname, '..', 'seeds', 'help-center.json');
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  } catch (err) {
    console.warn(`[seedHelpCenter] catálogo no encontrado en ${catalogPath}: ${err.message}`);
    return;
  }
  const categories = catalog.categories || [];

  const insertCategory = db.prepare(`
    INSERT INTO help_categories (slug, name, short_label, description, icon_svg, accent, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      short_label = VALUES(short_label),
      description = VALUES(description),
      icon_svg = VALUES(icon_svg),
      accent = VALUES(accent),
      sort_order = VALUES(sort_order)
  `);
  const insertArticle = db.prepare(`
    INSERT INTO help_articles (category_id, slug, question, answer_html, keywords, sort_order, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      category_id = VALUES(category_id),
      question = VALUES(question),
      answer_html = VALUES(answer_html),
      keywords = VALUES(keywords),
      sort_order = VALUES(sort_order),
      featured = VALUES(featured)
  `);
  const getCategoryId = db.prepare('SELECT id FROM help_categories WHERE slug = ?');

  const keepCategorySlugs = [];
  const keepArticleSlugs = [];
  let articleOrder = 0;
  for (const cat of categories) {
    await await insertCategory.run(
      cat.slug, cat.name, cat.short_label, cat.description || null,
      cat.icon_svg || null, cat.accent || 'default', cat.sort_order || 0,
    );
    keepCategorySlugs.push(cat.slug);
    const categoryId = (await getCategoryId.get(cat.slug)).id;
    for (const article of cat.articles || []) {
      await insertArticle.run(
        categoryId, article.slug, article.question, article.answer_html,
        article.keywords || '', article.sort_order ?? articleOrder++,
        article.featured ? 1 : 0,
      );
      keepArticleSlugs.push(article.slug);
    }
  }

  // Limpia artículos/categorías que ya no están en el JSON. Hacemos artículos
  // primero por si una categoría desaparece pero sus artículos no — quedarían
  // huérfanos sin la FK on-delete-cascade, y queremos forzar consistencia con el JSON.
  if (keepArticleSlugs.length) {
    const ph = keepArticleSlugs.map(() => '?').join(',');
    await db.prepare(`DELETE FROM help_articles WHERE slug NOT IN (${ph})`).run(...keepArticleSlugs);
  }
  if (keepCategorySlugs.length) {
    const ph = keepCategorySlugs.map(() => '?').join(',');
    await db.prepare(`DELETE FROM help_categories WHERE slug NOT IN (${ph})`).run(...keepCategorySlugs);
  }
}

async function seedDemoAccountData(db) {
  // Idempotent: solo insertar si el usuario aún no tiene datos demo.
  // Asegura tutoriales catálogo (puede faltar en DBs preexistentes con un único tutorial).
  await seedTutorialsCatalog(db);
  await seedTipsCatalog(db);
  await seedHelpCenter(db);

  const antonio = await db.prepare('SELECT id FROM users WHERE email = ?').get('antonio.garcia@correo.com');
  const chispas = await db.prepare('SELECT id FROM users WHERE email = ?').get('chispas@instaladoreseljaen.es');

  const skuToId = async (sku) => (await db.prepare("SELECT id FROM products WHERE sku = ?").get(sku))?.id;
  const tutorialBySlug = async (slug) => (await db.prepare("SELECT id FROM tutorials WHERE slug = ?").get(slug))?.id;

  const insertFavorite = db.prepare('INSERT IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)');
  const insertSaved = db.prepare(`
    INSERT IGNORE INTO saved_tutorials (user_id, tutorial_id, progress, notes)
    VALUES (?, ?, ?, ?)
  `);
  const insertServiceRequest = db.prepare(`
    INSERT INTO service_requests (code, user_id, status, service_type, urgency, address, description, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertServiceEvent = db.prepare(`
    INSERT INTO service_request_events (service_request_id, status, title, description, happened_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // ===== ANTONIO (particular) =====
  if (antonio) {
    const hasFavs = (await db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?').get(antonio.id)).n;
    if (!hasFavs) {
      for (const sku of ['27101-31', '8718699-04', 'UNI-T-A03', 'A9F74225', 'SHL-1M-G3', 'WH-DA-3']) {
        const id = await skuToId(sku);
        if (id) await insertFavorite.run(antonio.id, id);
      }
    }

    const hasSaved = (await db.prepare('SELECT COUNT(*) AS n FROM saved_tutorials WHERE user_id = ?').get(antonio.id)).n;
    if (!hasSaved) {
      [
        ['cambiar-interruptor-desgastado', 65, 'Pendiente paso 5: probar conmutación.'],
        ['domotizar-interruptor-shelly-1mini', 22, null],
        ['voltios-vatios-amperios-en-5-min', 100, null],
        ['cortar-luz-del-circuito-correcto', 100, null],
        ['usar-polimetro-sin-miedo', 100, null],
        ['entender-temperatura-de-color', 100, null],
        ['cambiar-enchufe-schuko-suelto', 100, null],
      ];
      for (const [slug, progress, notes] of [
        ['usar-polimetro-sin-miedo', 100, null],
        ['entender-temperatura-de-color', 100, null],
        ['cambiar-enchufe-schuko-suelto', 100, null],
      ]) {
        const id = await tutorialBySlug(slug);
        if (id) await insertSaved.run(antonio.id, id, progress, notes);
      }
    }

    const hasRequests = (await db.prepare('SELECT COUNT(*) AS n FROM service_requests WHERE user_id = ?').get(antonio.id)).n;
    if (!hasRequests) {
      const seedRequest = async (req) => {
        const result = await insertServiceRequest.run(req.code, antonio.id, req.status, req.service_type, req.urgency, req.address, req.description, JSON.stringify(req.payload), req.created_at);
        for (const ev of req.events) await insertServiceEvent.run(result.lastInsertRowid, ev.status, ev.title, ev.description, ev.happened_at);
      };
      await seedRequest({
        code: 'GLX-2026-04-2748',
        status: 'reviewing',
        service_type: 'Avería eléctrica',
        urgency: 'urgent',
        address: 'Calle Real 12, Mengíbar (Jaén)',
        description: 'Salta el automático al enchufar el microondas.',
        payload: { category: 'electricidad', contactPhone: '600111222' },
        created_at: '2026-04-26 18:42:00',
        events: [
          { status: 'received', title: 'Solicitud recibida', description: 'Hemos registrado la solicitud.', happened_at: '2026-04-26 18:42:00' },
          { status: 'reviewing', title: 'En revisión', description: 'Estamos revisando la información para asignar técnico.', happened_at: '2026-04-26 18:55:00' },
        ],
      });
      await seedRequest({
        code: 'GLX-2026-03-2104',
        status: 'resolved',
        service_type: 'Cambio de magnetotérmico defectuoso',
        urgency: 'normal',
        address: 'Calle Real 12, Mengíbar (Jaén)',
        description: 'Magnetotérmico de cocina con disparo intermitente.',
        payload: { category: 'protecciones', technician: 'Alfonso T.', invoiceTotal: 125.4 },
        created_at: '2026-03-15 10:10:00',
        events: [
          { status: 'received', title: 'Solicitud recibida', description: null, happened_at: '2026-03-15 10:10:00' },
          { status: 'scheduled', title: 'Visita programada', description: 'Cita confirmada con Alfonso T.', happened_at: '2026-03-16 09:00:00' },
          { status: 'resolved', title: 'Resuelto', description: 'Magnetotérmico sustituido y verificado.', happened_at: '2026-03-18 13:25:00' },
        ],
      });
      await seedRequest({
        code: 'GLX-2026-02-1487',
        status: 'resolved',
        service_type: 'Instalación de videoportero Wi-Fi',
        urgency: 'normal',
        address: 'Calle Real 12, Mengíbar (Jaén)',
        description: 'Instalación de videoportero Shelly con conexión Wi-Fi.',
        payload: { category: 'domotica', technician: 'Pedro R.', invoiceTotal: 298.0 },
        created_at: '2026-02-18 11:00:00',
        events: [
          { status: 'received', title: 'Solicitud recibida', description: null, happened_at: '2026-02-18 11:00:00' },
          { status: 'resolved', title: 'Resuelto', description: 'Videoportero instalado y configurado.', happened_at: '2026-02-22 17:45:00' },
        ],
      });
      await seedRequest({
        code: 'GLX-2026-01-0892',
        status: 'cancelled',
        service_type: 'Revisión preventiva anual',
        urgency: 'normal',
        address: 'Calle Real 12, Mengíbar (Jaén)',
        description: 'Revisión preventiva del cuadro eléctrico.',
        payload: { category: 'mantenimiento' },
        created_at: '2026-01-10 09:00:00',
        events: [
          { status: 'received', title: 'Solicitud recibida', description: null, happened_at: '2026-01-10 09:00:00' },
          { status: 'cancelled', title: 'Cancelada por el cliente', description: 'El cliente reagendará más adelante.', happened_at: '2026-01-15 12:30:00' },
        ],
      });
    }
  }

  // ===== JOSE LUIS "EL CHISPAS" (pro) =====
  if (chispas) {
    const hasFavs = (await db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?').get(chispas.id)).n;
    if (!hasFavs) {
      // Para pro mostramos lista densa de material habitual.
      for (const sku of ['27101-31', '27201-31', '27431-31', '75101-39', '27502-31', 'A9F74225', 'SCH-A9R60240', 'SHL-1M-G3', 'PRY-MNG3-1.5', 'LEG-401222', 'LX-PR50-65', 'LED-A60-9W-2700K', 'UNI-T-A03', 'WH-DA-3', '8718699-04']) {
        const id = await skuToId(sku);
        if (id) await insertFavorite.run(chispas.id, id);
      }
    }

    const hasSaved = (await db.prepare('SELECT COUNT(*) AS n FROM saved_tutorials WHERE user_id = ?').get(chispas.id)).n;
    if (!hasSaved) {
      [
        ['cambiar-interruptor-desgastado', 100, null],
        ['usar-polimetro-sin-miedo', 100, null],
        ['cortar-luz-del-circuito-correcto', 100, null],
      ];
      for (const [slug, progress, notes] of [
        ['cambiar-interruptor-desgastado', 100, null],
        ['usar-polimetro-sin-miedo', 100, null],
        ['cortar-luz-del-circuito-correcto', 100, null],
      ]) {
        const id = await tutorialBySlug(slug);
        if (id) await insertSaved.run(chispas.id, id, progress, notes);
      }
    }

    await seedProOrders(db, chispas.id);
    await seedProQuotes(db, chispas.id);
    await seedProRecurringOrders(db, chispas.id);
  }
}

function moneyRound(n) { return Math.round(Number(n) * 100) / 100; }

async function seedProOrders(db, userId) {
  const has = (await db.prepare('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?').get(userId)).n;
  if (has) return;

  const skuRow = async (sku) => await db.prepare('SELECT id, sku, name, price FROM products WHERE sku = ?').get(sku);
  const proDiscount = Number((await db.prepare('SELECT pro_discount FROM users WHERE id = ?').get(userId)).pro_discount || 0);
  const applyPro = (price) => moneyRound(price * (1 - proDiscount / 100));

  const insertOrder = db.prepare(`
    INSERT INTO orders (code, user_id, status, total, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertOrderEvent = db.prepare(`
    INSERT INTO order_events (order_id, status, title, description, happened_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertDocument = db.prepare(`
    INSERT INTO documents (user_id, type, code, related_order_code, total, payload_json, issued_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Definición declarativa: cada plantilla genera un pedido con sus albaranes/facturas.
  const ORDERS = [
    {
      code: 'GLX-2026-04-1184', status: 'completed', created_at: '2026-04-26 11:42:00',
      worksite: 'Stock taller', customer: 'Stock taller', address: 'Polígono Los Olivares, nave 24 · 23009 Jaén',
      shippingMethod: { id: 'pickup', label: 'Recogida en almacén', price: 0, eta: 'Inmediato' },
      paymentMethod: { id: 'transfer', label: 'Transferencia · 30 días', type: 'bank_transfer' },
      lines: [
        ['27101-31', 8], ['A9F74225', 5], ['LED-A60-9W-2700K', 12], ['PRY-MNG3-1.5', 50],
      ],
      eventsExtra: [
        { status: 'shipped', title: 'Preparado en almacén', description: 'Recogida disponible.', happened_at: '2026-04-26 12:00:00' },
        { status: 'completed', title: 'Entregado y firmado', description: 'Albarán firmado por J.L. García.', happened_at: '2026-04-26 12:14:00' },
      ],
      documents: { invoice: { code: 'FAC-2026-04-184', issued_at: '2026-04-26 14:32:00', dueAt: '2026-05-26', paid: false }, delivery: { code: 'ALB-2026-04-1184', issued_at: '2026-04-26 12:14:00', signedBy: 'J.L. García' } },
    },
    {
      code: 'GLX-2026-04-1178', status: 'completed', created_at: '2026-04-25 10:18:00',
      worksite: 'Stock taller', customer: 'Stock taller', address: 'Polígono Los Olivares, nave 24 · 23009 Jaén',
      shippingMethod: { id: 'standard', label: 'Envío estándar', price: 0, eta: '24-48 h' },
      paymentMethod: { id: 'card', label: 'Visa •••• 4242', type: 'card' },
      lines: [['A9F74225', 8], ['SCH-A9R60240', 6]],
      eventsExtra: [{ status: 'completed', title: 'Entregado', description: null, happened_at: '2026-04-26 09:30:00' }],
      documents: { invoice: { code: 'FAC-2026-04-178', issued_at: '2026-04-25 11:00:00', dueAt: null, paid: true }, delivery: { code: 'ALB-2026-04-1178', issued_at: '2026-04-26 09:30:00', signedBy: 'J.L. García' } },
    },
    {
      code: 'GLX-2026-04-1162', status: 'completed', created_at: '2026-04-22 09:05:00',
      worksite: 'C/ Bernabé Soriano 12', customer: 'Familia López', address: 'Calle Bernabé Soriano 12 · 23001 Jaén',
      shippingMethod: { id: 'standard', label: 'Envío a obra', price: 0, eta: 'Mañana' },
      paymentMethod: { id: 'transfer', label: 'Transferencia · 30 días', type: 'bank_transfer' },
      lines: [
        ['LEG-401222', 1], ['A9F74225', 4], ['SCH-A9R60240', 2], ['27101-31', 12],
        ['27201-31', 6], ['27431-31', 8], ['75101-39', 14], ['PRY-MNG3-1.5', 80],
      ],
      eventsExtra: [
        { status: 'shipped', title: 'Enviado a obra', description: 'Transportista local.', happened_at: '2026-04-22 17:00:00' },
        { status: 'completed', title: 'Entregado en obra', description: 'Recibido por María López.', happened_at: '2026-04-23 10:20:00' },
      ],
      documents: { invoice: { code: 'FAC-2026-04-162', issued_at: '2026-04-22 18:30:00', dueAt: '2026-05-22', paid: false }, delivery: { code: 'ALB-2026-04-1162', issued_at: '2026-04-23 10:20:00', signedBy: 'M. López Ruiz' } },
    },
    {
      code: 'GLX-2026-04-1141', status: 'completed', created_at: '2026-04-19 12:35:00',
      worksite: 'Stock taller', customer: 'Stock taller', address: 'Polígono Los Olivares, nave 24 · 23009 Jaén',
      shippingMethod: { id: 'pickup', label: 'Recogida en almacén', price: 0, eta: 'Inmediato' },
      paymentMethod: { id: 'card', label: 'Visa •••• 4242', type: 'card' },
      lines: [['UNI-T-A03', 2], ['PRY-MNG3-1.5', 50], ['LED-A60-9W-2700K', 24], ['8718699-04', 16]],
      eventsExtra: [{ status: 'completed', title: 'Recogido', description: null, happened_at: '2026-04-19 13:50:00' }],
      documents: { invoice: { code: 'FAC-2026-04-141', issued_at: '2026-04-19 13:00:00', dueAt: null, paid: true }, delivery: { code: 'ALB-2026-04-1141', issued_at: '2026-04-19 13:50:00', signedBy: 'J.L. García' } },
    },
    {
      code: 'GLX-2026-04-1098', status: 'completed', created_at: '2026-04-15 16:40:00',
      worksite: 'Familia López · Domótica', customer: 'Familia López', address: 'Calle Bernabé Soriano 12 · 23001 Jaén',
      shippingMethod: { id: 'standard', label: 'Envío a obra', price: 0, eta: '24 h' },
      paymentMethod: { id: 'transfer', label: 'Transferencia · 30 días', type: 'bank_transfer' },
      lines: [['SHL-1M-G3', 5], ['WH-DA-3', 2], ['LX-PR50-65', 1]],
      eventsExtra: [{ status: 'completed', title: 'Instalado', description: 'Escenas Shelly programadas.', happened_at: '2026-04-16 19:00:00' }],
      documents: { invoice: { code: 'FAC-2026-04-098', issued_at: '2026-04-15 17:30:00', dueAt: '2026-05-15', paid: false }, delivery: { code: 'ALB-2026-04-1098', issued_at: '2026-04-16 19:00:00', signedBy: 'M. López Ruiz' } },
    },
    {
      code: 'GLX-2026-03-0982', status: 'completed', created_at: '2026-03-28 09:10:00',
      worksite: 'Stock taller', customer: 'Stock taller', address: 'Polígono Los Olivares, nave 24 · 23009 Jaén',
      shippingMethod: { id: 'standard', label: 'Envío estándar', price: 0, eta: '48 h' },
      paymentMethod: { id: 'card', label: 'Visa •••• 4242', type: 'card' },
      lines: [['27101-31', 25], ['27201-31', 10], ['PRY-MNG3-1.5', 100], ['8718699-04', 20]],
      eventsExtra: [{ status: 'completed', title: 'Entregado', description: null, happened_at: '2026-03-30 11:00:00' }],
      documents: { invoice: { code: 'FAC-2026-03-082', issued_at: '2026-03-28 10:00:00', dueAt: null, paid: true }, delivery: { code: 'ALB-2026-03-0982', issued_at: '2026-03-30 11:00:00', signedBy: 'J.L. García' } },
    },
    {
      code: 'GLX-2026-03-0871', status: 'completed', created_at: '2026-03-12 14:20:00',
      worksite: 'Sr. Martínez · Avda. Andalucía', customer: 'Sr. Martínez', address: 'Avda. Andalucía 18 · 23005 Jaén',
      shippingMethod: { id: 'standard', label: 'Envío a obra', price: 0, eta: '48 h' },
      paymentMethod: { id: 'transfer', label: 'Transferencia · 30 días', type: 'bank_transfer' },
      lines: [['SHL-1M-G3', 4], ['27502-31', 3], ['PRY-MNG3-1.5', 30]],
      eventsExtra: [{ status: 'completed', title: 'Entregado', description: null, happened_at: '2026-03-14 12:00:00' }],
      documents: { invoice: { code: 'FAC-2026-03-071', issued_at: '2026-03-12 15:00:00', dueAt: null, paid: true }, delivery: { code: 'ALB-2026-03-0871', issued_at: '2026-03-14 12:00:00', signedBy: 'A. Martínez' } },
    },
  ];

  for (const tmpl of ORDERS) {
    const items = [];
    let subtotal = 0;
    for (const [sku, qty] of tmpl.lines) {
      const p = await skuRow(sku);
      if (!p) continue;
      const unitPro = applyPro(p.price);
      const lineTotal = moneyRound(unitPro * qty);
      subtotal += lineTotal;
      items.push({ id: p.id, sku: p.sku, name: p.name, price: p.price, proPrice: unitPro, quantity: qty, lineTotal });
    }
    subtotal = moneyRound(subtotal);
    const tax = moneyRound(subtotal * 0.21);
    const total = moneyRound(subtotal + tax);

    const orderPayload = {
      cart: { items, subtotal },
      checkout: {
        shippingAddress: tmpl.address,
        shippingMethod: tmpl.shippingMethod.id,
        worksite: tmpl.worksite,
        customer: tmpl.customer,
        addressLabel: tmpl.address,
        summary: tmpl.worksite,
      },
      totals: { subtotal, tax, shipping: 0, discount: 0, total, shippingMethod: tmpl.shippingMethod, coupon: null },
      paymentMethod: tmpl.paymentMethod,
    };

    const result = await insertOrder.run(tmpl.code, userId, tmpl.status, total, JSON.stringify(orderPayload), tmpl.created_at);
    const orderId = result.lastInsertRowid;
    await insertOrderEvent.run(orderId, 'confirmed', 'Pedido recibido', 'Hemos registrado el pedido correctamente.', tmpl.created_at);
    await insertOrderEvent.run(orderId, 'paid', 'Pago confirmado', `Pago confirmado con ${tmpl.paymentMethod.label}.`, tmpl.created_at);
    await insertOrderEvent.run(orderId, 'preparing', 'En preparación', 'Estamos preparando el pedido en almacén.', tmpl.created_at);
    for (const ev of (tmpl.eventsExtra || [])) await insertOrderEvent.run(orderId, ev.status, ev.title, ev.description, ev.happened_at);

    // Documentos asociados (albarán + factura) con payload_json para el detalle.
    const baseDocPayload = {
      orderCode: tmpl.code,
      worksite: tmpl.worksite,
      customer: tmpl.customer,
      address: tmpl.address,
      items,
      subtotal,
      tax,
      total,
      paymentMethod: tmpl.paymentMethod,
    };

    if (tmpl.documents.delivery) {
      const d = tmpl.documents.delivery;
      await insertDocument.run(userId, 'delivery_note', d.code, tmpl.code, subtotal, JSON.stringify({ ...baseDocPayload, signedBy: d.signedBy, signedAt: d.issued_at, status: 'delivered' }), d.issued_at);
    }
    if (tmpl.documents.invoice) {
      const f = tmpl.documents.invoice;
      await insertDocument.run(userId, 'invoice', f.code, tmpl.code, total, JSON.stringify({ ...baseDocPayload, dueAt: f.dueAt, paid: f.paid, status: f.paid ? 'paid' : 'pending' }), f.issued_at);
    }
  }
}

async function seedProQuotes(db, userId) {
  const has = (await db.prepare('SELECT COUNT(*) AS n FROM quotes WHERE user_id = ?').get(userId)).n;
  if (has) return;
  const proDiscount = Number((await db.prepare('SELECT pro_discount FROM users WHERE id = ?').get(userId)).pro_discount || 0);
  const applyPro = (p) => moneyRound(p * (1 - proDiscount / 100));
  const skuRow = async (sku) => await db.prepare('SELECT id, sku, name, price FROM products WHERE sku = ?').get(sku);

  const insertQuote = db.prepare(`
    INSERT INTO quotes (code, user_id, status, title, total, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const QUOTES = [
    {
      code: 'PRES-2026-0028', status: 'sent',
      title: 'Renovación cuadro · Familia López',
      created_at: '2026-04-24 18:20:00', validityDays: 10,
      customer: { name: 'Familia López', contact: 'María López Ruiz', email: 'maria.lopez@gmail.com', phone: '660 555 777', address: 'Calle Bernabé Soriano 12, 3º A · 23001 Jaén' },
      description: 'Renovación completa del cuadro general de protección de la vivienda según REBT actualizado.',
      lines: [
        { kind: 'product', sku: 'LEG-401222', quantity: 1 },
        { kind: 'product', sku: 'A9F74225', quantity: 8 },
        { kind: 'product', sku: 'SCH-A9R60240', quantity: 2 },
        { kind: 'free', concept: 'Cableado interior cuadro + peinetas + bornas', quantity: 1, unitPrice: 38.90, note: 'Material auxiliar' },
        { kind: 'free', concept: 'Mano de obra · jornada 8 h instalador BT', quantity: 8, unitPrice: 35.00, note: 'Incluye desmontaje + montaje + pruebas' },
        { kind: 'free', concept: 'Boletín eléctrico oficial sellado', quantity: 1, unitPrice: 85.00, note: 'Modelo MTD para tramitar con compañía' },
      ],
      conditions: ['Forma de pago: 30 % al aceptar · 70 % al finalizar', 'Tiempo de ejecución: 1 día laboral', 'Garantía: 3 años en mano de obra · garantía fabricante en material', 'No incluye: obra civil derivada de tirar tabiques o canalización nueva'],
    },
    {
      code: 'PRES-2026-0027', status: 'sent',
      title: 'Domótica salón · Sr. Martínez',
      created_at: '2026-04-22 11:10:00', validityDays: 10,
      customer: { name: 'Sr. Martínez', contact: 'Antonio Martínez', email: 'a.martinez@correo.com', phone: '655 444 333', address: 'Avda. Andalucía 18 · 23005 Jaén' },
      description: 'Instalación domótica salón con escenas Shelly y persianas motorizadas.',
      lines: [
        { kind: 'product', sku: 'SHL-1M-G3', quantity: 5 },
        { kind: 'product', sku: '27502-31', quantity: 3 },
        { kind: 'product', sku: 'PRY-MNG3-1.5', quantity: 30 },
        { kind: 'free', concept: 'Programación escenas Home Assistant', quantity: 1, unitPrice: 75.00, note: 'Configuración y prueba' },
        { kind: 'free', concept: 'Mano de obra · 4 h instalador BT', quantity: 4, unitPrice: 35.00, note: 'Instalación + cableado' },
      ],
      conditions: ['Pago al finalizar', 'Tiempo de ejecución: 4 horas', 'Garantía: 2 años configuración + fabricante en material'],
    },
    {
      code: 'PRES-2026-0024', status: 'accepted',
      title: 'Iluminación local comercial · Café Plaza',
      created_at: '2026-03-18 09:30:00', validityDays: 15,
      customer: { name: 'Café Plaza', contact: 'Lucía Fernández', email: 'lucia@cafeplaza.es', phone: '953 111 222', address: 'Plaza de la Constitución 4 · 23001 Jaén' },
      description: 'Sustitución completa de iluminación a LED en local comercial.',
      lines: [
        { kind: 'product', sku: 'LX-PR50-65', quantity: 4 },
        { kind: 'product', sku: 'LED-A60-9W-2700K', quantity: 30 },
        { kind: 'product', sku: '8718699-04', quantity: 12 },
        { kind: 'free', concept: 'Mano de obra · 6 h instalador BT', quantity: 6, unitPrice: 35.00, note: '' },
      ],
      conditions: ['Forma de pago: 50 % al aceptar · 50 % al finalizar', 'Tiempo de ejecución: 1 jornada'],
    },
    {
      code: 'PRES-2026-0019', status: 'rejected',
      title: 'Climatización oficina · GestoríaJaén',
      created_at: '2026-02-12 16:00:00', validityDays: 15,
      customer: { name: 'GestoríaJaén', contact: 'Pedro Ruiz', email: 'pedro@gestoriajaen.com', phone: '953 200 100', address: 'C/ Roldán y Marín 12 · 23001 Jaén' },
      description: 'Instalación eléctrica para nuevo equipo de climatización industrial.',
      lines: [
        { kind: 'free', concept: 'Línea eléctrica dedicada 6mm²', quantity: 25, unitPrice: 4.20, note: 'Por metro' },
        { kind: 'product', sku: 'A9F74225', quantity: 1 },
        { kind: 'free', concept: 'Mano de obra · 5 h', quantity: 5, unitPrice: 35.00, note: '' },
      ],
      conditions: ['Pago contra factura 30 días', 'Validez 15 días'],
    },
    {
      code: 'PRES-2026-0029', status: 'draft',
      title: 'Borrador · Reforma cocina',
      created_at: '2026-04-30 12:00:00', validityDays: 10,
      customer: { name: '', contact: '', email: '', phone: '', address: '' },
      description: 'Borrador en preparación.',
      lines: [],
      conditions: [],
    },
  ];

  for (const q of QUOTES) {
    const enriched = await Promise.all(q.lines.map(async (line) => {
      if (line.kind === 'product') {
        const p = await skuRow(line.sku);
        if (!p) return null;
        const unit = applyPro(p.price);
        return { kind: 'product', sku: p.sku, name: p.name, quantity: line.quantity, unitPrice: unit, originalPrice: p.price, lineTotal: moneyRound(unit * line.quantity) };
      }
      return { kind: 'free', concept: line.concept, quantity: line.quantity, unitPrice: line.unitPrice, note: line.note || '', lineTotal: moneyRound(line.unitPrice * line.quantity) };
    })).then(r => r.filter(Boolean));
    const subtotal = moneyRound(enriched.reduce((s, l) => s + l.lineTotal, 0));
    const tax = moneyRound(subtotal * 0.21);
    const total = moneyRound(subtotal + tax);
    const payload = { ...q, items: enriched, subtotal, tax, total };
    await insertQuote.run(q.code, userId, q.status, q.title, total, JSON.stringify(payload), q.created_at);
  }
}

async function seedProRecurringOrders(db, userId) {
  const has = (await db.prepare('SELECT COUNT(*) AS n FROM recurring_orders WHERE user_id = ?').get(userId)).n;
  if (has) return;
  const insertRec = db.prepare(`
    INSERT INTO recurring_orders (code, user_id, name, frequency, next_run_at, status, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const items = [
    { sku: '27101-31', name: 'Interruptor Simón 27 10A blanco', quantity: 25, unitPrice: 4.23 },
    { sku: 'PRY-MNG3-1.5', name: 'Cable manguera 3x1,5 mm²', quantity: 100, unitPrice: 0.90 },
    { sku: 'LED-A60-9W-2700K', name: 'Bombilla LED A60 9W cálida', quantity: 24, unitPrice: 3.51 },
  ];
  const subtotal = moneyRound(items.reduce((s, it) => s + it.quantity * it.unitPrice, 0));
  await insertRec.run(
    'REC-2026-0001', userId, 'Reposición taller mensual', 'monthly', '2026-05-05',
    'active',
    JSON.stringify({ items, subtotal, dayOfMonth: 5, addressLabel: 'Polígono Los Olivares, nave 24 · 23009 Jaén', paymentMethodLabel: 'Aplazado 30 días (cuenta pro)' }),
    '2026-04-05 09:00:00'
  );
}


async function ensureAdminUser(db) {
  const exists = await db.prepare('SELECT id FROM users WHERE email = ?').get('admin@garperlux.local');
  if (exists) return;
  db.prepare(`
    INSERT INTO users (role, full_name, email, password_hash, phone, fiscal_id, pro_discount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('admin', 'Administración GarperLux', 'admin@garperlux.local', hashPassword('garperlux123'), '953212223', null, 0);
}

async function seedProductVariants(db) {
  const variants = Number((await db.prepare('SELECT COUNT(*) AS total FROM product_variants').get()).total);
  if (variants > 0) return;

  const product = await db.prepare('SELECT id FROM products WHERE sku = ?').get('27101-31');
  if (!product) return;

  const insertVariant = db.prepare(`
    INSERT INTO product_variants (product_id, sku, finish, amps, price, stock, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVariants = [
    ['27101-31', 'Blanco', '10 A', 5.42, 86, 1],
    ['27101-32', 'Marfil', '10 A', 5.62, 34, 0],
    ['27101-39', 'Aluminio', '10 A', 6.25, 19, 0],
    ['27101-31-16A', 'Blanco', '16 A', 6.10, 42, 0],
    ['27101-32-16A', 'Marfil', '16 A', 6.30, 18, 0],
    ['27101-39-16A', 'Aluminio', '16 A', 6.90, 11, 0],
    ['27101-31-20A', 'Blanco', '20 A', 7.20, 12, 0],
    ['27101-32-20A', 'Marfil', '20 A', 7.40, 8, 0],
    ['27101-39-20A', 'Aluminio', '20 A', 8.10, 5, 0],
  ];
  for (const variant of insertVariants) await insertVariant.run(product.id, ...variant);
}

module.exports = { connect, getDb };
