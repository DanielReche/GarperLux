# Insertar marcas en DB y actualizar página de marcas

## Resumen
Añadir las 21 marcas con datos completos (descripción, país, año fundación, categorías, logo) a la tabla `brands` de SQLite, y actualizar `marcas.html` para cargar las marcas dinámicamente desde la API.

## Cambios propuestos

### 1. Base de datos — `backend/src/db.js`

#### Nuevas columnas en `brands`
Usar `ensureColumn` para añadir:
- `description TEXT` — descripción de la marca
- `country TEXT` — país de origen
- `year_founded TEXT` — año de fundación
- `website TEXT` — web del fabricante
- `categories_json TEXT DEFAULT '[]'` — familias de producto a las que pertenece

#### Seed de las 21 marcas
Actualizar la función `seed()` para insertar las 21 marcas con `INSERT OR IGNORE`:

| Marca | Slug | País | Año | Categorías |
|---|---|---|---|---|
| Simon | simon | España | 1916 | Mecanismos |
| Schneider Electric | schneider | Francia | 1836 | Mecanismos, Protecciones |
| Niessen | niessen | España | 1929 | Mecanismos |
| Legrand | legrand | Francia | 1865 | Protecciones |
| Televes | televes | España | 1958 | Antenas y telecomunicaciones |
| Shelly | shelly | Bulgaria | 2017 | Domótica |
| Chint | chint | China | 1984 | Protecciones |
| Hager | hager | Alemania | 1955 | Mecanismos, Protecciones |
| Tegui | tegui | España | — | Porteros y Videoporteros |
| Fermax | fermax | España | 1949 | Porteros y Videoporteros |
| Erreka | erreka | España | — | Automatismos |
| Nice | nice | Italia | 1993 | Automatismos |
| Pujol Muntalá | pujol-muntala | España | — | Automatismos |
| Clemsa | clemsa | España | 1961 | Automatismos |
| Hikvision | hikvision | China | 2001 | Seguridad |
| Dahua | dahua | China | 2001 | Seguridad |
| Tapo | tapo | China | — | Seguridad |
| Philips | philips | Países Bajos | 1891 | Iluminación, Domótica |
| Matel | matel | España | — | Iluminación |
| LightEd | lighted | España | — | Iluminación |
| Osram | osram | Alemania | 1919 | Iluminación |

---

### 2. API — `backend/src/domains/catalog.js`

Actualizar la respuesta del endpoint `GET /api/catalog/brands` para incluir los nuevos campos (`description`, `country`, `year_founded`, `logo`, `categories_json`).

---

### 3. API Client — `web/data/api.js`

Añadir un método `brands()` al cliente API:
```js
brands: () => request('/catalog/brands'),
```

---

### 4. Página — `web/pages/empresa/marcas.html`

- Reemplazar las marcas hardcoded en la sección "Destacadas" con marcas cargadas dinámicamente desde la API
- Actualizar la sección "Por familia" con las categorías correctas del usuario
- Añadir filtrado funcional por familia
- Mostrar logos de las marcas en las tarjetas
- Actualizar el contador de fabricantes (de 38 a 21)

## Verificación

- Reiniciar el servidor con `--reset-db` para aplicar el nuevo seed
- Comprobar `GET /api/catalog/brands` devuelve las 21 marcas con datos completos
- Verificar que `marcas.html` carga y muestra las marcas correctamente
