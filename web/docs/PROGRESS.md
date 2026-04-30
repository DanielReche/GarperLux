# GarperLux Web - Bitácora de Progreso

> Este documento es la guía maestra para retomar el trabajo entre sesiones.
> Al empezar cada sesión: **leer este archivo primero + DECISIONS.md**.

---

## Estado global

- **Inicio del proyecto:** 2026-04-25
- **Fase actual:** **Fase 7 iniciada · Backend provisional + lógica real por dominios**. La parte visual sigue completa; ahora se está conectando lógica real de forma incremental.
- **Stack confirmado:** HTML estático + Tailwind CSS (Play CDN) + JS vanilla
- **Ruta:** `C:\Users\Pc\Desktop\garperlux\web\`
- **Paleta confirmada:** grafito + crema + ámbar filamento (ver DESIGN_SYSTEM.md)

### Fase 7 — Backend y persistencia provisional
- [x] Crear backend separado en `backend/`.
- [x] Elegir SQLite provisional para no bloquear la asignatura de base de datos.
- [x] Separar dominios API: auth, catálogo, carrito, pedidos, presupuestos, solicitudes técnicas, cuenta, documentos y contenido.
- [x] Crear cliente frontend provisional `web/data/api.js`.
- [x] Documentar backend en `docs/BACKEND.md`.
- [x] Documentar modelo de datos en `docs/DATABASE.md`.
- [x] Conectar `login.html` a `/api/auth/login`.
- [x] Conectar carrito y pago a `/api/cart` y `/api/orders/checkout`.
- [x] Conectar buscador/catálogo a `/api/catalog/products`.
- [x] Conectar solicitudes técnicas a `/api/service-requests`.
- [x] Conectar presupuestos a `/api/quotes`.
- [x] Mostrar paneles de datos backend en área personal.
- [x] Extraer header/footer a `/components` y cargarlos con `fetch`.
- [x] Conectar producto individual por `sku=`.
- [x] Conectar códigos reales en confirmaciones de pedido y solicitud.
- [ ] Reorganizar páginas secundarias hacia `/pages` sin romper enlaces.
- [ ] Sustituir todos los datos hardcoded restantes por renderizado desde API.

---

## Fases

### ✅ Fase 0 — Cimientos
- [x] Estructura de carpetas
- [x] Documentación base (PROGRESS, DESIGN_SYSTEM, DECISIONS, SCREENS, COPY)
- [x] Logo SVG
- [x] CSS de sistema (tokens, utilities)
- [x] Home (index.html) — primera versión editorial
- [x] Revisión del usuario de la Home (✓ paleta OK, eliminado cuadro datos en vivo)

### ✅ Fase 1 — Layout global + Home final
- [x] Header sticky con logo, nav, search, cuenta, carrito
- [x] Footer amplio (5 columnas: tienda/aprender/servicios/empresa + legal + social)
- [x] Buscador global overlay full-screen con sugerencias
- [x] Tres puertas asimétricas (Aprender domina, Comprar y Pedir ayuda iguales)
- [x] Mes de la Domótica con KPIs editoriales
- [x] CTA registro particular/profesional
- [x] Mobile nav drawer
- [x] Hero aside reemplazado: cuadro de datos → mini-poster editorial del tutorial #042
- [ ] Mega-nav desplegable en hover (pendiente, mejora opcional pase de pulido)
- [ ] Responsive fino tablet (revisar en pase final)

### ✅ Fase 2 — Hazlo tú mismo
- [x] Biblioteca `hazlo-tu-mismo.html` — patrón **revista editorial**
  - Hero asimétrico con título display y buscador hero
  - 4 cajas de entrada rápida (Empieza por aquí · Seguridad · Frecuentes · Cuándo NO hacerlo)
  - Filtros sticky (Tema/Dificultad/Nivel seguridad/Interior/Exterior/Vídeo/Tiempo/Kit)
  - Grid magazine asimétrico (cards XL/M/S/wide-dark) con resumen breve, badges de dificultad y nivel de seguridad
  - **Proyectos paso a paso** (D-013) — 3 cards horizontales multi-tutorial con sesiones, presupuesto y calendario
  - Sección "Empieza por aquí" en 5 fundamentos numerados con romanos
  - **Consejos y Trucos** (D-014) — 6 postales editoriales con citas grandes firmadas por Alfonso Torres
  - Sección "Cuándo NO hacerlo" en dark con 4 alertas visuales
  - Videotutoriales con play overlay
  - **Manuales y Descargas** (D-015) — sección dark con 9 PDFs (manual destacado XL + 8 fichas/glosarios/plantillas/checklist), integra "Herramientas" y "Materiales" como descargables
  - FAQs accordion
  - CTA banda final hacia Solicitar técnico
- [x] Ficha tutorial `tutorial.html` — patrón **long-read con sidebar sticky**
  - Reading progress bar de filamento
  - Hero con metadata pills + autor revisor (Alfonso Torres, instalador real entrevistado en el proyecto)
  - Índice del tutorial
  - Sección "Por qué se desgasta" didáctica
  - Checklist de seguridad sobre fondo ink (5 pasos en orden)
  - Bloque alerta "Cuándo NO hacerlo tú" con 4 casos
  - 6 pasos numerados con números display tipográficos enormes
  - Verificación final ✓ verde
  - Problemas frecuentes (accordion)
  - CTA inline al técnico
  - Sidebar sticky: Kit recomendado (3 productos + total) + Ficha técnica del tutorial + acciones (Guardar/Compartir/PDF)
  - Tutoriales relacionados

### ✅ Fase 3 — Tienda / Catálogo
- [x] `tienda.html` — landing con patrón **grid asimétrico de familias**
  - Hero utilitario con buscador profesional (3 modos: nombre/SKU/EAN)
  - Barra de cifras (referencias, marcas, envío, devolución)
  - 9 familias en grid asimétrico: Iluminación XL, Domótica con glow, resto en 3 tamaños distintos
  - Tira de 14 marcas profesionales en cuadrícula
  - 8 productos destacados en grid
  - Banda profesional con CTAs duales
- [x] `categoria.html` — patrón **sidebar facetado + grid denso**
  - Header de categoría con subcategorías como pills
  - Sidebar sticky 280px con 9 grupos de filtros: buscador SKU, marca, gama, acabado (swatches), amperaje, uso, compatibilidad, precio (con range visual), disponibilidad
  - Filtros activos como chips removibles
  - Toolbar con ordenación y vista grid/lista
  - 12 productos en cards uniformes con imagen/SVG, marca, título, SKU mono, precio, stock, favorito, +cart
  - Paginación
  - Bloque SEO al final
- [x] `producto.html` — ficha **DUAL con toggle particular/profesional** (D-003)
  - Toggle prominente arriba con label dinámico de vista activa
  - Galería con 5 thumbs + imagen principal
  - Strip de 3 PDFs (solo vista pro): ficha técnica, declaración CE, manual instalación
  - **Vista particular:** descripción narrativa, precio sereno, selector variantes (color/amperaje), stock simple, +cart, "¿Tienes dudas", compatibilidad explicada con iconos, info envío
  - **Vista profesional:** SKU + EAN destacado mono, precio dual con descuento pro 22%, escalado por volumen (10/25/100+), stock POR ALMACÉN (Jaén/Coslada + reposición prevista), botones rápidos (favoritos, presupuesto, repetir)
  - Banda "tutorial vinculado" (D-006 · puente aprender→comprar) — solo en vista particular
  - 4 tabs: Descripción / Especificaciones / Reseñas / Preguntas
  - Aside sticky con especificaciones técnicas
  - 2 reseñas de Antonio y El Chispas (los personas del proyecto)
  - 4 productos relacionados

### ✅ Fase 4 — Servicios + Solicitar técnico
- [x] `servicios.html` — landing con patrón **matriz 3×4 + timeline + casos editoriales**
  - Hero institucional con cifras (4h respuesta · 100% carnet BT · 3 años garantía · 8 provincias)
  - Matriz interactiva 3×4 (Averías/Nuevas instalaciones/Mantenimiento × Electricidad/Teleco/Domótica/Automatismos) con precios desde — celdas hover (D-020)
  - Cómo trabajamos: timeline vertical de 5 pasos
  - Zona de cobertura con SVG estilizado del mapa de Andalucía con Jaén destacado y animación de pulso
  - Casos reales editoriales (5 trabajos con fotos, equipos, plazos)
  - FAQs servicios (5 preguntas)
  - CTA final hacia stepper
- [x] `servicio.html` — ficha de servicio (Avería eléctrica como ejemplo)
  - Hero del servicio con pills de tipo y área
  - Layout long-read con sidebar sticky
  - 6 ítems "qué incluye" + 6 casos típicos en cards + box "qué necesitamos de ti" + 4 FAQs específicas
  - Sidebar sticky: card precio en ink + "antes de llamarnos" puente a Hazlo Tú Mismo (D-006) + trust signals
  - 3 servicios relacionados al final
- [x] `solicitar-tecnico.html` — **stepper full-screen con sidebar live** (D-004 + D-021)
  - Header minimal con progress segmentada de 6 pasos
  - 6 pasos: Tipo · Área · Descripción+adjuntos · Dónde y cuándo · Datos · Resumen
  - Cards de selección con estado seleccionado en ink + filament
  - Sidebar derecha mostrando el resumen acumulado en tiempo real
  - JS de validación, navegación atrás/adelante, edición desde resumen
  - Submit redirige a confirmación
- [x] `solicitud-confirmacion.html` — confirmación con código + tracking
  - Hero ink con animación de filamentos cayendo (D-022)
  - Tick verde + "Gracias, Antonio. Estamos en ello"
  - Código de seguimiento mono `GLX-2026-04-2748` con botón copiar
  - Timeline vertical de 5 estados (Recibido ✓ · En revisión · Programado · Visita técnica · Resuelto)
  - Sidebar con detalles, acciones (descargar PDF, cancelar), contacto rápido
  - Sección "Mientras esperas" con tutoriales relacionados (puente aprender)
  - CTA volver al inicio

### ✅ Fase 5 — Área personal + Auth
- [x] `login.html` — patrón **split panel branding + form** (D-023)
  - Panel izquierdo dark con logo, manifiesto, 4 mini-features y testimonio firmado por El Chispas
  - Panel derecho con 2 tabs (Iniciar sesión / Crear cuenta) + Google sign-in
  - Registro DUAL en un solo formulario: 2 role-cards (Particular / Instalador) + sección extra `pro-section` que se expande al elegir Pro (D-024)
  - Sección pro: DNI, nº carnet BT, caducidad, comunidad emisión, drag-drop carnet, datos fiscales completos, IBAN, aviso de validación 24-48 h
  - JS toggle de tabs + role + soporte hash (`#registro` y `#registro-pro`)
