# GarperLux — Sitio Web

Prototipo de alta fidelidad para GarperLux S.L., proyecto de la asignatura **Sistemas de Información basados en Web** (UJA 2025-26).

## Cómo abrir

Doble click en `index.html`. No requiere instalación, build ni servidor.
*(Tailwind se carga desde Play CDN; hace falta conexión a internet la primera vez.)*

## Estructura

```
web/
├── index.html            Home
├── *.html                Pantallas del prototipo
├── assets/
│   ├── css/styles.css    Sistema de estilos (tokens, componentes, animaciones)
│   ├── js/main.js        Interacciones ligeras
│   ├── js/component-loader.js  Carga header/footer reutilizables
│   ├── js/backend-integration.js  Conexión incremental con API
│   ├── img/              Imágenes y logo SVG
│   └── icons/            Iconografía
├── components/           Fragmentos HTML reutilizables
├── data/api.js           Cliente JS para backend provisional
└── docs/
    ├── PROGRESS.md       Bitácora entre sesiones (LEER PRIMERO)
    ├── DESIGN_SYSTEM.md  Paleta, tipografía, componentes
    ├── DECISIONS.md      Registro de decisiones de UX/UI
    ├── SCREENS.md        Inventario de pantallas
    └── COPY.md           Textos/microcopy
```

## Stack

- HTML5 semántico
- Tailwind CSS 3 (Play CDN, config inline)
- CSS propio con tokens (en `assets/css/styles.css`)
- JS vanilla para interacciones

## Antes de retomar

Lee `docs/PROGRESS.md` para saber dónde lo dejamos.
