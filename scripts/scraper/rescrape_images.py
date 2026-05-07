#!/usr/bin/env python3
"""
GarperLux — Re-scrape SOLO de imágenes del producto.

Itera todos los productos en DB que tienen `specs._source` (URL original
de Leroy Merlin), abre la página con Camoufox, extrae únicamente las
imágenes del JSON-LD (las imágenes curadas del producto real, no banners
ni "te puede interesar"), y las descarga a web/assets/img/productos.

Características:
- Reinicia Camoufox cada N productos para no agotar DataDome.
- Sólo escribe nuevas imágenes; no toca el SVG placeholder ni los seed.
- Idempotente: si la imagen ya existe en disco, no la descarga.
- Si JSON-LD da varias imágenes, las descarga todas como _1, _2, ...
- Si DataDome bloquea, hace un cooldown largo y reintenta con sesión nueva.

Uso:
    python rescrape_images.py                  # todos los productos
    python rescrape_images.py --limit 50       # primeros 50
    python rescrape_images.py --since 100      # saltar primeros 100
    python rescrape_images.py iluminacion      # solo una categoría
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from camoufox.sync_api import Camoufox

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent
DB_PATH = PROJECT_ROOT / "backend" / "database" / "garperlux.sqlite"
IMAGES_DIR = PROJECT_ROOT / "web" / "assets" / "img" / "productos"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
SITE = CONFIG["site"]
USER_AGENT = SITE["user_agent"]

# Reinicia el browser cada N productos
PRODUCTS_PER_SESSION = 25
# Si una página falla 0 imágenes, esperar y reintentar con sesión nueva
RETRIES_PER_PRODUCT = 1


# ---------- Helpers ---------------------------------------------------------

def _extract_jsonld_products(html: str) -> list[dict]:
    blocks: list[dict] = []
    pattern = re.compile(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        re.IGNORECASE | re.DOTALL,
    )
    for match in pattern.finditer(html):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
        except Exception:  # noqa: BLE001
            continue
        candidates = data if isinstance(data, list) else [data]
        for item in candidates:
            if not isinstance(item, dict):
                continue
            graph = item.get("@graph") or [item]
            for node in graph:
                if not isinstance(node, dict):
                    continue
                t = node.get("@type")
                if t == "Product" or (isinstance(t, list) and "Product" in t):
                    blocks.append(node)
    return blocks


def _all_images_from_jsonld(product: dict) -> list[str]:
    img = product.get("image")
    out: list[str] = []
    if isinstance(img, list):
        for item in img:
            if isinstance(item, str) and item not in out:
                out.append(item)
            elif isinstance(item, dict):
                u = item.get("url")
                if u and u not in out:
                    out.append(u)
    elif isinstance(img, str):
        out.append(img)
    elif isinstance(img, dict):
        u = img.get("url")
        if u:
            out.append(u)
    return out


def _filename_for(sku: str, image_url: str, idx: int) -> str:
    safe_sku = re.sub(r"[^a-zA-Z0-9._-]", "_", sku)
    parsed = urlparse(image_url)
    path = parsed.path.lower()
    ext = ".jpg"
    for cand in (".jpg", ".jpeg", ".png", ".webp"):
        if path.endswith(cand):
            ext = cand
            break
    return f"{safe_sku}{ext}" if idx == 0 else f"{safe_sku}_{idx}{ext}"


def _download(url: str, dest: Path) -> bool:
    try:
        r = requests.get(url, timeout=30, headers={"User-Agent": USER_AGENT})
        r.raise_for_status()
        dest.write_bytes(r.content)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"    [img-err] {url}: {exc}")
        return False


# ---------- Sesión Camoufox -------------------------------------------------

class Session:
    def __init__(self):
        self._cm = None
        self._browser = None
        self._page = None

    def __enter__(self):
        self._cm = Camoufox(headless=True, humanize=True, geoip=False, locale=["es-ES"])
        self._browser = self._cm.__enter__()
        self._page = self._browser.new_page()
        # Warmup: home para coger cookie de DataDome
        try:
            self._page.goto(SITE["homepage"], wait_until="domcontentloaded", timeout=45000)
            time.sleep(3.5)
        except Exception:  # noqa: BLE001
            pass
        return self

    def __exit__(self, *exc):
        if self._cm is not None:
            return self._cm.__exit__(*exc)

    def fetch(self, url: str) -> str:
        self._page.goto(url, wait_until="domcontentloaded", timeout=60000)
        time.sleep(2.5)
        try:
            self._page.evaluate("window.scrollBy(0, 400)")
            time.sleep(1.5)
            self._page.evaluate("window.scrollBy(0, 400)")
            time.sleep(1.5)
        except Exception:  # noqa: BLE001
            pass
        return self._page.content()

    def extract_gallery_images(self) -> list[str]:
        """Extrae solo las imágenes de la GALERÍA oficial del producto en LM.
        Los criterios son estrictos para evitar banners de marketplace y
        iconos:
          - Path debe ser /media/<digits>/ (no /mkp/ que son marketplaces)
          - Width >= 200 (los thumbs reales son 200-1080)
        Deduplica por media-id."""
        js = r"""(() => {
          const out = [];
          const seen = new Set();
          const goodId = (u) => {
            const m = u.match(/\/media\/(\d{4,})\//);
            return m ? m[1] : null;
          };
          const isProduct = (u) => {
            if (!u || typeof u !== 'string' || !u.includes('media.adeo.com')) return false;
            if (u.includes('/mkp/')) return false;
            // El filename canónico del producto en LM es "media.<ext>".
            // Los banners/logos vienen como "brand-log-...", "category-...", etc.
            if (!/\/media\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(u)) return false;
            if (!goodId(u)) return false;
            // Los thumbs reales del producto son >= 350px (sin width o con
            // width=350/1080). Banners suelen ser 100-250.
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
        try:
            urls = self._page.evaluate(js)
            return list(urls or [])
        except Exception:  # noqa: BLE001
            return []


# ---------- Pipeline --------------------------------------------------------

def _load_products(filter_slug: str | None, since: int, limit: int | None) -> list[dict]:
    conn = sqlite3.connect(DB_PATH)
    sql = """
        SELECT p.id, p.sku, p.image, p.specs_json, c.slug
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.specs_json LIKE '%_source%'
    """
    params = []
    if filter_slug:
        sql += " AND c.slug = ?"
        params.append(filter_slug)
    sql += " ORDER BY p.id"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    out = []
    for pid, sku, image, sjson, slug in rows[since:]:
        if limit is not None and len(out) >= limit:
            break
        try:
            specs = json.loads(sjson)
        except Exception:  # noqa: BLE001
            continue
        src = specs.get("_source")
        if not src or not isinstance(src, str) or not src.startswith("http"):
            continue
        out.append({"id": pid, "sku": sku, "image": image, "specs": specs, "slug": slug, "source": src})
    return out


def _update_db(product_id: int, specs: dict, main_path: str | None):
    conn = sqlite3.connect(DB_PATH)
    if main_path:
        conn.execute(
            "UPDATE products SET image=?, specs_json=? WHERE id=?",
            (main_path, json.dumps(specs, ensure_ascii=False), product_id),
        )
    else:
        conn.execute(
            "UPDATE products SET specs_json=? WHERE id=?",
            (json.dumps(specs, ensure_ascii=False), product_id),
        )
    conn.commit()
    conn.close()


def _process_product(session: Session, product: dict) -> int:
    """Devuelve número de imágenes descargadas (0 si fallo)."""
    sku = product["sku"]
    src = product["source"]
    print(f"  · {sku}  ({product['slug']})")
    print(f"    {src}")
    try:
        html = session.fetch(src)
    except Exception as exc:  # noqa: BLE001
        print(f"    [err] no se pudo cargar: {exc}")
        return 0
    products_jsonld = _extract_jsonld_products(html)
    images: list[str] = []
    if products_jsonld:
        images.extend(_all_images_from_jsonld(products_jsonld[0]))
    # Combina con imágenes del DOM (galería renderizada)
    dom_imgs = session.extract_gallery_images()
    seen_ids = set()
    out: list[str] = []
    for u in images + dom_imgs:
        m = re.search(r'/media/(\d+)/', u)
        key = m.group(1) if m else u
        if key in seen_ids:
            continue
        seen_ids.add(key)
        out.append(u)
    images = out
    if not images:
        return 0
    paths = []
    for idx, url in enumerate(images):
        filename = _filename_for(sku, url, idx)
        dest = IMAGES_DIR / filename
        if dest.exists() and dest.stat().st_size > 0:
            paths.append(f"/assets/img/productos/{filename}")
            continue
        if _download(url, dest):
            paths.append(f"/assets/img/productos/{filename}")
        time.sleep(0.15)
    if not paths:
        return 0
    print(f"    -> {len(paths)} imágenes")
    # Actualiza DB
    specs = product["specs"]
    if len(paths) > 1:
        specs["_images"] = paths
    else:
        specs.pop("_images", None)
    main_path = paths[0]
    _update_db(product["id"], specs, main_path)
    return len(paths)


def main(argv: list[str]):
    filter_slug = None
    since = 0
    limit = None
    args = list(argv)
    while args:
        a = args.pop(0)
        if a == "--limit":
            limit = int(args.pop(0))
        elif a == "--since":
            since = int(args.pop(0))
        elif a in ("-h", "--help"):
            print(__doc__)
            return 0
        else:
            filter_slug = a

    products = _load_products(filter_slug, since, limit)
    print(f"[info] productos a procesar: {len(products)}")
    if not products:
        return 0

    cooldown_between_sessions = 30.0
    request_delay = 1.5

    total_done = 0
    total_imgs = 0
    while total_done < len(products):
        batch = products[total_done:total_done + PRODUCTS_PER_SESSION]
        if not batch:
            break
        try:
            print(f"\n=== Sesión nueva (productos {total_done+1}-{total_done+len(batch)}/{len(products)}) ===")
            with Session() as session:
                for prod in batch:
                    n = _process_product(session, prod)
                    total_imgs += n
                    total_done += 1
                    time.sleep(request_delay)
        except KeyboardInterrupt:
            print("\n[abort] interrumpido")
            return 130
        except Exception as exc:  # noqa: BLE001
            print(f"[err] sesión fallida: {exc}")
        if total_done < len(products):
            print(f"[cooldown] {cooldown_between_sessions:.0f}s antes de la siguiente sesión...")
            time.sleep(cooldown_between_sessions)

    print(f"\n[done] productos procesados: {total_done} | imágenes descargadas: {total_imgs}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
