# Backend GarperLux

## Objetivo

Este backend convierte el prototipo visual en una aplicación web funcional por fases, sin romper la entrega HTML estática existente. La base de datos es SQLite provisional para esta asignatura; la arquitectura separa dominios para poder cambiar después a PostgreSQL, MySQL u otro sistema en la asignatura de base de datos.

## Decisión técnica actual

- **Runtime:** Node.js.
- **Dependencias externas:** ninguna.
- **Servidor:** `http` nativo de Node.
- **Base de datos:** SQLite mediante `node:sqlite`.
- **Frontend:** se mantiene HTML5, CSS3 y JavaScript ES6+.
- **API:** JSON REST bajo `/api`.

SQLite de Node todavía muestra un aviso experimental. Se acepta en esta fase porque reduce instalación, evita dependencias nativas y deja una base local suficiente para razonar entidades, flujos y persistencia.

## Arranque

Desde la raíz del proyecto:

```bash
npm run backend
```

Servidor:

```text
http://localhost:3000
```

Comprobación:

```text
GET /api/health
```

Resetear la base provisional:

```bash
npm run backend:reset
```

## Usuarios de prueba

Ambos usan la contraseña:

```text
garperlux123
```

- Particular: `antonio.garcia@correo.com`
- Profesional: `chispas@instaladoreseljaen.es`

## Dominios backend

### Autenticación

Archivo: `backend/src/domains/auth.js`

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/me`

Usa sesiones bearer en tabla `sessions`. Es suficiente para prototipo, pero en producción habría que endurecer cookies, expiración, CSRF si aplica, recuperación de contraseña y verificación de email.

### Catálogo

Archivo: `backend/src/domains/catalog.js`

- `GET /api/catalog/categories`
- `GET /api/catalog/brands`
- `GET /api/catalog/products`
- `GET /api/catalog/products/:slug`

Permite búsqueda por texto, categoría y marca.

### Carrito

Archivo: `backend/src/domains/cart.js`

- `GET /api/cart`
- `POST /api/cart/items`
- `DELETE /api/cart/items/:sku`

El carrito pertenece a usuario autenticado. Los productos `pro_only` solo pueden añadirse con rol profesional.

### Pedidos

Archivo: `backend/src/domains/orders.js`

- `GET /api/orders`
- `GET /api/orders/:code`
- `POST /api/orders/checkout`

El checkout convierte el carrito activo en pedido confirmado y genera una factura provisional en `documents`.

### Presupuestos

Archivo: `backend/src/domains/quotes.js`

- `GET /api/quotes`
- `GET /api/quotes/:code`
- `POST /api/quotes`

Soporta el flujo profesional de crear presupuesto y convertirlo posteriormente en pedido.

### Solicitudes técnicas

Archivo: `backend/src/domains/services.js`

- `GET /api/service-requests`
- `GET /api/service-requests/:code`
- `POST /api/service-requests`

Modela el flujo "Solicitar técnico" del prototipo.

### Área personal

Archivo: `backend/src/domains/account.js`

- `GET /api/account/addresses`
- `POST /api/account/addresses`
- `GET /api/account/payment-methods`
- `GET /api/account/favorites`
- `POST /api/account/favorites/:sku`
- `DELETE /api/account/favorites/:sku`

### Documentos

Archivo: `backend/src/domains/documents.js`

- `GET /api/documents`
- `GET /api/documentstype=invoice`
- `GET /api/documentstype=delivery_note`

### Contenido

Archivo: `backend/src/domains/content.js`

- `GET /api/content/tutorials`

Mantiene tutoriales y relaciones con productos, útil para conectar "Hazlo tú mismo" con tienda.

## Integración frontend

Se ha creado `web/data/api.js` como cliente ES6+ provisional. Permite migrar cada HTML de forma incremental:

```html
<script src="data/api.js"></script>
```

Ejemplo:

```js
const productos = await GarperLuxApi.products({ q: 'simon' });
await GarperLuxApi.addToCart('SIM-75201-39', 1);
```

No se han reescrito todavía los 63 HTML. La migración debe hacerse pantalla por pantalla para no romper diseño, responsive ni navegación.

También se ha añadido `assets/js/backend-integration.js` a las 63 páginas HTML. Este archivo conecta de forma progresiva:

- Login y registro contra la API.
- Contador de carrito y acciones "Añadir".
- Buscador, tienda y categoría contra catálogo real.
- Carrito, pago y creación de pedido.
- Solicitud técnica y presupuestos.
- Paneles de datos reales en pedidos, solicitudes, presupuestos, facturas, direcciones y métodos de pago.
- Producto individual con datos dinámicos por `sku=`.
- Confirmaciones de pedido y solicitud con códigos reales guardados durante el flujo.

La integración mantiene el HTML original como fallback visual. Si el backend no está arrancado, el prototipo sigue siendo visible, pero las acciones reales mostrarán error de conexión.

## Componentes frontend

Se ha añadido una capa de componentes HTML reutilizables:

- `components/site-header.html`
- `components/site-footer.html`
- `assets/js/component-loader.js`

Las páginas cargan estos fragmentos con `fetch` usando:

```html
<div data-component="site-header"></div>
<div data-component="site-footer"></div>
```

El loader adapta rutas para una futura migración a `/pages` y elimina duplicados antiguos de menú móvil/buscador cuando existen como fallback.

## Próximas fases recomendadas

1. Sustituir datos hardcoded restantes por renderizado completo desde API.
2. Reorganizar HTML secundarios hacia `/pages` con redirecciones o enlaces actualizados.
3. Revisar responsive real en móvil, tablet y escritorio.
4. Añadir tests automatizados de API y flujos críticos.

## Avance 2026-04-29: jerarquía, filtros y variantes

- Se mantiene compatibilidad con las rutas raíz y se añade una jerarquía física bajo `web/pages/` por dominios: tienda, aprender, servicios, cuenta, empresa, legal, auth y sistema.
- `assets/js/catalog-ui.js` añade filtros frontend genéricos para listados estáticos: búsqueda, checkboxes, swatches, chips de amperaje, limpieza de filtros y ordenación por precio.
- `producto.html` soporta selección de acabado y amperaje, actualiza SKU/stock de forma provisional y guarda carrito local cuando se abre por `file://` o sin sesión backend.
- El catálogo backend expone variantes de producto dentro de `GET /api/catalog/products/:slug` y en `GET /api/catalog/products/:slug/variants`.

