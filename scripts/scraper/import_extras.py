#!/usr/bin/env python3
"""
GarperLux — Pipeline integral para los productos extra del manifest.

Pasos por ejecución (idempotente):
  1. Para cada URL del manifest, fetch via Camoufox y parseo de JSON-LD +
     tabla de specs (mismas funciones que scrape_leroy.py).
  2. Insert/update en SQLite respetando convenios (image local, slug, brand,
     category). Las metadata del manifest (Familia, Subcategoría, Gama,
     Color, Tipo, Intensidad…) ENTRAN EN SPECS_JSON tal cual — son más
     fiables que lo que devuelve la fuente.
  3. Construye `_variant_group`, `_variants[]`, `_variant_axis`,
     `_variant_default`, `_variant_is_default`, `_variant_label` siguiendo
     la misma convención que las variantes ya existentes (ver group
     "tegui-kit-audio-s7-4n", "clemsa-ap-barrera"...).
     Regla de agrupación: misma (brand, family, subcategoría, gama) +
     todos los atributos no-axis iguales. UN único atributo varía.

Uso:
    python import_extras.py [--limit N] [--retry-failed]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

# Reuse el parser del scraper general.
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from scrape_leroy import (  # noqa: E402
    _parse_product, _slugify, Session,
)
from extras_manifest import EXTRAS  # noqa: E402

PROJECT_ROOT = ROOT.parent.parent
DB_PATH = PROJECT_ROOT / "backend" / "database" / "garperlux.sqlite"
IMAGES_DIR = PROJECT_ROOT / "web" / "assets" / "img" / "productos"
RAW_OUTPUT = ROOT / "output" / "_extras_raw.json"

CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
USER_AGENT = CONFIG["site"]["user_agent"]


# ============= Helpers ======================================================

def _safe_print(line: str):
    try:
        print(line)
    except UnicodeEncodeError:
        print(line.encode("ascii", "replace").decode("ascii"))


def _safe_image_filename(sku: str, image_url: str) -> str:
    safe_sku = re.sub(r"[^a-zA-Z0-9._-]", "_", sku)
    parsed = urlparse(image_url)
    path = parsed.path.lower()
    ext = ".jpg"
    for candidate in (".jpg", ".jpeg", ".png", ".webp"):
        if path.endswith(candidate):
            ext = candidate
            break
    return f"{safe_sku}{ext}"


def _download_image(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        r = requests.get(url, timeout=30, headers={"User-Agent": USER_AGENT})
        r.raise_for_status()
        dest.write_bytes(r.content)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"    [img-err] {url}: {exc}")
        return False


def _stable_stock(sku: str) -> int:
    h = int(hashlib.md5(sku.encode("utf-8")).hexdigest()[:6], 16)
    return h % 150


def _stable_slug(name: str, sku: str) -> str:
    base = _slugify(name)
    suffix = hashlib.md5(sku.encode("utf-8")).hexdigest()[:6]
    return f"{base}-{suffix}"[:120]


# ============= Fase 1: scrape ===============================================

def _load_raw() -> dict:
    if not RAW_OUTPUT.exists():
        return {}
    try:
        return json.loads(RAW_OUTPUT.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _save_raw(data: dict):
    RAW_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    RAW_OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# JS que recorre <picture>/<img>/<script> para sacar TODAS las imágenes de
# media.adeo.com asociadas al producto (fotos extra de la galería). Mismo
# criterio que rescrape_images.py: filtra mkp/banners y exige width >= 300.
_GALLERY_JS = r"""(() => {
  const out = [];
  const seen = new Set();
  const goodId = (u) => { const m = u.match(/\/media\/(\d{4,})\//); return m ? m[1] : null; };
  const isProduct = (u) => {
    if (!u || typeof u !== 'string' || !u.includes('media.adeo.com')) return false;
    if (u.includes('/mkp/')) return false;
    if (!/\/media\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(u)) return false;
    if (!goodId(u)) return false;
    const w = u.match(/[?&]width=(\d+)/);
    if (w && parseInt(w[1], 10) < 300) return false;
    return true;
  };
  const push = (u) => {
    if (!isProduct(u)) return;
    const id = goodId(u);
    if (seen.has(id)) return;
    seen.add(id);
    out.push(u);
  };
  document.querySelectorAll('picture img, picture source').forEach(el => {
    push(el.currentSrc || el.src);
    const ss = el.getAttribute('srcset');
    if (ss) ss.split(',').forEach(s => push(s.trim().split(' ')[0]));
  });
  document.querySelectorAll('img').forEach(el => { push(el.currentSrc || el.src); });
  document.querySelectorAll('script').forEach(s => {
    const t = s.textContent || '';
    if (!t.includes('media.adeo.com')) return;
    const matches = t.match(/https:\/\/media\.adeo\.com\/media\/\d+\/[^"'\s<>\\]+\.(?:jpg|jpeg|png|webp)/gi) || [];
    matches.forEach(push);
  });
  return out;
})()"""


def _extract_gallery_images(session) -> list[str]:
    """Extrae imágenes de la galería real del producto desde el DOM/scripts.
    Devuelve lista deduplicada por media-id."""
    try:
        urls = session._page.evaluate(_GALLERY_JS)
        return [u for u in (urls or []) if isinstance(u, str)]
    except Exception:  # noqa: BLE001
        return []


def _merge_images(jsonld_imgs: list[str], gallery_imgs: list[str]) -> list[str]:
    """Merge ambas listas deduplicando por media-id (id numérico de la URL)."""
    seen_ids = set()
    out = []
    for u in (jsonld_imgs or []) + (gallery_imgs or []):
        m = re.search(r"/media/(\d+)/", u or "")
        key = m.group(1) if m else u
        if key in seen_ids:
            continue
        seen_ids.add(key)
        out.append(u)
    return out


def scrape_all(limit: int = 0, retry_failed: bool = False) -> dict:
    raw = _load_raw()
    todo = []
    for entry in EXTRAS:
        url = entry["url"]
        sku_match = re.search(r"-(\d{6,})\.html", url)
        sku = sku_match.group(1) if sku_match else _slugify(url)[:30]
        prev = raw.get(sku) or {}
        # Re-scrape también si las imágenes son escasas (< 2) — el primer pase
        # solo trajo la imagen del JSON-LD; ahora queremos toda la galería.
        if (not retry_failed
                and prev.get("price") is not None
                and len(prev.get("images") or []) >= 2):
            continue
        todo.append((sku, entry))
        if limit and len(todo) >= limit:
            break

    if not todo:
        print("[scrape] todos los productos del manifest ya tienen ≥2 imágenes en _extras_raw.json")
        return raw

    print(f"[scrape] cargando Camoufox para {len(todo)} URLs nuevas...")
    # Akamai/DataDome bloquea la sesión tras ~12-15 productos. Por eso
    # reciclamos el navegador cada batch, con un cooldown que despeja la
    # cookie de DataDome y un warmup nuevo.
    BATCH_SIZE = 10
    COOLDOWN = 60.0  # segundos entre batches
    session = None
    consecutive_misses = 0
    fetched_in_batch = 0

    def _open():
        nonlocal session, fetched_in_batch
        session = Session().__enter__()
        fetched_in_batch = 0

    def _close():
        nonlocal session
        if session is not None:
            try: session.__exit__(None, None, None)
            except Exception: pass
            session = None

    _open()
    try:
        for i, (sku, entry) in enumerate(todo, 1):
            url = entry["url"]
            _safe_print(f"\n[{i}/{len(todo)}] sku={sku}\n    {url}")
            try:
                html = session.fetch_product(url)
            except Exception as exc:  # noqa: BLE001
                print(f"    [err-fetch] {exc}")
                html = ""
            item = _parse_product(html, url) if html else None
            if not item:
                print("    [warn] sin JSON-LD válido — saltando")
                consecutive_misses += 1
                # Si hay 3 fallos seguidos, asume bloqueo: cierra, espera,
                # reabre con fingerprint nuevo.
                if consecutive_misses >= 3 and i < len(todo):
                    print(f"    [retry] rate-limit detectado, esperando {COOLDOWN:.0f}s y reabriendo Camoufox...")
                    _close()
                    time.sleep(COOLDOWN)
                    _open()
                    consecutive_misses = 0
                continue
            consecutive_misses = 0
            # Mezcla las imágenes JSON-LD con todas las de la galería del DOM
            # (la primera es la principal, las siguientes son extras del
            # carrusel). Mismo criterio que rescrape_images.py.
            gallery = _extract_gallery_images(session)
            merged = _merge_images(item.get("images") or [], gallery)
            if merged:
                item["images"] = merged
                item["image_url"] = merged[0]
            print(f"    -> {len(merged)} imágenes detectadas")
            raw[sku] = item
            _save_raw(raw)
            fetched_in_batch += 1
            time.sleep(1.0)
            # Reciclo profiláctico cada batch para evitar la baneada del
            # DataDome de la sesión.
            if fetched_in_batch >= BATCH_SIZE and i < len(todo):
                print(f"    [batch] {fetched_in_batch} fetches OK, cooldown {COOLDOWN:.0f}s + reciclar navegador...")
                _close()
                time.sleep(COOLDOWN)
                _open()
    finally:
        _close()
    return raw


# ============= Fase 2: insertar/actualizar productos ========================

def _ensure_brand(conn, name):
    name = (name or "").strip() or "GarperLux"
    slug = _slugify(name)
    cur = conn.cursor()
    row = cur.execute("SELECT id FROM brands WHERE slug = ?", (slug,)).fetchone()
    if row:
        return int(row[0])
    cur.execute(
        "INSERT INTO brands (slug, name, professional, is_official) VALUES (?, ?, 1, 0)",
        (slug, name),
    )
    conn.commit()
    return int(cur.lastrowid)


def _ensure_category(conn, slug):
    NAMES = {
        "mecanismos": "Mecanismos",
        "proteccion": "Protección eléctrica",
    }
    cur = conn.cursor()
    row = cur.execute("SELECT id FROM categories WHERE slug = ?", (slug,)).fetchone()
    if row:
        return int(row[0])
    cur.execute("INSERT INTO categories (slug, name, parent_id, description) VALUES (?, ?, NULL, ?)",
                (slug, NAMES.get(slug, slug.title()), f"Productos de {NAMES.get(slug, slug)}."))
    conn.commit()
    return int(cur.lastrowid)


def insert_products(raw: dict) -> dict:
    """Insert/update each product. Returns {sku: row_meta} for the grouping
    phase, with all attributes the variant grouper needs."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    rows_for_grouping = {}
    inserted = updated = 0

    for entry in EXTRAS:
        url = entry["url"]
        m = re.search(r"-(\d{6,})\.html", url)
        sku = m.group(1) if m else _slugify(url)[:30]
        item = raw.get(sku)
        if not item or item.get("price") is None:
            continue

        brand_id = _ensure_brand(conn, entry.get("brand") or item.get("brand") or "GarperLux")
        cat_id = _ensure_category(conn, entry["family"])
        name = item["name"]
        slug = _stable_slug(name, sku)
        price = float(item["price"])
        description = (item.get("description") or "")[:1000]

        # Imagen local con la lógica de import_to_db.
        image_path = None
        images = item.get("images") or ([item["image_url"]] if item.get("image_url") else [])
        local_paths = []
        for idx, im_url in enumerate(images):
            base = _safe_image_filename(sku, im_url)
            if idx > 0:
                stem, dot, ext = base.rpartition(".")
                base = f"{stem}_{idx}.{ext}" if dot else f"{base}_{idx}"
            dest = IMAGES_DIR / base
            if _download_image(im_url, dest):
                local_paths.append(f"/assets/img/productos/{base}")
        if local_paths:
            image_path = local_paths[0]

        # Specs: arrancamos con lo que vino de la fuente, le sobrescribimos
        # con la metadata del manifest porque es la verdad canónica.
        specs = dict(item.get("specs") or {})
        specs["Subcategoría"] = entry["subcategoria"]
        specs["Gama"] = entry["gama"]
        if entry.get("color"):
            specs["Familia de color"] = entry["color"]
            specs["_extra_color"] = entry["color"]
        if entry.get("tipo"):
            specs["Tipo de producto"] = entry["tipo"]
            specs["_extra_tipo"] = entry["tipo"]
        if entry.get("intensidad"):
            specs["Intensidad nominal (A)"] = entry["intensidad"]
            specs["_extra_intensidad"] = entry["intensidad"]
        if entry.get("modulos"):
            specs["Módulos"] = f'{entry["modulos"]} módulo{"s" if entry["modulos"] != "1" else ""}'
            specs["_extra_modulos"] = entry["modulos"]
        if entry.get("autorrearmable"):
            specs["Autorrearmable"] = "Sí"
            specs["_extra_autorrearmable"] = True
        if entry.get("alta_sensibilidad"):
            specs["Alta sensibilidad"] = "Sí"
            specs["_extra_alta_sensibilidad"] = True
        specs["_source"] = url
        if local_paths:
            specs["_images"] = local_paths

        existing = cur.execute("SELECT id FROM products WHERE sku = ?", (sku,)).fetchone()
        if existing:
            cur.execute(
                """
                UPDATE products
                SET name = ?, slug = ?, category_id = ?, brand_id = ?, price = ?,
                    description = ?, specs_json = ?, image = ?, stock = COALESCE(?, stock)
                WHERE sku = ?
                """,
                (name, slug, cat_id, brand_id, price, description,
                 json.dumps(specs, ensure_ascii=False), image_path,
                 _stable_stock(sku), sku),
            )
            updated += 1
        else:
            cur.execute(
                """
                INSERT INTO products (
                    sku, name, slug, category_id, brand_id, price, stock,
                    safety_level, pro_only, description, specs_json, image
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'basic', 0, ?, ?, ?)
                """,
                (sku, name, slug, cat_id, brand_id, price, _stable_stock(sku),
                 description, json.dumps(specs, ensure_ascii=False), image_path),
            )
            inserted += 1
        rows_for_grouping[sku] = entry
    conn.commit()
    conn.close()
    print(f"[import] insertados={inserted} actualizados={updated}")
    return rows_for_grouping


# ============= Fase 3: agrupar variantes ====================================

def _slugify_id(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "x"


def _group_signature(entry: dict) -> tuple:
    """Atributos FIJOS del producto. Misma firma => candidatos a ser variantes
    UNIDOS por el atributo que varía."""
    return (
        entry.get("brand", ""),
        entry.get("family", ""),
        entry.get("subcategoria", ""),
        entry.get("gama", ""),
    )


def _attribute_signature(entry: dict) -> dict:
    """Devuelve solo los atributos variables (sin la firma del grupo)."""
    return {
        k: entry.get(k) for k in ("color", "tipo", "intensidad", "modulos", "autorrearmable", "alta_sensibilidad")
        if entry.get(k) is not None
    }


def build_variant_groups(rows: dict):
    """Para cada (brand, family, subcategoria, gama), busca el conjunto de
    productos. Si hay más de uno, identifica los axes que varían. Si solo
    UN axis varía, usa ese como axis único; si varios varían, fija el resto
    al valor más común y solo deja UN axis variable, separando en sub-grupos
    para cada combinación fija de los demás."""
    by_sig: dict[tuple, list[tuple[str, dict]]] = {}
    for sku, entry in rows.items():
        by_sig.setdefault(_group_signature(entry), []).append((sku, entry))

    AXIS_LABELS = {
        "tipo": "Tipo",
        "color": "Color",
        "intensidad": "Intensidad",
        "modulos": "Módulos",
        "autorrearmable": "Autorrearmable",
        "alta_sensibilidad": "Sensibilidad",
    }
    AXIS_PRIORITY = ["intensidad", "tipo", "color", "modulos"]

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    groups_built = 0
    members_total = 0

    for sig, members in by_sig.items():
        if len(members) < 2:
            continue
        # Identifica qué atributos varían dentro de este grupo
        all_attr_keys = set()
        for _, e in members:
            all_attr_keys.update(_attribute_signature(e).keys())
        varying = []
        for k in all_attr_keys:
            vals = {e.get(k) for _, e in members}
            if len(vals) > 1:
                varying.append(k)
        if not varying:
            continue

        # Elegimos el axis principal: el de mayor prioridad
        chosen_axis = None
        for k in AXIS_PRIORITY:
            if k in varying:
                chosen_axis = k
                break
        if chosen_axis is None:
            chosen_axis = varying[0]

        # Para que solo UN atributo varíe en cada subgrupo, fijamos el valor
        # de los demás atributos como clave secundaria.
        sub_keys = [k for k in varying if k != chosen_axis]
        subgroups: dict[tuple, list[tuple[str, dict]]] = {}
        for sku, e in members:
            sk = tuple(e.get(k) for k in sub_keys)
            subgroups.setdefault(sk, []).append((sku, e))

        for sub_key, sub_members in subgroups.items():
            if len(sub_members) < 2:
                continue
            # ID estable del grupo: brand-gama-subcat-axis-fixedvals
            id_parts = [
                _slugify_id(sig[0]), _slugify_id(sig[3]), _slugify_id(sig[2]),
                f"by-{chosen_axis}",
            ]
            for k, v in zip(sub_keys, sub_key):
                if v is None:
                    continue
                id_parts.append(f"{_slugify_id(k)}-{_slugify_id(str(v))}")
            group_id = "-".join(id_parts)[:80]

            # Construye la lista de variantes con label y precio.
            variants_array = []
            label_for: dict[str, str] = {}
            for sku, e in sub_members:
                label_val = str(e.get(chosen_axis) if chosen_axis != "autorrearmable" and chosen_axis != "alta_sensibilidad"
                                 else ("Sí" if e.get(chosen_axis) else "No"))
                # Los autorrearmable/alta sensibilidad no son útiles solos
                # como label; los etiquetamos con su intensidad.
                if chosen_axis in ("autorrearmable", "alta_sensibilidad"):
                    label_val = e.get("intensidad", label_val)
                label_for[sku] = label_val

            # Precio: lo cogemos de DB (ya insertado).
            price_for = {}
            placeholders = ",".join(["?"] * len(sub_members))
            for r in cur.execute(
                f"SELECT sku, price FROM products WHERE sku IN ({placeholders})",
                tuple(s for s, _ in sub_members),
            ):
                price_for[r[0]] = r[1]

            for sku, _e in sub_members:
                variants_array.append({
                    "sku": sku,
                    "label": label_for[sku],
                    "price": price_for.get(sku),
                })
            # Default: el de menor precio (o el primero si todos iguales).
            default_sku = min(variants_array, key=lambda v: (v["price"] or 9999))["sku"]
            axis_label = AXIS_LABELS.get(chosen_axis, chosen_axis.capitalize())

            for sku, _e in sub_members:
                row = cur.execute("SELECT specs_json FROM products WHERE sku = ?", (sku,)).fetchone()
                if not row:
                    continue
                try:
                    specs = json.loads(row[0])
                except Exception:  # noqa: BLE001
                    specs = {}
                specs["_variant_group"] = group_id
                specs["_variant_axis"] = axis_label
                specs["_variant_default"] = default_sku
                specs["_variant_is_default"] = "1" if sku == default_sku else "0"
                specs["_variant_label"] = label_for[sku]
                specs["_variants"] = variants_array
                cur.execute("UPDATE products SET specs_json = ? WHERE sku = ?",
                            (json.dumps(specs, ensure_ascii=False), sku))
            groups_built += 1
            members_total += len(sub_members)
            _safe_print(f"  [group] {group_id}  axis={axis_label}  default={default_sku}  members={len(sub_members)}  "
                        f"({', '.join(label_for[s] for s, _ in sub_members)})")
    conn.commit()
    conn.close()
    print(f"\n[variants] grupos creados={groups_built}  miembros totales={members_total}")


# ============= Main =========================================================

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Limita el scrape a N URLs.")
    parser.add_argument("--retry-failed", action="store_true")
    parser.add_argument("--skip-scrape", action="store_true", help="Salta fase 1 (usa _extras_raw.json existente).")
    args = parser.parse_args(argv)

    if not DB_PATH.exists():
        print(f"[err] DB no existe: {DB_PATH}")
        return 1
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    if args.skip_scrape:
        raw = _load_raw()
        print(f"[scrape] saltado, usando {len(raw)} entradas de _extras_raw.json")
    else:
        raw = scrape_all(limit=args.limit, retry_failed=args.retry_failed)

    rows_meta = insert_products(raw)
    build_variant_groups(rows_meta)
    print("\n[done]")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
