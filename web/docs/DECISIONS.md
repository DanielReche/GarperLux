# Decisiones de diseño — GarperLux Web

> Registro de decisiones importantes con su justificación.
> Si vuelves a una duda antigua, léelo aquí antes de cambiar.

---

## D-001 · Stack: HTML estático + Tailwind CDN + JS vanilla
**Fecha:** 2026-04-25
**Decisión:** Web estática sin build pipeline. Tailwind via Play CDN con config inline.
**Por qué:** Es un entregable académico (práctica UJA-SIWEB). Debe abrirse con doble click, sin npm install. Tailwind CDN genera warning pero funciona perfecto para prototipo de alta fidelidad. Prioriza facilidad de entrega/revisión sobre optimización prod.

---

## D-002 · Paleta grafito + crema + ámbar filamento
**Fecha:** 2026-04-25
**Decisión:** No usamos el azul corporativo típico del sector eléctrico.
**Por qué:** Los competidores analizados (Leroy Merlin, Belcrilux, Garcón, Ramper) usan paletas genéricas. Una paleta editorial cálida con ámbar "filamento" diferencia la marca y refuerza el concepto *Lux* (luz). El grafito aporta profesionalidad; el crema/papel da calidez didáctica para Antonio; el ámbar actúa como acento de acción y remite directamente a bombilla incandescente.

---

## D-003 · Ficha de producto DUAL con toggle, no dos páginas
**Fecha:** 2026-04-25
**Decisión:** Una misma URL con un toggle "Vista particular / Vista profesional" que reordena y cambia densidad de información.
**Por qué:** La entrevista al instalador Alfonso lo pedía explícitamente ("debería tener dos vistas"). Dos páginas duplicarían URLs y SEO. Un toggle además permite que el particular se "asome" a la vista técnica si está curioso, y el profesional se lleva la vista simplificada cuando explica al cliente. La vista por defecto depende del rol si está logueado.

---

## D-004 · Solicitar técnico como stepper full-screen, no formulario largo
**Fecha:** 2026-04-25
**Decisión:** Cada paso ocupa toda la pantalla, con una barra de progreso arriba. No hay un formulario vertical con 15 campos.
**Por qué:** Reduce carga cognitiva y abandono. Benchmarking de Leroy Merlin: formularios largos tienen alta tasa de abandono. Además facilita la validación paso a paso y el guardado de estado.

---

## D-005 · Hazlo tú mismo se organiza PRIMERO por problema, no por categoría técnica
**Fecha:** 2026-04-25
**Decisión:** La landing de tutoriales muestra primero "Problemas frecuentes" ("Salta el automático", "No enciende", "Quiero cambiar un interruptor") y solo después categorías técnicas.
**Por qué:** Hallazgo directo del prototype testing con Laura y del card sorting: el particular no llega buscando "Mecanismos > Interruptores", llega buscando "me ha saltado la luz". Respeta la lógica problema → solución validada en el proyecto.

---

## D-006 · Puente aprender → comprar → ayuda visible en todas las páginas relevantes
**Fecha:** 2026-04-25
**Decisión:** Cada tutorial incluye un bloque "Productos utilizados en este tutorial" con CTA directa al carrito, y un bloque "Si esta tarea te supera" con CTA a Solicitar técnico. Cada producto enlaza a tutoriales relacionados cuando existan.
**Por qué:** Es el puente estratégico del proyecto. El testing con Manuel confirmó que el particular compra con más confianza cuando ve el producto contextualizado en un tutorial.

---

## D-007 · Tres puertas asimétricas, no tres cards iguales
**Fecha:** 2026-04-25
**Decisión:** En la Home las 3 puertas (Aprender/Comprar/Pedir ayuda) se presentan con tamaños y estilos distintos — no una fila de 3 tarjetas clónicas.
**Por qué:** Tres tarjetas idénticas implican "las tres pesan igual". Pero el documento del proyecto deja claro que Hazlo tú mismo es el núcleo diferencial de GarperLux. La asimetría comunica jerarquía visual y evita la estética genérica.

---

## D-008 · Anti-repetición por sección
**Fecha:** 2026-04-25
**Decisión:** Cada gran sección del sitio usa un patrón maestro distinto (ver DESIGN_SYSTEM §5).
**Por qué:** El usuario pidió explícitamente "diseños variados, tampoco que sea super repetitivo". Además, cada perfil/contexto exige una densidad distinta: la tienda debe ser compacta; un tutorial debe respirar; un formulario debe centrar.

