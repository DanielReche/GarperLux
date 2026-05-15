# Migración de SQLite a MySQL InnoDB (Clúster a través de Router)

El objetivo es migrar la base de datos actual (basada en el módulo síncrono `node:sqlite`) a un entorno de producción utilizando MySQL (`mysql2`) conectado al router del clúster (localhost:6446). Como se requiere que la aplicación siga funcionando "como si no hubiera habido cambio", propongo una estrategia de adaptación que minimice las modificaciones estructurales en la lógica de negocio.

## User Review Required

> [!WARNING]
> Dado que `node:sqlite` es completamente **síncrono** y `mysql2` es **asíncrono** por naturaleza (requiere operaciones de red), no es posible mantener las operaciones de base de datos de forma síncrona en Node.js. 
> 
> Tendremos que refactorizar todo el código que interactúa con la base de datos (y las funciones que dependen de estas llamadas, como el middleware de autenticación) para usar Promesas y la palabra clave `await`. Esto afectará a gran parte de los archivos en el directorio `src/domains`.
>
> ¿Estás de acuerdo con este enfoque de refactorizar usando `async/await` manteniendo la estructura de `prepare(sql).get()`?

## Proposed Changes

### Database Config and Wrapper

Crearemos un wrapper alrededor de `mysql2` que imite la interfaz actual de `node:sqlite` (`prepare().get()`, `prepare().all()`, `prepare().run()`) pero retornando Promesas. Esto nos permite mantener las consultas intactas en su mayoría.

#### [MODIFY] [backend/src/db.js](file:///c:/GarperLux/backend/src/db.js)
- Sustituir la importación de `node:sqlite` por `mysql2/promise`.
- Crear un pool de conexiones apuntando a `127.0.0.1:6446` con el usuario/contraseña `garperlux`.
- Crear el wrapper `DatabaseWrapper` que retorne objetos con métodos `.get()`, `.all()`, y `.run()`.
- Modificar la función `connect()` para que sea asíncrona (`async`).
- Refactorizar las sentencias SQL de `migrate(db)` y `seed(db)` para adaptarlas a la sintaxis de MySQL:
  - Cambiar `AUTOINCREMENT` por `AUTO_INCREMENT`.
  - Cambiar constraints como `CHECK(role IN (...))` a `ENUM(...)` o `VARCHAR`.
  - Modificar las funciones de fecha de SQLite (ej. `datetime('now', '+30 minutes')`) a sintaxis de MySQL (`DATE_ADD(NOW(), INTERVAL 30 MINUTE)`).
  - Cambiar los insert `ON CONFLICT` a `ON DUPLICATE KEY UPDATE` o `INSERT IGNORE`.

#### [MODIFY] [backend/src/server.js](file:///c:/GarperLux/backend/src/server.js)
- Modificar el arranque del servidor para que espere de forma asíncrona (`await connect()`) a que la base de datos esté lista y sincronizada antes de escuchar en el puerto.

### Auth Middleware

#### [MODIFY] [backend/src/middleware/auth.js](file:///c:/GarperLux/backend/src/middleware/auth.js)
- Convertir `currentUser`, `requireAuth` y `requireRole` a funciones asíncronas ya que internamente necesitan consultar a la base de datos usando `await`.

### Domain Routers

#### [MODIFY] Archivos en `backend/src/domains/*.js`
- Modificar **todas** las funciones manejadoras de rutas que actualmente usan métodos síncronos de `db` o el middleware `requireAuth`/`requireRole`.
- Añadir la palabra clave `await` antes de cada llamada a `db.prepare(...).get(...)`, `.all(...)` y `.run(...)`.
- Añadir `await` antes de las comprobaciones de autenticación, por ejemplo: `const user = await requireAuth(req, res);`.

## Verification Plan

### Automated Tests
- Arrancar el servidor backend con `npm run backend:reset` para comprobar si la conexión a través de MySQL router es exitosa y se pueden ejecutar las migraciones y los seeders correctamente.

### Manual Verification
- Utilizar las llamadas a la API a través de peticiones HTTP para asegurar que:
  - El registro y login devuelven los tokens correctos de MySQL.
  - La navegación por el catálogo de productos devuelve los productos de la BBDD.
  - Las transacciones, como añadir al carrito y realizar pedidos, se persisten correctamente.
