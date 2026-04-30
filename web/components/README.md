# Componentes HTML reutilizables

Los componentes se cargan con `assets/js/component-loader.js` mediante `fetch`.

Uso:

```html
<div data-component="site-header"></div>
<div data-component="site-footer"></div>
```

Componentes actuales:

- `site-header.html`: navegación principal, cuenta, carrito, menú móvil y buscador global.
- `site-footer.html`: columnas de navegación, redes, legal y datos de contacto.

El loader adapta rutas para una futura carpeta `/pages` y elimina duplicados de menú móvil/buscador cuando una pantalla aún conserva fragmentos antiguos como fallback.