---

---

## D-010 · Tutorial firmado por instalador real del proyecto (Alfonso Torres)
**Fecha:** 2026-04-25
**Decisión:** El tutorial individual lleva una franja de "Revisado por Alfonso Torres · Instalador autorizado · Mengíbar (Jaén) · Carnet BT vigente".
**Por qué:** Alfonso es el instalador real entrevistado en la Actividad 1 del proyecto. Reutilizarlo como revisor visible (1) refuerza la credibilidad del tutorial ante el particular (Antonio), (2) cierra el círculo entre la investigación documentada y el producto final, y (3) atiende la demanda detectada en investigación: "el particular necesita seguridad antes de actuar". Todos los tutoriales del sitio deberían llevar un "revisor técnico" identificable.

---

## D-011 · Números de paso como tipografía editorial gigante (no badges circulares)
**Fecha:** 2026-04-25
**Decisión:** Cada paso del tutorial muestra su número como display Fraunces de hasta 9rem con stroke cobre, no como un círculo numerado clásico.
**Por qué:** Refuerza el patrón maestro "long-read editorial" del tutorial y lo aleja del look "wikiHow / blog genérico de bricolaje". Además, mejora la jerarquía visual al recorrer la página: el ojo aterriza en cada paso aunque hagas scroll rápido. Decisión coherente con D-008 (anti-repetición por sección).

---

## D-028 · Cuatro tipos de cliente, no tres — el instalador autorizado es el núcleo B2B

---

## D-029 · Backend separado por dominios + SQLite provisional
**Fecha:** 2026-04-29
**Decisión:** Se añade un backend en `backend/` separado del prototipo HTML. La persistencia provisional usa SQLite y la API se organiza por dominios: autenticación, catálogo, carrito, pedidos, presupuestos, solicitudes técnicas, área personal, documentos y contenido.
**Por qué:** El proyecto visual ya tiene muchas pantallas y no conviene reescribirlas de golpe. Separar backend y frontend permite conectar lógica real pantalla por pantalla, documentar entidades y cambiar más adelante a la base de datos definitiva de otra asignatura sin rehacer toda la interfaz.
**Fecha:** 2026-04-27
**Decisión:** En `quienes-somos.html` la sección "A quién servimos" muestra **cuatro** tipos de cliente: Hogar (B2C), Comercios (B2B), Comunidades (B2B) e **Instaladores autorizados (B2B · núcleo del negocio)**. El cuarto bloque se destaca visualmente con fondo `filament/10`, borde ámbar y un icono de circle filled, además de actuar como CTA enlazando a `login.html#registro-pro`.
**Por qué:** La versión inicial omitía al perfil instalador entre los tipos de cliente, lo cual contradecía explícitamente el documento del proyecto (Actividad 0.C): *"Este perfil constituye el núcleo del negocio B2B (es decir, parte del beneficio de nuestra empresa es servir a otras empresas). Se trata de instaladores autónomos o pequeñas empresas en posesión del carnet de instalador electricista vigente"*. Olvidarlo en "Quiénes somos" era romper la coherencia con todo el resto del prototipo (donde Jose Luis "El Chispas" tiene su propia vista en producto, área personal y registro pro). El cuarto bloque destaca visualmente porque es el cliente B2B principal — lo contrario a un mero "etcétera". *Feedback usuario en sesión 2026-04-27.*

---

## D-027 · Los socios de "Quiénes somos" son los autores reales del proyecto académico
**Fecha:** 2026-04-26
**Decisión:** En `quienes-somos.html` los dos socios fundadores firman como **Rubén Pérez Chica** (CTO · Catálogo y plataforma) y **Daniel García Reche** (COO · Servicios técnicos y operaciones), que son los autores reales del proyecto SIWEB de la UJA.
**Por qué:** Cierra el círculo entre la realidad académica y la ficción del prototipo. La empresa GarperLux es ficticia, pero su nombre se construye literalmente con las primeras letras de los apellidos de los dos autores (García + Pérez + Lux). Hacer que aparezcan como socios fundadores en la página "Quiénes somos" da coherencia narrativa al prototipo y cumple lo que el documento del proyecto explica en la actividad 0.A: "el nombre elegido para la marca es GarperLux S.L., cuyo significado hace referencia a la combinación de las tres primeras letras de los dos apellidos de los dos socios de la entidad junto al término Lux".

---