- [x] `area-personal.html` — patrón **dashboard con sidebar + toggle DUAL demo** (D-025)
  - Toggle prominente "Particular (Antonio) / Profesional (El Chispas)" para demostrar ambos modos en un solo prototipo
  - Sidebar diferenciado por rol con identidad visual distinta:
    - Particular: card claro con avatar simple
    - Profesional: card ink con badge "BT vigente", −22% PVP visible, fecha caducidad carnet, CIF
  - **Vista particular** main: greeting "Buenas tardes, Antonio" · 4 stat cards (pedidos/solicitudes/favoritos/tutoriales) · pedido en curso con tracking horizontal de 4 estados · solicitud técnica activa GLX-2026-04-2748 · recomendaciones según historial
  - **Vista profesional** main: greeting "Buenas, instalador" · 4 KPI cards con sparkline (gastado mes, ahorrado vs PVP, pedidos, albaranes) · lista densa de últimos 4 albaranes con descarga PDF · **Reposición sugerida** basada en patrón histórico (D-026) · 2 presupuestos abiertos pendientes

### ✅ Fase 6 — Transversal final
- [x] `quienes-somos.html` — patrón **storytelling vertical**
  - Hero asimétrico con frase identitaria + 3 cifras destacadas
  - Origen del nombre (García + Pérez + Lux) y filosofía
  - Los 2 socios (Rubén y Daniel, los autores reales del proyecto, D-027) con foto y rol
  - Banda de "+ red de 8 instaladores autorizados"
  - 3 tipos de clientes (hogar, comercios, comunidades) en sección dark
  - Zona de cobertura ampliada con 8 provincias en grid de cuadrícula
  - 8 certificaciones (REBT, Carnet BT, ISO 9241-210, WCAG 2.2, RGPD, Andalucía Emprende, Cámara, Garantía)
  - 5 trabajos realizados con fotos editoriales (showcase)
  - CTA contacto + ser instalador colaborador
