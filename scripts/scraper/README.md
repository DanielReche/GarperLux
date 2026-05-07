# Scraper de catálogo (Leroy Merlin → SQLite GarperLux)

Pipeline en dos pasos para poblar la tienda con productos reales de Leroy Merlin
sin tener que crearlos a mano. Solo para uso interno del proyecto universitario
(SIWEB UJA): no se publica nada online.

## 1. Instalación (una vez)

Desde la raíz del proyecto:

```powershell
cd scripts\scraper
python -m pip install -r requirements.txt
python -m camoufox fetch     # descarga el navegador para StealthyFetcher (~50 MB)
```

Si `python` no apunta a una versión >= 3.10, usa `py -3.12` o el que tengas.

## 2. Scrapear (genera JSON por categoría)

```powershell
# todas las categorías (puede tardar 20-40 min total)
python scrape_leroy.py

# solo unas cuantas
python scrape_leroy.py iluminacion mecanismos protecciones-electricas
```

Resultados en `output/<slug>.json`. El scraper:

- Recorre las URLs de listado definidas en `config.json`.
- Pagina hasta `max_pages_per_category` (4 por defecto).
- Por cada producto extrae el bloque JSON-LD (schema.org/Product) →
  `name, brand, price, image, sku, description` + tabla de "Características".
- Limita a `max_products` por categoría (configurable).

Si Leroy Merlin actualiza la URL de una categoría, **edita `config.json`**.

## 3. Importar a la base de datos GarperLux

> Antes del primer import, asegúrate de haber arrancado el backend al menos
> una vez (`npm run backend`) para que la DB exista en
> `backend/database/garperlux.sqlite`.

```powershell
python import_to_db.py            # importa todas las categorías scrapeadas
python import_to_db.py iluminacion
```

El importer:

- Asegura las columnas `products.image` y `brands.logo` (idempotente).
- Crea categoría/marca si no existen (slug = nombre normalizado).
- Inserta o actualiza productos por SKU.
- Descarga la imagen oficial a `web/assets/img/productos/<sku>.<ext>` y guarda
  la ruta absoluta (`/assets/img/productos/...`) en `products.image`.
- Asigna stock pseudo-aleatorio determinista por SKU.

## 4. Ver el resultado

```powershell
cd ..\..\
npm run backend         # arranca el backend (puerto 3000)
# abre http://localhost:3000/pages/tienda/iluminacion.html
```

`web/assets/js/backend-integration.js` reemplaza las tarjetas estáticas de cada
página de categoría por productos reales del backend, con imagen y un bloque
oculto (`sr-only`) que contiene la marca + valores de specs. El filtro textual
de `catalog-ui.js` consulta ese texto, así que **todos los filtros del sidebar
funcionan automáticamente** sobre los productos importados.

## Notas

- **Anti-bot**: Leroy Merlin usa Akamai. El scraper trata de usar
  `StealthyFetcher` de Scrapling (Camoufox); si falla, hace fallback a
  `requests`, que probablemente devuelva 403. En ese caso vuelve a ejecutar
  `python -m camoufox fetch`.
- **Ritmo**: 1.5 s entre productos + 2.5 s entre páginas. Ajustable en
  `config.json` → `site.request_delay_seconds` / `page_delay_seconds`.
- **Reentrante**: ejecutar el importer otra vez actualiza precio/specs/imagen
  pero no rompe relaciones (cart_items, orders, favorites).
- **Reset**: para empezar de cero, borra `backend/database/garperlux.sqlite*` y
  arranca el backend (recreará la DB con los seeds básicos).
