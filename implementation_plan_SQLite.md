# Revertir migración MySQL → SQLite (preservando arreglos no-DB)

## Contexto

Entre los commits `099fe58` y `b53de3e` se hicieron 5 commits. Dos son específicamente de MySQL (`1ca3abc` y `b53de3e`), y los otros tres son arreglos independientes que **deben conservarse**:

| Commit | Descripción | ¿DB-related? |
|--------|-------------|:---:|
| `0433c65` | Arreglos visuales, footer, enlace contacto, indicador menú | ❌ |
| `958fe7f` | Opción menú de contacto en header | ❌ |
| `1ca3abc` | MySQL + variantes productos | ✅ Mixto |
| `279b1ee` | Arreglos hardcodeos checkout | ❌ |
| `b53de3e` | GarperLux con base de datos MySQL (final) | ✅ |

## Arreglos NO-DB que deben conservarse

Estos cambios están **ya aplicados** en el estado actual y NO los tocaremos:

1. **Arreglos visuales y de menú** (commits `0433c65`, `958fe7f`) — solo tocan HTML/CSS del frontend
2. **Arreglos hardcodeos checkout** (`279b1ee`) — solo toca `backend-integration.js` (no es DB)
3. **Mejoras en `server.js`**: página 404 con HTML + arranque async con try/catch (ambos introducidos en los commits de MySQL pero son buenas prácticas independientes)
4. **Nuevas rutas API** en `api.js`: `addFavorite`, `deleteFavorite`, `tutorials`, `helpCenter`, etc.
5. **Mejoras en `backend-integration.js`**: lógica de direcciones en checkout/pedidos, imágenes enriquecidas, FAQs
6. **Página nueva** `faqs-busqueda.html`
7. **Páginas mejoradas**: `faqs.html`, `checkout.html`, `pago.html`, `pedido-confirmado.html`, etc.
8. **Eliminación de archivos `.bak`** — limpieza legítima
9. **Nuevas funcionalidades en db.js** que son de contenido/datos (no de motor MySQL):
   - `seedTipsCatalog()` — catálogo de consejos
   - `seedHelpCenter()` — centro de ayuda (FAQs)
   - Tablas `tips`, `help_categories`, `help_articles`
   - Columnas nuevas en `tutorials` (`excerpt`, `category`, `location`, `has_video`, `cover_photo_id`, etc.)
   - Tutoriales refactorizados desde JSON (`seeds/tutorials-catalog.json`)

## Cambios propuestos

### Backend — Motor de base de datos

---

#### [MODIFY] [db.js](file:///c:/GarperLux3/backend/src/db.js)

Este es el cambio principal y más grande. Hay que:

1. **Reemplazar `mysql2/promise`** por `node:sqlite` (`DatabaseSync`):
   - Eliminar: `const mysql = require('mysql2/promise');`
   - Añadir: `const { DatabaseSync } = require('node:sqlite');`
   - Eliminar: `class DatabaseWrapper` y el pool MySQL
   - Restaurar: `connect()` síncrono con `new DatabaseSync(databaseFile)`

2. **Convertir todas las funciones async → sync**:
   - `connect()`, `migrate()`, `seed()`, `ensureColumn()` → funciones normales (sin async/await)
   - `seedBrands()`, `seedTutorialsCatalog()`, `seedTipsCatalog()`, `seedHelpCenter()` → sync
   - `seedDemoAccountData()`, `seedProOrders()`, `seedProQuotes()`, `seedProRecurringOrders()` → sync
   - `ensureAdminUser()`, `seedProductVariants()` → sync