- [x] `carrito.html` — patrón **items + resumen sticky derecho**
  - Stepper 4 pasos (Carrito → Entrega → Pago → Confirmación)
  - Banner de kit recomendado del tutorial #042 (puente aprender→comprar D-006)
  - 3 items con cantidad/eliminar/mover-a-favoritos, precio y stock por item
  - Box "convertir en solicitud de presupuesto" para empresas/comunidades
  - Productos relacionados (4 cards)
  - Sidebar sticky: resumen con cupón colapsable, total grande, beneficios, banner pro, métodos de pago
- [x] `faqs.html` — patrón **centro de ayuda con buscador + 8 categorías**
  - Hero con buscador prominente y atajo `⌘K`
  - 8 categorías de ayuda en grid (Pedidos · Envíos · Devoluciones · Pagos · Cuenta · Material · Servicios · Área pro)
  - 6 secciones de FAQs (4 por categoría) con accordion · scroll-mt anchors
  - Sección final "Habla con una persona" con 4 canales de contacto
- [x] `contacto.html` — patrón **multicanal con formulario y mapa**
  - Hero
  - 4 canales rápidos en grid (WhatsApp destacado en verde, teléfono, email, sede)
  - Formulario con motivo de consulta como pills, datos básicos, asunto, mensaje, adjuntos
  - Sidebar: horario en card dark · sede con mapa SVG estilizado mostrando Las Lagunillas con pulse · cifras de respuesta