## D-023 · Login con split panel: branding ink a la izquierda, form a la derecha
**Fecha:** 2026-04-26
**Decisión:** El login adopta el patrón split (50/50 desktop) con panel izquierdo en `--ink` con manifiesto + testimonio + features, y panel derecho en `--paper` con el form. En móvil el panel izquierdo desaparece y se muestra una mini-bar oscura arriba.
**Por qué:** En el momento de autenticarse el usuario está deteniéndose; un fondo limpio aburrido pierde la oportunidad de comunicar identidad. El panel izquierdo refuerza la propuesta de valor en el momento exacto en que decide darnos sus datos. El testimonio firmado por El Chispas (D-019) cierra el loop de coherencia narrativa.

---

## D-024 · Registro DUAL en un mismo formulario con expansión condicional, no dos formularios separados
**Fecha:** 2026-04-26
**Decisión:** El formulario de registro tiene 2 role-cards en la cabecera (Particular / Soy instalador). Pulsar Pro **expande inline una sección adicional** con DNI, carnet BT, datos fiscales, IBAN y subida de carnet. El CTA del botón cambia: "Crear mi cuenta" → "Enviar solicitud de validación".
**Por qué:** Crear dos páginas separadas (`/registro` y `/registro-pro`) implica que el particular eligiendo "Soy instalador" se pierde el contexto del registro común. Con expansión inline el usuario percibe que comparten base y solo añadimos lo extra. Refuerza visualmente que el rol pro **requiere validación** (con el aviso de 24-48 h) sin ser una página oculta separada. El CTA cambia para reflejar honestamente que no se crea cuenta inmediata.

---

## D-025 · Área personal con toggle DUAL visible (modo demo de prototipo)
**Fecha:** 2026-04-26
**Decisión:** El área personal mantiene el toggle "Particular (Antonio) / Profesional (El Chispas)" arriba como en `producto.html`, marcado explícitamente como **demo** del prototipo. Cambia sidebar, identidad visual del usuario y todo el main content.
**Por qué:** En un prototipo de alta fidelidad sin login real, mostrar ambos dashboards en una sola pantalla con toggle es la forma más directa de demostrar al revisor (y al usuario académico) que el sitio sirve a los dos perfiles. El badge "Demo prototipo" lo deja claro: en producción real el rol vendría del backend tras login. Aprovecha el patrón ya construido en `producto.html` (D-017) para mantener consistencia.

---

## D-026 · Reposición sugerida pro basada en historial de compra
**Fecha:** 2026-04-26
**Decisión:** El dashboard profesional incluye un bloque "Reposición sugerida" con 4 productos basados en el patrón histórico de compra (última fecha + cantidad), con CTA inline "+ N uds" y total al carrito ("Añadir todo: 75 uds · 312,40 €").
**Por qué:** Refuerza directamente la frase de El Chispas en la entrevista del proyecto: "compro siempre lo mismo cuando se me agota el stock". Un instalador no quiere navegar la tienda 12 veces; quiere ver lo que sabe que va a pedir y darle un clic. Esto materializa la "Necesidad clave" identificada en la Persona Jose Luis del proyecto (Actividad 4): "Productos Destacados o Mis Favoritos donde pueda ver rápidamente precios y stock para repetir pedidos casi instantánea".

---

## D-020 · Servicios como matriz 3×4 interactiva, no como tres bloques separados
**Fecha:** 2026-04-26
**Decisión:** En `servicios.html` los servicios se presentan como **matriz 3 (tipos) × 4 (áreas técnicas)**: Averías / Nuevas instalaciones / Mantenimiento, cruzados con Electricidad / Telecomunicaciones / Domótica / Automatismos. Cada celda es un enlace a la ficha del servicio con su precio "desde".
**Por qué:** El proyecto define explícitamente esa cuadrícula de servicios. Mostrar tres bloques solo (los tipos) obligaría al usuario a hacer un segundo clic para elegir área, doblando la profundidad. La matriz hace visible la oferta completa en una sola vista (12 servicios), facilita la comparación de precios "desde" entre áreas y refuerza la sensación de cobertura técnica amplia. Las celdas en hover invierten color (ink + filament) para feedback claro.

---

## D-021 · Stepper con sidebar live (no solo progress bar arriba)
**Fecha:** 2026-04-26
**Decisión:** El flujo de solicitar técnico, además de la progress bar segmentada del header, lleva un **sidebar derecho persistente** que muestra el resumen acumulado del stepper en tiempo real. Los datos van pasando de "Por completar" (gris) a "rellenado" (ámbar) según el usuario avanza.
**Por qué:** Reduce la sensación de "estoy contestando preguntas a ciegas". El usuario ve cómo se construye su solicitud y puede recordar lo que ha contestado sin retroceder. También sirve de andamio mental: cuando ve el sidebar pasar de 3 ítems rellenos a 5, asocia el progreso a algo tangible más allá de un número (`Paso 5/6`). En móvil se oculta y se sustituye por la progress bar segmentada arriba — no compite por espacio.

