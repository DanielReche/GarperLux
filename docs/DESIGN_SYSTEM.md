# GarperLux — Sistema de Diseño

> Filosofía: **Lux** (luz) como material gráfico. Editorial, cálido, técnico cuando toca.
> No es "ferretería genérica azul-blanco". Es confianza artesanal + precisión eléctrica.

---

## 1. Paleta

### Neutros (base)
| Token              | Hex       | Uso |
|--------------------|-----------|-----|
| `--ink`            | `#0B0D12` | Texto principal, fondos dark, header |
| `--ink-soft`       | `#1C1F26` | Secundario dark, tarjetas en dark |
| `--graphite`       | `#40454F` | Texto secundario |
| `--line`           | `#E5DED0` | Líneas, separadores |
| `--paper`          | `#F7F3EC` | Fondo claro principal (crema papel) |
| `--paper-2`        | `#EFE9DE` | Fondo claro alt, tarjetas sobre paper |
| `--white`          | `#FFFFFF` | Campos, tablas técnicas |

### Acentos (identidad)
| Token              | Hex       | Uso |
|--------------------|-----------|-----|
| `--filament`       | `#E8A545` | Color principal de acción. Ámbar cálido. |
| `--filament-glow`  | `#FFC878` | Hover/highlight. |
| `--copper`         | `#B8753A` | Acento oscuro, bordes premium. |
| `--electric`       | `#1E3A8A` | Azul eléctrico. Enlaces, info técnica. |

### Semánticos
| Token       | Hex       | Uso |
|-------------|-----------|-----|
| `--stock`   | `#16A34A` | Stock disponible, éxito |
| `--warn`    | `#DC2626` | Peligro, "Cuándo NO hacerlo" |
| `--caution` | `#D97706` | Advertencia, dificultad media |

---

## 2. Tipografía

**Tres familias, tres roles:**

| Familia          | Peso(s)       | Rol |
|------------------|---------------|-----|
| **Fraunces**     | 500, 600, 700 | Titulares editoriales, "Lux", números grandes |
| **Inter**        | 400, 500, 600 | UI general, cuerpo, menús, CTAs |
| **JetBrains Mono** | 400, 500   | SKU, referencias, códigos, tablas técnicas |

**Escala tipográfica:**
- Display XL: `clamp(3rem, 8vw, 6rem)` Fraunces 600
- Display: `clamp(2.25rem, 5vw, 4rem)` Fraunces 600
- H1: 2.5rem / 1.1 / Fraunces 600
- H2: 2rem / 1.15 / Fraunces 600
- H3: 1.5rem / 1.2 / Inter 600
- H4: 1.125rem / 1.3 / Inter 600
- Body L: 1.125rem / 1.6 / Inter 400
- Body: 1rem / 1.6 / Inter 400
- Caption: 0.8125rem / 1.4 / Inter 500 (uppercase tracking 0.08em)
- Mono: 0.875rem / 1.4 / JetBrains Mono

---

## 3. Radios, sombras, espaciado

- Radios: `4px` (botones pequeños), `10px` (cards, inputs), `20px` (hero/modal), `999px` (pills).
- Sombras: sobrias. `0 1px 2px rgba(11,13,18,0.06)` · elevación 2: `0 10px 30px -12px rgba(11,13,18,0.25)`.
- Espaciado: rejilla 4/8. Secciones grandes `py-24 md:py-32`.

---

## 4. Componentes clave

- **Botón primario:** fondo `--filament`, texto `--ink`, hover `--filament-glow`. Uppercase micro-letter-spacing opcional.
- **Botón fantasma:** borde 1px `--ink`, hover invierte.
- **Pill de estado stock:** pill `bg-green-50 + dot + texto "En stock"`.
- **Card producto:** `paper-2` fondo, sombra sutil, badge marca, precio Fraunces, SKU JetBrains Mono.
- **Card tutorial:** fondo oscuro o claro según zona, banda de dificultad (verde/amarillo/rojo), tiempo en mono.
- **Tabla técnica:** mono para valores, fondo alternado `paper-2`.
- **Alerta "Cuándo NO hacerlo":** borde izquierdo grueso `--warn`, fondo `rgba(220,38,38,0.06)`, icono.
- **Breadcrumbs:** Inter 500 small, separador `/`, último item `--ink`.

---

## 5. Principio anti-repetición

**Cada sección del sitio tiene un "patrón maestro" distinto** para que no sientas que es la misma plantilla:

| Sección | Patrón visual |
|---------|---------------|
| Home | Hero cinematográfico, 3 puertas asimétricas, cintas horizontales |
| Hazlo tú mismo | Revista editorial, pills de filtro sticky, grid masonry |
| Tienda | Grid denso + panel lateral facetado, sticky filter, densidad alta |
| Ficha producto | Hero split con toggle particular/pro, tabla técnica limpia |
| Servicios | Timeline + casos reales con fotos grandes |
| Solicitar técnico | Pantalla por paso (full-screen), progress visible |
| Área personal | Dashboard con sidebar + tabs por rol |
| Quiénes somos | Storytelling vertical, fotos impactantes |

---

## 6. Microcopy y tono

- **Al particular (Antonio):** tú directo, sin jerga. "Cambia tu interruptor en 10 minutos", "¿Tienes dudas? Te echamos un cable".
- **Al profesional (Chispas):** técnico, breve, sin promesas. "Magnetotérmico 25A, curva C · Disp: 47 uds", "Descargar ficha técnica (PDF)".
- Siempre que haya un consejo de seguridad: icono + frase corta + enlace a checklist.

---

## 7. Iconografía

Pack: **Lucide** (lineal, moderno, gratuito). Grosor 1.5px. Tamaño base 20px; 24px para CTAs.
Se incluyen vía `<svg>` inline o via CDN de lucide si es ligero.