- [x] `buscador.html` — patrón **resultados globales con tabs**
  - Hero con buscador prominente y query precargada "interruptor simón"
  - 5 tabs: Todos / Productos / Tutoriales / Servicios / Ayuda con contadores
  - Vista "Todos" muestra secciones por tipo con previa de cada uno
  - Términos buscados resaltados con `<mark>` ámbar
  - Sidebar facetado con filtros (en stock, con tutorial, tarifa pro)
  - Sugerencias de búsqueda y "no encuentras lo que buscas → pregúntanos"

---

## Dónde lo dejé (última sesión)

**2026-04-25** — Fases 0 y 1 cerradas.
- Leídos los 2 PDFs completos del proyecto (68 pág + wireframes).
- Validado plan con el usuario: stack HTML+Tailwind+JS, paleta grafito/crema/ámbar.
- Estructura, documentación, sistema de diseño y Home v1 entregadas.
- Feedback usuario sobre Home: paleta OK, le chirriaba el cuadro "Pedidos hoy/Técnicos en ruta" del hero (estética dashboard-SaaS, fuera de tono editorial). Sustituido por mini-poster del tutorial destacado #042 (más editorial y conecta con storyline Antonio).
- Añadido mobile nav drawer.

**Siguiente paso cuando retomemos:**
1. **Revisión completa del prototipo**: abrir `index.html` y navegar las 17 pantallas. Comprobar que los enlaces internos funcionan en ambas direcciones.
2. **Pase de pulido recomendado** (no obligatorio para entrega, pero deseable):
   - Verificar accesibilidad: contraste de texto, focus visible (ya hay `:focus-visible` en CSS), aria-labels en botones de iconos sin texto.
   - Probar responsive en 375px (móvil), 768px (tablet) y 1440px+ (desktop).
   - Revisar que las imágenes de Unsplash cargan; los `onerror` ya tienen fallback SVG.
   - Considerar añadir un `404.html` si la entrega lo requiere.