---

## D-022 · Confirmación con animación de filamentos cayendo (no confeti genérico)
**Fecha:** 2026-04-26
**Decisión:** La página de confirmación celebra el envío con una lluvia sutil de **filamentos verticales** cayendo en el hero (líneas finas con degradado ámbar transparente, que aparecen y desaparecen cíclicamente).
**Por qué:** Una confirmación necesita un instante celebratorio para cerrar el bucle emocional del usuario, pero un confeti de colores rompería completamente la identidad. Los filamentos cayendo son coherentes con el concepto Lux (luz, electricidad, filamento incandescente), aportan vida sin ruido y refuerzan la marca exactamente en el momento de mayor atención del usuario (justo después de enviar).

---

## D-016 · Buscador profesional con 3 modos en la landing de Tienda
**Fecha:** 2026-04-25
**Decisión:** El buscador del hero de `tienda.html` ofrece 3 modos: por nombre / por referencia o SKU / por código de barras (EAN).
**Por qué:** La entrevista al instalador del proyecto deja claro: "buscamos por marca y referencia. La referencia identifica todo: modelo, color, potencia". Para el particular, "por nombre" es el modo natural. El EAN cubre el caso real de obra: tener el producto físico en la mano y querer pedir más. Ofrecer los tres modos en un mismo control reduce la fricción para ambos perfiles sin necesitar páginas separadas.

---

## D-017 · Toggle DUAL: cambio de vista persistente y con fondo levemente distinto
**Fecha:** 2026-04-25
**Decisión:** El toggle particular ↔ profesional de la ficha de producto NO es solo un cambio de bloques: cambia el `data-active-view` del `<body>` y aplica un sutil cambio de fondo (`#FCFAF6` para vista pro vs `#F7F3EC` particular). También se desplaza al inicio al cambiar.
**Por qué:** El toggle no es trivial — son dos modos mentales completamente distintos. El cambio de fondo aporta una "sensación" de modo distinto sin ser invasivo (refuerza al usuario que está viendo otra cosa, sin gritar). Hacer scroll arriba al cambiar evita que el usuario quede en mitad de un bloque que ya no aplica a su vista. Cumple D-003 ampliando la diferenciación visual.

---

## D-018 · Stock por almacén + escalado por volumen solo en vista profesional
**Fecha:** 2026-04-25
**Decisión:** La vista particular muestra "En stock · 70 unidades" simple. La profesional desglosa en una tabla: Jaén Las Lagunillas (47 uds) + Madrid Coslada (23 uds) + próxima reposición prevista (+200 uds, 28-04). Además, escalado por volumen: 1+ → 4,60 € · 10+ → 4,30 € · 25+ → 4,05 € · 100+ → 3,80 €.
**Por qué:** La entrevista al instalador es explícita: "necesito agilidad logística, ver stock real de un producto concreto y poder planificar". Un albañil no necesita saber dónde está cada unidad; un instalador sí. Y el escalado por volumen es información que el particular no necesita pero el profesional usa CONTINUAMENTE para decidir cuánto pide. Ambas piezas se ocultan en vista particular para no abrumar.

---

## D-019 · Reseñas firmadas por las personas del proyecto (Antonio y El Chispas)
**Fecha:** 2026-04-25
**Decisión:** Las dos reseñas mostradas en la ficha de producto las firman "Antonio M." (compra verificada) y "Jose Luis (El Chispas) · cliente pro". Cada uno escribe en su tono.
**Por qué:** Cierra el círculo entre el modelado de usuarios del proyecto (Actividad 4) y el producto final visible. Antonio narra una experiencia real (chisporroteo en cocina, kit del tutorial, 25 minutos), El Chispas valora desde el ángulo profesional (compra por cajas, tarifa pro, descarga de albaranes). Esto refuerza ambas vistas del toggle DUAL y demuestra que el sitio sirve a los dos perfiles.

---

