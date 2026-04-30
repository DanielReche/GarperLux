# Roadmap backend GarperLux

Este documento es el inventario vivo de funcionalidad pendiente y realizada. La web tiene muchas pantallas HTML, por lo que el backend se construye por dominios y se conecta de forma incremental.

## Estado por dominio

| Dominio | Estado | Falta / criterio de cierre |
|---|---:|---|
| Autenticación y sesión | Parcial | Recuperación real de contraseña, cambio de contraseña, verificación email/teléfono. |
| Catálogo y variantes | Avanzado | Imágenes, atributos técnicos normalizados, filtros SQL completos, reseñas agregadas. |
| Carrito y checkout | Parcial | Invitado, cupones reales, envío real, selección de método de pago guardado. |
| Pedidos | Avanzado | Queda repetir compra completo, administración de estados y comunicación real al cliente. |
| Devoluciones | Pendiente | Solicitud, líneas devueltas, motivo, recogida, reembolso, estados. |
| Reseñas | Pendiente | Crear, listar por producto, moderación básica, compra verificada. |
| Cuenta | Parcial | Actualizar perfil, datos fiscales, métodos de pago POST/DELETE/default. |
| Favoritos | Parcial | Conexión visual completa en todas las pantallas. |
| Tutoriales guardados | Pendiente | Guardar tutorial, progreso, listar en área personal. |
| Presupuestos | Parcial | Líneas editables, estados, aceptación, conversión desde carrito. |
| Servicios técnicos | Parcial | Seguimiento público por código/email, cancelación, estados detallados. |
| Contacto y soporte | Pendiente | Mensajes de contacto, adjuntos simulados, motivos, estado. |
| Candidaturas | Pendiente | Formulario trabaja con nosotros, estado y metadatos. |
| Documentos | Parcial | Detalle de factura/albarán, descarga simulada registrada. |
| Buscador global | Parcial | Resultados desde productos, tutoriales, servicios, FAQs y documentos públicos. |
| Admin | Pendiente | Gestión interna de pedidos, productos, reseñas, solicitudes y mensajes. |

## Avance 2026-04-29

Realizado previamente:

- Backend Node + SQLite provisional.
- Catálogo, variantes, carrito, checkout, solicitudes, presupuestos, documentos básicos.
- Jerarquía `web/pages/` con compatibilidad en raíz.
- Filtros frontend genéricos y selector de variantes de producto.

Siguiente bloque en ejecución:

- Métodos de pago completos.
- Perfil personal y datos fiscales editables.
- Reseñas, devoluciones y tutoriales guardados.
- Contacto/candidaturas y seguimiento público.
- Pedidos recurrentes básicos.

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

Implementado en esta fase:

- Autenticación: recuperación de contraseña con token temporal, reset de contraseña y cambio de contraseña autenticado.
- Pedidos: historial de eventos por pedido y endpoint para actualizar estado dejando trazabilidad.
- Servicios técnicos: historial de eventos por solicitud, seguimiento público por código/email y cancelación desde API.
- Frontend: conexión de `recuperar-password.html`, `seguir-solicitud.html` y timeline real en `mis-pedido.html?order=...`.
- Validación: API y navegador probados con recuperación, pedido con eventos y solicitud pública con eventos.

Queda pendiente para cierre total:

- Sustituir todos los paneles estáticos por renderizado completo desde API.
- Añadir vistas admin para moderar reseñas, gestionar devoluciones, mensajes, candidaturas, pedidos y solicitudes.
- Completar cupones, envío real, invitado y pago con métodos guardados.
- Añadir validaciones de negocio más estrictas y tests automatizados por endpoint.

## Avance 2026-04-29: checkout avanzado

Implementado en esta fase:

- Checkout: opciones de entrega, direcciones, métodos de pago guardados y cupones disponibles desde `GET /api/checkout/options`.
- Pedidos: `POST /api/orders/checkout` valida cupón, método de pago guardado y calcula subtotal, IVA, envío, descuento y total final.
- Frontend: el flujo `carrito.html` -> `checkout.html` -> `pago.html` conserva cupón, velocidad de envío y pago seleccionado antes de confirmar.
- Validación: compra completa probada con cupón `GLX5`, envío urgente y método guardado.

## Avance 2026-04-30: administración interna

Implementado en esta fase:

- Admin: usuario semilla `admin@garperlux.local` con rol `admin` para operar el panel interno.
- Backend: endpoints `/api/admin/*` para resumen, pedidos, solicitudes técnicas, reseñas, devoluciones, mensajes y candidaturas.
- Estados: acciones administrativas para cambiar estado de pedidos, solicitudes, reseñas, devoluciones, mensajes y candidaturas.
- Frontend: nueva pantalla `admin.html` y ruta jerarquizada `pages/sistema/admin.html` con panel de KPIs y listas accionables.

Queda pendiente para cierre total:

- Añadir gestión de productos/catálogo desde admin.
- Añadir filtros, paginación y búsqueda en cada listado admin.
- Añadir auditoría detallada por usuario administrador.

## Avance 2026-04-30: administración de catálogo

Implementado en esta fase:

- Admin catálogo: listado paginado básico de productos desde `/api/admin/products`.
- Productos: alta, edición base y ajuste de stock desde endpoints administrativos.
- Auditoría: tabla `admin_audit` y endpoint `/api/admin/audit` para registrar acciones internas.
- Frontend: el panel `admin.html` permite crear productos rápidos, ver stock y aplicar ajustes de inventario.

Queda pendiente para cierre total:

- Gestión completa de categorías, marcas, imágenes y variantes desde admin.
- Formularios de edición avanzada por producto.
- Filtros visuales y paginación real en el panel admin.
