#!/usr/bin/env python3
"""
GarperLux — Importa productos scrapeados a la base de datos SQLite.

Lee scripts/scraper/output/<slug>.json y los inserta en backend/database/garperlux.sqlite.
Descarga imágenes a web/assets/img/productos/ y guarda la ruta relativa en
products.image. Idempotente: si el SKU ya existe, lo actualiza.

Uso:
    python import_to_db.py            # importa todas las categorías scrapeadas
    python import_to_db.py iluminacion mecanismos
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("[err] falta requests. Instálalo: pip install requests")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent
DB_PATH = PROJECT_ROOT / "backend" / "database" / "garperlux.sqlite"
OUTPUT_DIR = ROOT / "output"
IMAGES_DIR = PROJECT_ROOT / "web" / "assets" / "img" / "productos"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))


# ---------- Helpers de imagen -----------------------------------------------

def _safe_image_filename(sku: str, image_url: str) -> str:
    """Devuelve un filename seguro basado en el SKU + extensión derivada de la URL."""
    safe_sku = re.sub(r"[^a-zA-Z0-9._-]", "_", sku)
    parsed = urlparse(image_url)
    path = parsed.path.lower()
    ext = ".jpg"
    for candidate in (".jpg", ".jpeg", ".png", ".webp"):
        if path.endswith(candidate):
            ext = candidate
            break
    return f"{safe_sku}{ext}"


def _download_image(url: str, dest: Path, ua: str) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        response = requests.get(url, timeout=30, headers={"User-Agent": ua})
        response.raise_for_status()
        dest.write_bytes(response.content)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"  [img-err] {url}: {exc}")
        return False


_SVG_PALETTE = [
    ("#0B0D12", "#F7F3EC"),  # ink/paper
    ("#B8753A", "#F7F3EC"),  # copper
    ("#1E3A8A", "#F7F3EC"),  # electric
    ("#16A34A", "#F7F3EC"),  # stock green
    ("#D97706", "#F7F3EC"),  # caution amber
    ("#7B5638", "#F7F3EC"),  # madera
]


def _generate_placeholder_svg(sku: str, brand: str, name: str, dest: Path) -> bool:
    h = int(hashlib.md5(sku.encode("utf-8")).hexdigest()[:6], 16)
    bg, fg = _SVG_PALETTE[h % len(_SVG_PALETTE)]
    safe_brand = (brand or "GarperLux")[:18].replace("&", "&amp;").replace("<", "&lt;")
    initials = "".join([w[0] for w in (name or "GL").split() if w][:3]).upper()[:3] or "GL"
    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">'
        f'<rect width="320" height="320" fill="{bg}"/>'
        f'<rect x="20" y="20" width="280" height="280" fill="none" stroke="{fg}" stroke-opacity="0.15" stroke-width="2"/>'
        f'<text x="160" y="170" text-anchor="middle" font-family="Georgia, serif" font-weight="500"'
        f' font-size="84" fill="{fg}" fill-opacity="0.95">{initials}</text>'
        f'<text x="160" y="225" text-anchor="middle" font-family="monospace"'
        f' font-size="14" fill="{fg}" fill-opacity="0.75" letter-spacing="2">{safe_brand.upper()}</text>'
        f'<text x="160" y="290" text-anchor="middle" font-family="monospace"'
        f' font-size="11" fill="{fg}" fill-opacity="0.45">SKU {sku[:18]}</text>'
        '</svg>'
    )
    try:
        dest.write_text(svg, encoding="utf-8")
        return True
    except Exception:  # noqa: BLE001
        return False


# ---------- Helpers de DB ---------------------------------------------------

def _slugify(value: str) -> str:
    value = (value or "").lower().strip()
    value = re.sub(r"[áàäâ]", "a", value)
    value = re.sub(r"[éèëê]", "e", value)
    value = re.sub(r"[íìïî]", "i", value)
    value = re.sub(r"[óòöô]", "o", value)
    value = re.sub(r"[úùüû]", "u", value)
    value = re.sub(r"ñ", "n", value)
    value = re.sub(r"[^a-z0-9\s-]", "", value)
    value = re.sub(r"\s+", "-", value).strip("-")
    return value[:100] or "producto"


def _ensure_columns(conn: sqlite3.Connection):
    cur = conn.cursor()
    cols_products = [r[1] for r in cur.execute("PRAGMA table_info(products)").fetchall()]
    if "image" not in cols_products:
        cur.execute("ALTER TABLE products ADD COLUMN image TEXT")
    cols_brands = [r[1] for r in cur.execute("PRAGMA table_info(brands)").fetchall()]
    if "logo" not in cols_brands:
        cur.execute("ALTER TABLE brands ADD COLUMN logo TEXT")
    conn.commit()


def _get_or_create_category(conn: sqlite3.Connection, slug: str, name: str) -> int:
    cur = conn.cursor()
    row = cur.execute("SELECT id FROM categories WHERE slug = ?", (slug,)).fetchone()
    if row:
        return int(row[0])
    cur.execute(
        "INSERT INTO categories (slug, name, parent_id, description) VALUES (?, ?, NULL, ?)",
        (slug, name, f"Productos de {name}."),
    )
    conn.commit()
    return int(cur.lastrowid)


def _get_or_create_brand(conn: sqlite3.Connection, name: str) -> int:
    name = (name or "").strip() or "GarperLux"
    slug = _slugify(name)
    cur = conn.cursor()
    row = cur.execute("SELECT id FROM brands WHERE slug = ?", (slug,)).fetchone()
    if row:
        return int(row[0])
    cur.execute(
        "INSERT INTO brands (slug, name, professional) VALUES (?, ?, 0)",
        (slug, name),
    )
    conn.commit()
    return int(cur.lastrowid)


def _stable_slug(base: str, sku: str) -> str:
    base_slug = _slugify(base)
    suffix = hashlib.md5(sku.encode("utf-8")).hexdigest()[:6]
    return f"{base_slug}-{suffix}"[:120]


def _stable_stock(sku: str) -> int:
    """Stock pseudo-aleatorio (0-150) determinista por SKU."""
    h = int(hashlib.md5(sku.encode("utf-8")).hexdigest()[:6], 16)
    return h % 150


# ---------- Importación -----------------------------------------------------

def _import_category(
    conn: sqlite3.Connection,
    category_meta: dict,
    products: list[dict],
    user_agent: str,
) -> tuple[int, int]:
    cat_id = _get_or_create_category(conn, category_meta["slug"], category_meta["name"])
    inserted = updated = 0
    cur = conn.cursor()
    for raw in products:
        sku = (raw.get("sku") or "").strip()
        name = (raw.get("name") or "").strip()
        if not sku or not name:
            continue
        brand_name = raw.get("brand") or "GarperLux"
        brand_id = _get_or_create_brand(conn, brand_name)
        slug = _stable_slug(name, sku)
        price = raw.get("price")
        if price is None:
            continue
        price = float(price)
        # specs_json incorpora marca y todas las características normalizadas
        # para que el filtro textual del front-end (catalog-ui.js) las localice.
        specs = dict(raw.get("specs") or {})
        specs.setdefault("Marca", brand_name)
        if raw.get("source_url"):
            specs.setdefault("_source", raw["source_url"])
        # Imagen: descarga remota si hay URL; en caso contrario, SVG generado.
        image_path: str | None = None
        image_paths: list[str] = []
        image_urls: list[str] = []
        if raw.get("images") and isinstance(raw["images"], list):
            image_urls = [u for u in raw["images"] if u]
        elif raw.get("image_url"):
            image_urls = [raw["image_url"]]
        safe_sku = re.sub(r"[^a-zA-Z0-9._-]", "_", sku)
        for idx, url in enumerate(image_urls):
            base_filename = _safe_image_filename(sku, url)
            if idx > 0:
                stem, dot, ext = base_filename.rpartition(".")
                base_filename = f"{stem}_{idx}.{ext}" if dot else f"{base_filename}_{idx}"
            dest = IMAGES_DIR / base_filename
            if _download_image(url, dest, user_agent):
                image_paths.append(f"/assets/img/productos/{base_filename}")
            time.sleep(0.12)
        if not image_paths:
            svg_dest = IMAGES_DIR / f"{safe_sku}.svg"
            if _generate_placeholder_svg(sku, brand_name, name, svg_dest):
                image_paths.append(f"/assets/img/productos/{safe_sku}.svg")
        if image_paths:
            image_path = image_paths[0]
            specs["_images"] = image_paths

        existing = cur.execute("SELECT id FROM products WHERE sku = ?", (sku,)).fetchone()
        description = (raw.get("description") or f"{name}.")[:1000]
        stock = _stable_stock(sku)
        if existing:
            cur.execute(
                """
                UPDATE products
                SET name = ?, slug = ?, category_id = ?, brand_id = ?, price = ?,
                    description = ?, specs_json = ?, image = ?, stock = COALESCE(?, stock)
                WHERE sku = ?
                """,
                (
                    name, slug, cat_id, brand_id, price,
                    description, json.dumps(specs, ensure_ascii=False), image_path,
                    stock, sku,
                ),
            )
            updated += 1
        else:
            try:
                cur.execute(
                    """
                    INSERT INTO products (
                        sku, name, slug, category_id, brand_id, price, stock,
                        safety_level, pro_only, description, specs_json, image
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'basic', 0, ?, ?, ?)
                    """,
                    (
                        sku, name, slug, cat_id, brand_id, price, stock,
                        description, json.dumps(specs, ensure_ascii=False), image_path,
                    ),
                )
                inserted += 1
            except sqlite3.IntegrityError as exc:
                # slug duplicado u otro: añadimos sufijo y reintentamos
                slug = f"{slug}-{cur.lastrowid or stock}"
                cur.execute(
                    """
                    INSERT INTO products (
                        sku, name, slug, category_id, brand_id, price, stock,
                        safety_level, pro_only, description, specs_json, image
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'basic', 0, ?, ?, ?)
                    """,
                    (
                        sku, name, slug, cat_id, brand_id, price, stock,
                        description, json.dumps(specs, ensure_ascii=False), image_path,
                    ),
                )
                inserted += 1
    conn.commit()
    return inserted, updated


def main(argv: list[str]):
    if not DB_PATH.exists():
        print(f"[err] no existe la DB: {DB_PATH}")
        print("      arranca el backend al menos una vez (`npm run backend`) para crearla.")
        return 1
    if not OUTPUT_DIR.exists():
        print(f"[err] no hay datos scrapeados en {OUTPUT_DIR}. Ejecuta primero scrape_leroy.py.")
        return 1

    user_agent = CONFIG["site"]["user_agent"]
    requested = {arg.lower() for arg in argv} if argv else None

    conn = sqlite3.connect(DB_PATH)
    try:
        _ensure_columns(conn)
        for cat in CONFIG["categories"]:
            if requested and cat["slug"] not in requested:
                continue
            json_path = OUTPUT_DIR / f"{cat['slug']}.json"
            if not json_path.exists():
                print(f"[skip] {cat['slug']}: sin JSON ({json_path.name})")
                continue
            try:
                products = json.loads(json_path.read_text(encoding="utf-8"))
            except Exception as exc:  # noqa: BLE001
                print(f"[err] {json_path}: {exc}")
                continue
            print(f"\n=== Importando {cat['slug']} ({len(products)} productos) ===")
            ins, upd = _import_category(conn, cat, products, user_agent)
            print(f"  insertados={ins}  actualizados={upd}")
        print("\n[done] importación completa")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
