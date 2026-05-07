#!/usr/bin/env python3
"""
GarperLux — Scraper de Leroy Merlin España (Camoufox direct).

Usa Camoufox (Firefox modificado anti-bot) con un warmup en la home para
obtener cookies de DataDome y a continuación recorre las URLs de listado
definidas en config.json. Por cada categoría:

  1. Carga la página de listado y hace scroll para forzar lazy-load.
  2. Extrae enlaces a fichas de producto con el patrón
     /productos/<slug>-<NNNNNNNN>.html.
  3. Para cada producto, abre la ficha y parsea:
       - JSON-LD schema.org/Product (name, brand, image, sku, offers.price)
       - Tabla de "Características técnicas" para specs.

Salida: scripts/scraper/output/<slug>.json — uno por categoría.

Uso:
    python -m pip install -r requirements.txt
    python -m camoufox fetch
    python scrape_leroy.py
    python scrape_leroy.py iluminacion mecanismos
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

from camoufox.sync_api import Camoufox

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
SITE = CONFIG["site"]


# ---------- Helpers ----------------------------------------------------------

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


def _normalize_price(offers) -> float | None:
    if not offers:
        return None
    if isinstance(offers, list):
        for offer in offers:
            price = _normalize_price(offer)
            if price:
                return price
        return None
    if isinstance(offers, dict):
        price = offers.get("price") or offers.get("lowPrice")
        if price is None:
            return None
        try:
            return float(str(price).replace(",", "."))
        except ValueError:
            return None
    return None


def _normalize_brand(brand) -> str | None:
    if not brand:
        return None
    if isinstance(brand, dict):
        return (brand.get("name") or "").strip() or None
    if isinstance(brand, str):
        return brand.strip() or None
    if isinstance(brand, list):
        for b in brand:
            value = _normalize_brand(b)
            if value:
                return value
    return None


SPEC_LABEL_BLACKLIST = {"referencia", "ean", "código", "codigo"}


_HTML_ENTITIES = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&#39;": "'", "&aacute;": "á", "&eacute;": "é",
    "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú", "&ntilde;": "ñ",
    "&Aacute;": "Á", "&Eacute;": "É", "&Iacute;": "Í", "&Oacute;": "Ó",
    "&Uacute;": "Ú", "&Ntilde;": "Ñ", "&iexcl;": "¡", "&iquest;": "¿",
    "&deg;": "°", "&middot;": "·", "&laquo;": "«", "&raquo;": "»",
    "&ordm;": "º", "&ordf;": "ª", "&trade;": "™", "&reg;": "®", "&copy;": "©",
}


def _clean_text(value: str) -> str:
    if not value:
        return ""
    text = value
    for entity, replacement in _HTML_ENTITIES.items():
        text = text.replace(entity, replacement)
    text = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), text)
    text = re.sub(r"\s+", " ", text).strip()
    text = text.strip(" |·,;")
    return text


def _extract_specs_table(html: str) -> dict[str, str]:
    specs: dict[str, str] = {}
    row_pattern = re.compile(
        r"<tr[^>]*>\s*<t[hd][^>]*>(.*?)</t[hd]>\s*<t[hd][^>]*>(.*?)</t[hd]>\s*</tr>",
        re.IGNORECASE | re.DOTALL,
    )
    for match in row_pattern.finditer(html):
        key = _clean_text(re.sub(r"<[^>]+>", " ", match.group(1)))
        val = _clean_text(re.sub(r"<[^>]+>", " ", match.group(2)))
        if not key or not val:
            continue
        if len(key) > 80 or len(val) > 200:
            continue
        if key.lower() in SPEC_LABEL_BLACKLIST:
            continue
        specs[key] = val
    # Definition lists also used by LM (<dt>/<dd>)
    dl_pattern = re.compile(
        r"<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>",
        re.IGNORECASE | re.DOTALL,
    )
    for match in dl_pattern.finditer(html):
        key = _clean_text(re.sub(r"<[^>]+>", " ", match.group(1)))
        val = _clean_text(re.sub(r"<[^>]+>", " ", match.group(2)))
        if not key or not val:
            continue
        if len(key) > 80 or len(val) > 200:
            continue
        if key.lower() in SPEC_LABEL_BLACKLIST:
            continue
        specs.setdefault(key, val)
    return specs


def _extract_product_links(html: str, base_url: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for match in re.finditer(r'href="(/productos/[a-z0-9_-]+-\d{6,}\.html)"', html, re.IGNORECASE):
        href = urljoin(base_url, match.group(1))
        if href in seen:
            continue
        seen.add(href)
        out.append(href)
    return out


def _next_page_url(current_url: str, page: int) -> str:
    parsed = urlparse(current_url)
    sep = "&" if parsed.query else "?"
    return f"{current_url}{sep}page={page}"


def _name_passes_filter(name: str, keywords: list[str] | None) -> bool:
    if not keywords:
        return True
    n = (name or "").lower()
    return any(k.lower() in n for k in keywords)


# ---------- Camoufox session ------------------------------------------------

class Session:
    def __init__(self):
        self._cm = None
        self._browser = None
        self._page = None

    def __enter__(self):
        self._cm = Camoufox(headless=True, humanize=True, geoip=False, locale=["es-ES"])
        self._browser = self._cm.__enter__()
        self._page = self._browser.new_page()
        if SITE.get("warmup_homepage", True):
            self.warmup()
        return self

    def __exit__(self, *exc):
        if self._cm is not None:
            return self._cm.__exit__(*exc)

    def warmup(self):
        print(f"[warmup] {SITE['homepage']}")
        self._page.goto(SITE["homepage"], wait_until="domcontentloaded", timeout=45000)
        time.sleep(3.0)
        # leve scroll para parecer humano
        try:
            self._page.evaluate("window.scrollBy(0, 400)")
            time.sleep(1.5)
            self._page.evaluate("window.scrollBy(0, 600)")
            time.sleep(1.5)
        except Exception:  # noqa: BLE001
            pass

    def fetch_listing(self, url: str) -> str:
        self._page.goto(url, wait_until="domcontentloaded", timeout=60000)
        time.sleep(2.5)
        # scroll to trigger lazy load
        for _ in range(3):
            self._page.evaluate("window.scrollBy(0, document.body.scrollHeight/3)")
            time.sleep(1.0)
        return self._page.content()

    def fetch_product(self, url: str) -> str:
        self._page.goto(url, wait_until="domcontentloaded", timeout=60000)
        time.sleep(1.5)
        # scroll to load specs table (often below the fold)
        self._page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1.2)
        return self._page.content()


# ---------- Per-product extraction ------------------------------------------

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


def _all_images_from_html(html: str) -> list[str]:
    """Reservada — antes scrapeaba todo media.adeo.com en la página, pero
    eso traía imágenes de banners "Te puede interesar" y carruseles
    promocionales (cortacéspedes, herramientas, etc.). Ahora solo confiamos
    en JSON-LD (curado por Leroy Merlin) que da imágenes del producto real.
    """
    return []


def _parse_product(html: str, url: str) -> dict | None:
    products = _extract_jsonld_products(html)
    if not products:
        return None
    product = products[0]
    name = (product.get("name") or "").strip()
    if not name:
        return None
    sku = (product.get("sku") or product.get("mpn") or "").strip()
    if not sku:
        # fallback: extract numeric id from URL slug
        m = re.search(r"-(\d{6,})\.html", url)
        sku = m.group(1) if m else _slugify(name)[:30]
    images = _all_images_from_jsonld(product) + [u for u in _all_images_from_html(html) if u not in _all_images_from_jsonld(product)]
    # deduplica preservando orden
    seen = set()
    images = [u for u in images if not (u in seen or seen.add(u))]
    image = images[0] if images else None
    description = (product.get("description") or "").strip()
    brand = _normalize_brand(product.get("brand")) or "GarperLux"
    price = _normalize_price(product.get("offers"))
    specs = _extract_specs_table(html)
    return {
        "sku": str(sku)[:60],
        "name": name,
        "slug": _slugify(name),
        "brand": brand,
        "price": price,
        "image_url": image,
        "images": images[:6],
        "description": description[:1000] if description else None,
        "specs": specs,
        "source_url": url,
    }


# ---------- Loop principal --------------------------------------------------

def _scrape_category(session: Session, category: dict) -> list[dict]:
    print(f"\n=== Categoría: {category['name']} (max={category['max_products']}) ===")
    target = int(category["max_products"])
    keywords = category.get("name_filter_keywords")
    products: list[dict] = []
    seen: set[str] = set()
    retries = int(SITE.get("blocked_listing_retries", 1))
    backoff = float(SITE.get("blocked_listing_backoff_seconds", 60))
    for url in category["urls"]:
        if len(products) >= target:
            break
        for page_n in range(1, int(SITE["max_pages_per_category"]) + 1):
            if len(products) >= target:
                break
            page_url = url if page_n == 1 else _next_page_url(url, page_n)
            print(f"\n[listado p{page_n}] {page_url}")
            links: list[str] = []
            for attempt in range(retries + 1):
                try:
                    html = session.fetch_listing(page_url)
                    links = _extract_product_links(html, SITE["base_url"])
                except Exception as exc:  # noqa: BLE001
                    print(f"  [err] {exc}")
                    links = []
                if links:
                    break
                if attempt < retries:
                    print(f"  [retry] 0 enlaces, esperando {backoff:.0f}s y reintentando warmup...")
                    time.sleep(backoff)
                    try:
                        session.warmup()
                    except Exception:  # noqa: BLE001
                        pass
            print(f"  {len(links)} enlaces detectados")
            if not links:
                break
            for link in links:
                if len(products) >= target:
                    break
                if link in seen:
                    continue
                seen.add(link)
                try:
                    phtml = session.fetch_product(link)
                    item = _parse_product(phtml, link)
                except Exception as exc:  # noqa: BLE001
                    print(f"  [err] {link}: {exc}")
                    continue
                if not item:
                    continue
                if not _name_passes_filter(item["name"], keywords):
                    continue
                if item.get("price") is None:
                    continue
                products.append(item)
                print(f"  + {item['brand']} | {item['name'][:60]} | {item['price']}€  ({len(item.get('images') or [])} img)")
                time.sleep(float(SITE["request_delay_seconds"]))
            time.sleep(float(SITE["page_delay_seconds"]))
    return products


def _save(slug: str, products: list[dict]) -> Path:
    out_path = OUTPUT_DIR / f"{slug}.json"
    out_path.write_text(
        json.dumps(products, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"  -> guardado {len(products)} productos en {out_path.name}")
    return out_path


def main(argv: list[str]):
    requested: Iterable[dict]
    if argv:
        wanted = {arg.lower() for arg in argv}
        requested = [c for c in CONFIG["categories"] if c["slug"] in wanted]
        if not requested:
            print(f"[err] ninguna de estas categorías existe en config.json: {argv}")
            return 1
    else:
        requested = CONFIG["categories"]

    restart_per_cat = bool(SITE.get("restart_browser_per_category", False))
    cooldown = float(SITE.get("cooldown_seconds_between_categories", 30))

    requested_list = list(requested)
    if restart_per_cat:
        # Una sesión Camoufox completamente nueva por categoría → fingerprint nuevo,
        # cookies vírgenes. Esquiva mejor el rate-limit de DataDome.
        for idx, category in enumerate(requested_list):
            if idx > 0:
                print(f"\n[cooldown] esperando {cooldown:.0f}s antes de la siguiente categoría…")
                time.sleep(cooldown)
            try:
                with Session() as session:
                    products = _scrape_category(session, category)
            except KeyboardInterrupt:
                print("\n[abort] interrumpido por el usuario")
                return 130
            except Exception as exc:  # noqa: BLE001
                print(f"[err] fallo en categoría {category['slug']}: {exc}")
                continue
            _save(category["slug"], products)
    else:
        with Session() as session:
            for category in requested_list:
                try:
                    products = _scrape_category(session, category)
                except KeyboardInterrupt:
                    print("\n[abort] interrumpido por el usuario")
                    return 130
                except Exception as exc:  # noqa: BLE001
                    print(f"[err] fallo en categoría {category['slug']}: {exc}")
                    continue
                _save(category["slug"], products)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