## D-013 · Proyectos paso a paso ≠ Tutoriales sueltos
**Fecha:** 2026-04-25
**Decisión:** En la biblioteca existen DOS niveles de contenido didáctico claramente separados visualmente:
- **Tutoriales** (grid magazine): tarea individual y autónoma — "Cambiar un interruptor".
- **Proyectos paso a paso** (cards horizontales tipo "course"): serie multi-tutorial con calendario y lista total de materiales — "Renueva la iluminación de tu cocina" = 5 tutoriales encadenados.
**Por qué:** El wireframe 3 del proyecto distingue explícitamente "Vídeo Tutoriales" de "Proyectos paso a paso". El usuario novato (Antonio) no siempre sabe que cambiar un interruptor es "lo mismo" que renovar una cocina pero a menor escala. Los proyectos sirven a un caso de uso distinto: no es "tengo un problema concreto" sino "quiero acometer una mejora grande, dime por dónde empezar". Cards horizontales con thumb editorial + 3 datos clave (sesiones, tutoriales encadenados, presupuesto materiales) facilita la decisión.

---

## D-014 · Consejos y Trucos: postal editorial firmada, no FAQs
**Fecha:** 2026-04-25
**Decisión:** El bloque "Consejos y Trucos" del wireframe se materializa como cards estilo "postal" con cita Fraunces grande y firma. No como otra lista de FAQs.
**Por qué:** Las FAQs ya existen como sección separada y resuelven dudas concretas. Los "trucos" son saber tácito del oficio — frases cortas con valor mnemotécnico ("8 mm de cable pelado son suficientes", "el destornillador aislado no es opcional"). Materializarlos como citas tipográficas grandes con firma de Alfonso Torres (D-010) refuerza la voz del instalador y diferencia visualmente del resto. Una de las cards va sobre fondo ink para romper ritmo (anti-repetición D-008).

---

## D-015 · Manuales y Descargas en bloque dark, integra "Herramientas" y "Materiales"
**Fecha:** 2026-04-25
**Decisión:** "Manuales y Descargas" se sitúa al final de la biblioteca (antes de FAQs y CTA técnico) sobre fondo ink. El proyecto pedía índices propios para "Herramientas" y "Materiales"; en lugar de crear dos páginas adicionales, los integramos como dos PDFs descargables ("Herramientas básicas del electricista doméstico", "Materiales más usados en reparaciones") junto con manuales técnicos, glosarios, plantillas y checklist de seguridad imprimible.
**Por qué:** (1) Cumple los requisitos del proyecto sin inflar el árbol de navegación. (2) El formato PDF es el que pide el perfil profesional (Chispas) y respeta su flujo "descargar e imprimir". (3) Para Antonio, encontrar todos los recursos en una "estantería" centralizada es más reconocible que tener que navegar a "Herramientas" como sub-sección. (4) El bloque dark con tarjetas de PDF (con icono propio) crea un cambio de ritmo visual antes de las FAQs y refuerza la sensación de "documento descargable" más que "página web".

---

## D-012 · Hazlo Tú Mismo organizado en 4 grandes entradas rápidas + grid masonry
**Fecha:** 2026-04-25
**Decisión:** La biblioteca arranca con 4 cajas grandes ("Empieza por aquí", "Seguridad", "Averías frecuentes", "Cuándo NO hacerlo") antes que con el listado de tutoriales.
**Por qué:** El testing de Laura mostró que entrar directamente al listado abruma. Cuatro accesos rápidos por intención (en orden mental: aprende lo básico → revisa seguridad → mira si es lo que te pasa → asegúrate de que es para ti) reducen carga cognitiva y ofrecen un mapa mental claro antes de filtrar 184 guías. Coherente con D-005 (entrada por problema).

---

## D-009 · Hero aside: poster editorial, no cuadro de datos en vivo
**Fecha:** 2026-04-25
**Decisión:** El widget lateral del hero NO muestra "Pedidos hoy / Técnicos en ruta / Referencias / Stock verificado". En su lugar, un mini-poster del tutorial destacado del mes (#042 "Cambiar un interruptor sin volverte loco").
**Por qué:** El cuadro de datos vivos venía del lenguaje dashboard-SaaS y rompía el tono editorial cálido del resto del sitio. Además generaba expectativas que necesitarían backend real para mantener creíbles. El poster editorial conecta con el storyline de Antonio (caso de uso real del proyecto), ancla visualmente el concepto "Hazlo Tú Mismo" desde el primer pliegue y mantiene la estética cinematográfica del hero. *Feedback usuario en sesión 2026-04-25: "no veo del todo que pegue el cuadrado".*

---

*Añadir aquí cada decisión nueva con formato `D-XXX`.*