3. **Posibles iteraciones según feedback**:
   - Pulir microcopy de algunas pantallas si el revisor encuentra fricciones.
   - Ajustar la paleta si en revisión visual se ve demasiado cálida o demasiado sobria en según qué pantalla.
   - Completar sustitución de datos hardcoded por renderizado desde API en las pantallas que aún conservan contenido estático como fallback.

## Estado actual: PROTOTIPO + SUBPANTALLAS COMPLETAS ✅

**63 HTML totales** con lógica backend incremental. Sistema de diseño consolidado en `assets/css/styles.css`.

### Subpantallas legales y transversales (2026-04-28)
- `aviso-legal.html` (long-read 8 secciones · titularidad, objeto, uso, propiedad intelectual, enlaces, responsabilidad, ley, contacto)
- `privacidad.html` (RGPD · TL;DR ink en card, 9 secciones, tabla categorías de datos)
- `cookies.html` (panel ajustes con switches por categoría · técnicas/preferencias/analítica/marketing · 4 tablas detalle)
- `terminos.html` (contrato venta · 11 secciones · cuenta, pedidos, envío, desistimiento, garantías, servicios, presupuestos)
- `accesibilidad.html` (declaración WCAG 2.2 AA · estado parcialmente conforme · buzón directo · auditoría Inclusite)
- `recuperar-password.html` (split branding 4 pasos · email → enviado → nueva clave → success · soporte de `token=`)
- `trabaja-con-nosotros.html` (careers · valores · 3 vacantes · beneficios numerados 01-08 · candidatura espontánea · CTA red colaboradores)
- `marcas.html` (38 fabricantes · destacadas en grid asimétrico · listado por familia · distribuidor oficial dark)
- `seguir-solicitud.html` (tracking anónimo en 2 pasos · busca por código + email · timeline detallada con 5 estados)
- `404.html` (editorial · bombilla rota animada · 3 atajos · búsquedas frecuentes)

### Subpantallas de contenido Hazlo Tú Mismo (2026-04-28)
- `consejos.html` (47 consejos firmados Alfonso Torres · grid masonry · alternancia clara/dark · boletín jueves)
- `descargas.html` (24 PDFs · manual destacado · 5 categorías · pack ZIP completo)
- `proyectos.html` (9 proyectos multi-tutorial · sesiones, dificultad, presupuesto material · "cuándo no hacerlo" intercalado · 5 próximos)
- `videos.html` (62 videotutoriales · featured 2/3-1/3 · grid · canal YouTube CTA)

**Enlaces conectados:**
- Footers de las 16 pantallas principales → legal hub completo
- login.html → recuperar-password.html (¿La olvidaste) y privacidad/terminos en consentimiento
- quienes-somos → trabaja-con-nosotros
- tienda → marcas
- faqs → seguir-solicitud (tracking anónimo)
- hazlo-tu-mismo → consejos / descargas / proyectos / videos / buscador con queries (interruptor, videoportero, temperatura de color, enchufe quemado)

### Subpantallas añadidas (2026-04-27)
**Flujo carrito completo (4 pasos vinculados):**
- `carrito.html` → `checkout.html` (entrega · dirección · velocidad envío) → `pago.html` (tarjeta/Bizum/PayPal/transferencia, métodos guardables) → `pedido-confirmado.html` (código GLX, tracking horizontal, filamentos cayendo, puente al tutorial)

**Detalles documento comercial pro:**
- `albaran.html` (detalle albarán: emisor/cliente, líneas con descuento pro, totales sin IVA, botón convertir-a-factura)
- `factura.html` (detalle factura: base imponible, IVA 21%, banner pago aplazado, historial de evento)
- `presupuesto.html` (detalle presupuesto: tracking estado borrador→enviado→esperando→aceptado, conversación con cliente integrada, validez)
- `crear-presupuesto.html` (formulario 4 pasos: cliente · concepto · líneas con buscador SKU + líneas libres · condiciones · resumen live en sidebar)

**Devoluciones:**
- `devolucion.html` (4 pasos: productos del pedido seleccionables, motivo en 6 cards + texto + fotos, modo recogida/punto SEUR, reembolso al método original o saldo)