Pendiente backend por dominios: reseñas, devoluciones completas, tutoriales guardados, pedidos recurrentes, métodos de pago POST, datos fiscales, contacto y candidaturas.

## Avance 2026-04-29: backend funcionalidad extendida

Implementado en esta fase:

- Cuenta: actualización de perfil, datos fiscales y métodos de pago completos (`POST`, `PATCH default`, `DELETE`).
- Contenido: tutoriales guardados con progreso y notas.
- Comercio: reseñas, devoluciones y pedidos recurrentes básicos.
- Soporte: mensajes de contacto, candidaturas y seguimiento público de solicitudes por código/email.
- Frontend: conexión inicial de formularios críticos (`datos-personales`, `datos-fiscales`, `anadir-tarjeta`, `escribir-resena`, `devolucion`, `pedido-recurrente`, `contacto`, `trabaja-con-nosotros`).

Queda pendiente para cierre total:

- Sustituir todos los paneles estáticos por renderizado completo desde API.
- Añadir vistas admin para moderar reseñas, gestionar devoluciones, mensajes y candidaturas.
- Implementar recuperación/cambio real de contraseña.
- Completar tracking detallado de pedidos y solicitudes con historial de eventos.
- Añadir validaciones de negocio más estrictas y tests automatizados por endpoint.

## Avance 2026-04-29: recuperación y tracking

- Autenticación añade `POST /api/auth/password/forgot`, `POST /api/auth/password/reset` y `POST /api/auth/password/change`.
- Pedidos añade `events` en `GET /api/orders/:code` y `PATCH /api/orders/:code/status` para registrar cambios de estado.
- Solicitudes técnicas añade `events` en detalle privado/público, `PATCH /api/service-requests/:code/status` y `POST /api/service-requests/:code/cancel`.
- Frontend conecta recuperación de contraseña, seguimiento público y timeline real de pedido sin romper el fallback visual estático.

## Avance 2026-04-29: checkout avanzado

- `GET /api/checkout/options` devuelve carrito, totales iniciales, direcciones, métodos de pago, envíos y cupones aplicables al usuario.
- `POST /api/orders/checkout` calcula el total definitivo con envío y descuento, guarda el snapshot completo en `payload_json` y genera factura provisional con el total final.
- El frontend guarda un borrador local del checkout para transportar cupón y entrega entre `carrito.html`, `checkout.html` y `pago.html`.

## Avance 2026-04-30: administración interna

Archivo: `backend/src/domains/admin.js`

- `GET /api/admin/summary`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders/:code/status`
- `GET /api/admin/service-requests`
- `PATCH /api/admin/service-requests/:code/status`
- `GET /api/admin/reviews`
- `PATCH /api/admin/reviews/:id/status`
- `GET /api/admin/returns`
- `PATCH /api/admin/returns/:code/status`
- `GET /api/admin/contact-messages`
- `PATCH /api/admin/contact-messages/:code/status`
- `GET /api/admin/job-applications`
- `PATCH /api/admin/job-applications/:code/status`

Todos los endpoints requieren rol `admin`. El usuario demo es `admin@garperlux.local` con contraseña `garperlux123`.

## Avance 2026-04-30: administración de catálogo

Se amplía `backend/src/domains/admin.js` con gestión básica de catálogo:

- `GET /api/admin/products`
- `POST /api/admin/products`
- `PATCH /api/admin/products/:sku`
- `PATCH /api/admin/products/:sku/stock`
- `GET /api/admin/audit`

Cada creación, edición o ajuste de stock registra una entrada en `admin_audit`. El panel `admin.html` consume estos endpoints para alta rápida de productos y control operativo de stock.