3. **Restaurar esquema SQLite** en `migrate()`:
   - `INTEGER PRIMARY KEY AUTOINCREMENT` en vez de `INT AUTO_INCREMENT PRIMARY KEY`
   - `TEXT` en vez de `VARCHAR(255)` 
   - `TEXT NOT NULL DEFAULT '{}'` en vez de `JSON DEFAULT (JSON_OBJECT())`
   - Inline `REFERENCES` + `ON DELETE CASCADE/SET NULL` + `CHECK` en el CREATE TABLE
   - Eliminar las funciones `ensureFK()` y `ensureCheck()` (MySQL-only)
   - `PRAGMA table_info()` en vez de `SHOW COLUMNS FROM`

4. **Restaurar sintaxis SQLite en seeds**:
   - `INSERT OR IGNORE` en vez de `INSERT IGNORE`
   - `ON CONFLICT(slug) DO UPDATE SET` en vez de `ON DUPLICATE KEY UPDATE`
   - Eliminar `await` de todas las llamadas `.run()`, `.get()`, `.all()`
   - `.forEach()` en vez de `for...of` + `await` donde aplique

5. **CONSERVAR** las funcionalidades nuevas (no-DB) pero adaptarlas a sync/SQLite:
   - `seedTipsCatalog()` — mantener, convertir a síncrono
   - `seedHelpCenter()` — mantener, convertir a síncrono, cambiar `ON DUPLICATE KEY UPDATE` → `ON CONFLICT DO UPDATE`
   - Tablas `tips`, `help_categories`, `help_articles` — mantener con sintaxis SQLite
   - Columnas nuevas de `tutorials` — mantener
   - Tutorial catalog desde JSON — mantener

---

#### [MODIFY] [server.js](file:///c:/GarperLux3/backend/src/server.js)

- **Mantener** la mejora de 404.html (no es MySQL-related)
- **Revertir** el arranque async a sync: `connect()` ya no devuelve Promise, así que el `(async () => {...})()` vuelve a ser llamada directa

---

#### [MODIFY] Archivos de dominio en [backend/src/domains/](file:///c:/GarperLux3/backend/src/domains/)

Todos los archivos en `domains/` fueron modificados para añadir `async/await` a las consultas. Hay que revertirlos a **síncronos**:

- `account.js`, `auth.js`, `catalog.js`, `checkout.js`, `content.js`, `services.js`, `support.js`
- Esto es: `await getDb().prepare(...)` → `getDb().prepare(...)`
- Y `async (req, res) =>` → `(req, res) =>` cuando la función solo era async por las queries

> [!IMPORTANT]
> Algunas funciones de dominio usan `await readJson(req)` que **sí necesita** ser async. Esas funciones mantendrán `async` pero sin `await` en las queries DB.

---

### Package & dependencias

#### [MODIFY] [package.json](file:///c:/GarperLux3/package.json)

- Eliminar dependencias `mysql2`, `sqlite`, `sqlite3` del bloque `dependencies`
- `node:sqlite` es nativo de Node.js 22+, no requiere dependencia externa
- Actualizar la descripción a "SQLite" si dice "MySQL"

---

#### [DELETE] [migrar.js](file:///c:/GarperLux3/backend/migrar.js)

Este script era exclusivamente para migrar datos de SQLite → MySQL. Ya no es necesario.

---

### Frontend (sin cambios)

No se toca ningún archivo del frontend. Todos los arreglos de HTML, CSS, JavaScript del lado cliente y eliminación de `.bak` ya están aplicados y se conservan tal cual.

---

## Verificación

### Automated Tests
1. `node --check backend/src/server.js && node --check backend/src/db.js && node --check backend/src/router.js` — verificar que no hay errores de sintaxis
2. Eliminar la base de datos SQLite existente y arrancar con `npm run backend:reset` — verificar que crea todas las tablas y seedea datos
3. Verificar que el servidor arranca correctamente en `http://localhost:3000`
4. Comprobar endpoints: `/api/health`, `/api/catalog/products`, `/api/catalog/categories`

### Manual Verification
- Navegar la web y verificar que las páginas cargan datos dinámicos
- Verificar login con `antonio.garcia@correo.com` / `garperlux123`