**Enlaces conectados:**
- carrito → checkout → pago → pedido-confirmado
- albaranes (filas clickables) → albaran
- facturas (filas clickables) → factura
- mis-presupuestos (cards clickables + botón crear) → presupuesto / crear-presupuesto
- mis-pedido → devolucion (botón "Solicitar devolución") y → factura ("Ver factura")
- area-personal pro: filas albaranes → albaran, cards presupuestos → presupuesto, sidebar "Mis presupuestos" → mis-presupuestos.html

Documentación viva en `docs/` con bitácora, decisiones (D-001 a D-026), inventario de pantallas, sistema de diseño y microcopy.

Las pantallas, en orden de navegación natural:
1. `index.html` (Home) — cinematográfica, 3 puertas asimétricas
2. `hazlo-tu-mismo.html` (Biblioteca) — revista editorial con 11 secciones
3. `tutorial.html` (Ficha tutorial) — long-read con sidebar sticky y reading bar
4. `tienda.html` (Landing tienda) — grid editorial de familias
5. `categoria.html` (Mecanismos) — sidebar facetado + grid denso
6. `producto.html` (Ficha) — DUAL particular/profesional con toggle
7. `servicios.html` — matriz 3×4 + timeline + casos editoriales + mapa Andalucía
8. `servicio.html` (Avería eléctrica) — long-read con sidebar de precio
9. `solicitar-tecnico.html` — stepper 6 pasos full-screen con sidebar live
10. `solicitud-confirmacion.html` — código GLX + filamentos cayendo + tracking
11. `login.html` — split branding + registro DUAL inline
12. `area-personal.html` — dashboard DUAL con toggle (particular vs profesional)
13. `quienes-somos.html` — storytelling vertical con socios reales del proyecto
14. `carrito.html` — items + resumen sticky con conversión a presupuesto
15. `faqs.html` — centro de ayuda con 8 categorías y 6 secciones
16. `contacto.html` — multicanal con mapa SVG y formulario
17. `buscador.html` — resultados globales con tabs y highlights `<mark>`

## Avance 2026-04-29: rutas y lógica de catálogo

- Creada jerarquía `web/pages/` por dominios funcionales sin eliminar las páginas raíz.
- Añadido `web/docs/ROUTES.md` con mapa de rutas canónicas y rutas de compatibilidad.
- Corregidos residuos HTML en overlays de búsqueda y footers insertados dentro de tarjetas de `hazlo-tu-mismo.html`.
- Añadido `assets/js/catalog-ui.js` para filtros de listados, swatches, chips, ordenación y selector de producto.
- Añadida tabla provisional `product_variants` y endpoints de variantes en catálogo.

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

- Implementada recuperación/reset/cambio de contraseña en backend y conectada en `recuperar-password.html`.
- Añadido historial de eventos para pedidos y solicitudes técnicas.
- Conectado seguimiento público de solicitud por código/email y timeline real en detalle de pedido.
- Validado con API y Playwright: recuperación completa, solicitud pública con eventos y pedido con eventos sin errores de consola.

## Avance 2026-04-29: checkout avanzado

- Añadido endpoint de opciones de checkout con direcciones, envíos, pagos guardados y cupones.
- El checkout aplica `GLX5`, `ENVIO0` y `PRO10` según reglas de rol.
- Probado pedido completo desde `pago.html` con cupón y envío urgente, confirmando pedido y eventos sin errores de consola.

## Avance 2026-04-30: administración interna

- Creado dominio backend `admin` con resumen operativo y listados gestionables.
- Añadido usuario semilla de administración para pruebas locales.
- Creada pantalla `admin.html` y copia jerarquizada `pages/sistema/admin.html`.
- Conectadas acciones de cambio de estado desde el panel admin contra la API.

## Avance 2026-04-30: administración de catálogo

- Añadidos endpoints admin para listar, crear, editar y ajustar stock de productos.
- Añadida auditoría administrativa en SQLite provisional.
- Extendida pantalla `admin.html` con alta rápida de producto, control de stock y listado de auditoría.
