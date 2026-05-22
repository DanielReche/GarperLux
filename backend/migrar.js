const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const mysql = require('mysql2/promise');

async function iniciarMigracion() {
    console.log("⏳ Conectando a las bases de datos...");

    let sqliteDb;
    let mysqlDb;

    try {
        // 1. Conexión a SQLite
        sqliteDb = await open({
            filename: 'C:/GarperLux/backend/database/garperlux.sqlite',
            driver: sqlite3.Database
        });

        // 2. Conexión a MySQL (vía Router puerto 6446)
        mysqlDb = await mysql.createConnection({
            host: '127.0.0.1',
            port: 6446,
            user: 'garperlux',
            password: 'garperlux',
            database: 'garperlux'
        });

        console.log("✅ Conexiones listas. Limpiando tablas antiguas...");

        // Desactivamos checks para poder vaciar todo sin errores de integridad
        await mysqlDb.query('SET FOREIGN_KEY_CHECKS = 0');

        const tablas = ['product_variants', 'products', 'tutorials', 'categories', 'brands'];
        for (const tabla of tablas) {
            await mysqlDb.query(`TRUNCATE TABLE ${tabla}`);
        }

        console.log("🧹 Base de datos limpia. Empezando migración por orden jerárquico...");

        // --- 1. MIGRAR CATEGORIES ---
        const categorias = await sqliteDb.all('SELECT * FROM categories');
        console.log(`📦 Insertando ${categorias.length} categorías...`);
        for (const c of categorias) {
            await mysqlDb.execute(
                `INSERT INTO categories (id, slug, name, parent_id, description) VALUES (?, ?, ?, ?, ?)`,
                [c.id, c.slug, c.name, c.parent_id, c.description]
            );
        }

        // --- 2. MIGRAR BRANDS ---
        const marcas = await sqliteDb.all('SELECT * FROM brands');
        console.log(`📦 Insertando ${marcas.length} marcas...`);
        for (const b of marcas) {
            await mysqlDb.execute(
                `INSERT INTO brands (id, slug, name, professional, logo, description, country, year_founded, website, categories_json, is_official) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [b.id, b.slug, b.name, b.professional, b.logo, b.description, b.country, b.year_founded, b.website, b.categories_json, b.is_official]
            );
        }

        // --- 3. MIGRAR PRODUCTS ---
        const productos = await sqliteDb.all('SELECT * FROM products');
        console.log(`📦 Insertando ${productos.length} productos...`);
        for (const p of productos) {
            await mysqlDb.execute(
                `INSERT INTO products (id, sku, name, slug, category_id, brand_id, price, tax_rate, stock, safety_level, pro_only, description, specs_json, created_at, image) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [p.id, p.sku, p.name, p.slug, p.category_id, p.brand_id, p.price, p.tax_rate, p.stock, p.safety_level, p.pro_only, p.description, p.specs_json, p.created_at, p.image]
            );
        }

        // --- 4. MIGRAR PRODUCT_VARIANTS ---
        const variantes = await sqliteDb.all('SELECT * FROM product_variants');
        console.log(`📦 Insertando ${variantes.length} variantes...`);
        for (const v of variantes) {
            await mysqlDb.execute(
                `INSERT INTO product_variants (id, product_id, sku, finish, amps, price, stock, is_default) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [v.id, v.product_id, v.sku, v.finish, v.amps, v.price, v.stock, v.is_default]
            );
        }

        // --- 5. MIGRAR TUTORIALS ---
        const tutoriales = await sqliteDb.all('SELECT * FROM tutorials');
        console.log(`📦 Insertando ${tutoriales.length} tutoriales...`);
        for (const t of tutoriales) {
            await mysqlDb.execute(
                `INSERT INTO tutorials (id, slug, title, difficulty, safety_level, minutes, reviewer, related_product_skus, excerpt, category, location, has_video, cover_photo_id, cover_gradient, content_json, published_at, views) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [t.id, t.slug, t.title, t.difficulty, t.safety_level, t.minutes, t.reviewer, t.related_product_skus, t.excerpt, t.category, t.location, t.has_video, t.cover_photo_id, t.cover_gradient, t.content_json, t.published_at, t.views]
            );
        }

        // Reactivamos las claves foráneas
        await mysqlDb.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log("🚀 ¡MIGRACIÓN TOTAL EXITOSA! Se han movido todas las tablas.");

    } catch (error) {
        console.error("❌ Error en la migración:", error);
    } finally {
        if (sqliteDb) await sqliteDb.close();
        if (mysqlDb) await mysqlDb.end();
    }
}

iniciarMigracion();