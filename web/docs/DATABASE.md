# Base de datos provisional

## Enfoque

La base actual es SQLite y está pensada como modelo provisional. Sirve para:

- Probar lógica real de backend.
- Documentar entidades y relaciones.
- Validar flujos de usuario.
- Preparar una migración futura a la base de datos definitiva de otra asignatura.

Archivo generado al arrancar:

```text
backend/database/garperlux.sqlite
```

La definición vive en:

```text
backend/src/db.js
```

## Entidades

### `users`

Usuarios particulares, profesionales y administradores.

Campos clave:

- `role`: `particular`, `pro` o `admin`.
- `email`: único.
- `password_hash`: hash `scrypt` con sal.
- `fiscal_id`: CIF/NIF cuando aplique.
- `pro_discount`: descuento profesional provisional.

### `sessions`

Sesiones bearer temporales.

Relación:

- Muchas sesiones pertenecen a un usuario.

### `categories`

Familias de catálogo.

Permite jerarquía mediante `parent_id`.

### `brands`

Marcas de catálogo.

Campo `professional` indica orientación profesional.

### `products`

Productos vendibles.

Campos clave:

- `sku`: referencia profesional.
- `slug`: URL lógica.
- `category_id`, `brand_id`: relaciones.
- `price`, `stock`, `tax_rate`.
- `safety_level`: ayuda a conectar producto con seguridad DIY.
- `pro_only`: restringe compra a profesionales.
- `specs_json`: ficha técnica flexible.

### `carts` y `cart_items`

Carrito activo por usuario.

Relaciones:

- Un carrito tiene muchos productos.
- Un producto puede aparecer en muchos carritos.

### `addresses`

Direcciones de envío, facturación u obra.

### `payment_methods`

Métodos de pago simulados. No almacena datos sensibles completos, solo tipo, etiqueta y `last4`.

### `orders`

Pedidos confirmados.

Campos clave:

- `code`: referencia legible.
- `status`: estado de pedido.
- `payload_json`: snapshot del checkout y carrito para preservar histórico.

### `quotes`

Presupuestos, especialmente importantes para perfil profesional.

### `service_requests`

Solicitudes técnicas.

Campos clave:

- `service_type`.
- `urgency`.
- `address`.
- `description`.
- `status`.

### `favorites`

Relación usuario-producto para favoritos.

### `documents`

Facturas y albaranes.

Tipos:

- `invoice`
- `delivery_note`

### `tutorials`

Contenido DIY conectado a productos mediante referencias SKU.

## Datos semilla

Al crear la base se insertan:

- 2 usuarios: Antonio y Jose Luis.
- 4 categorías.
- 4 marcas.
- 3 productos.
- Direcciones y métodos de pago iniciales.
- 1 tutorial relacionado con producto.

## Criterios para migración futura

Cuando se diseñe la base definitiva:

- Mantener los dominios API si los flujos siguen siendo válidos.
- Sustituir SQLite por el motor elegido en la capa de persistencia.
- Normalizar campos JSON si la asignatura exige modelo relacional estricto.
- Añadir tablas de auditoría si se requiere trazabilidad.
- Reforzar seguridad de sesiones y pagos para un escenario real.

## Avance 2026-04-29: variantes de producto

### `product_variants`

Variantes vendibles dependientes de un producto base.

Campos clave:

- `product_id`: relación con `products`.
- `sku`: referencia concreta de la variante.
- `finish`: acabado visible en la ficha, por ejemplo Blanco, Marfil o Aluminio.
- `amps`: amperaje seleccionado, por ejemplo 10 A, 16 A o 20 A.
- `price`, `stock`: precio y disponibilidad propios de la variante.
- `is_default`: variante cargada inicialmente.

Se usa para que la ficha de producto no sea solo visual: las opciones seleccionadas pueden resolverse contra datos persistidos en SQLite provisional.

## Avance 2026-04-29: nuevas tablas funcionales

- `fiscal_profiles`: datos fiscales profesionales separados del usuario.
- `saved_tutorials`: tutoriales guardados por usuario con progreso.
- `reviews`: reseñas de producto con moderación básica.
- `returns`: devoluciones vinculadas a pedido y payload de líneas.
- `recurring_orders`: pedidos recurrentes básicos para perfiles pro/particular.
- `contact_messages`: mensajes del formulario de contacto.
- `job_applications`: candidaturas de trabaja con nosotros.

Estas tablas siguen siendo provisionales para SQLite, pero ya separan dominios y facilitan migrar a una base definitiva más adelante.

## Avance 2026-04-29: seguridad y tracking

- `password_resets`: tokens temporales de recuperación, usuario asociado, caducidad y marca de uso.
- `order_events`: historial de estados de pedido con título, descripción y fecha.
- `service_request_events`: historial de estados de solicitud técnica con título, descripción y fecha.

Estas tablas separan la trazabilidad de la entidad principal para que pedidos y solicitudes puedan crecer sin sobrescribir histórico.

## Avance 2026-04-30: auditoría administrativa

### `admin_audit`

Registra acciones internas realizadas por usuarios con rol `admin`.

Campos clave:

- `admin_user_id`: administrador que ejecuta la acción.
- `action`: tipo de operación (`create`, `update`, `stock`, `status`).
- `entity_type` y `entity_id`: entidad afectada.
- `payload_json`: contexto de la acción para trazabilidad provisional.
