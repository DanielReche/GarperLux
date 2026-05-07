#!/usr/bin/env python3
"""
GarperLux — Scraper de URLs sueltas (Tegui multi-fuente).

Lee `tegui_urls.json`, donde cada entrada tiene una URL y la taxonomía decidida
por el usuario (Familia, Subcategoría, Gama, Especialidad, Cableado). Por cada
URL se elige el extractor según el dominio:

  - tegui-distel.com           → Shopify, endpoint <handle>.json
  - leroymerlin.es             → JSON-LD vía Camoufox (anti DataDome)
  - domoelectra.com            → PrestaShop, parseo de meta og:* + JSON-LD

Salida: `output/<category_slug>.json`. Si el archivo ya existe (porque venía
del scraper original de Leroy Merlin) hace MERGE por SKU sin duplicar.

Uso:
    python scrape_urls.py
    python scrape_urls.py tegui_urls.json
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

import requests

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


# ---------- Helpers ---------------------------------------------------------

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


_HTML_ENTITIES = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&#39;": "'", "&aacute;": "á", "&eacute;": "é",
    "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú", "&ntilde;": "ñ",
    "&Aacute;": "Á", "&Eacute;": "É", "&Iacute;": "Í", "&Oacute;": "Ó",
    "&Uacute;": "Ú", "&Ntilde;": "Ñ", "&iexcl;": "¡", "&iquest;": "¿",
    "&deg;": "°", "&middot;": "·", "&laquo;": "«", "&raquo;": "»",
    "&ordm;": "º", "&ordf;": "ª", "&trade;": "™", "&reg;": "®", "&copy;": "©",
}


def _strip_html(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    text = re.sub(r"</p>", "\n", text, flags=re.I)
    text = re.sub(r"</li>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    for entity, replacement in _HTML_ENTITIES.items():
        text = text.replace(entity, replacement)
    text = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


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


def _meta_content(html: str, prop: str) -> str | None:
    m = re.search(
        rf'<meta[^>]+property=["\']{re.escape(prop)}["\'][^>]+content=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    )
    if m:
        return m.group(1)
    m = re.search(
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']{re.escape(prop)}["\']',
        html,
        re.IGNORECASE,
    )
    return m.group(1) if m else None


def _normalize_price(value) -> float | None:
    if value is None:
        return None
    s = str(value).strip().replace("\xa0", " ")
    s = s.replace("€", "").replace("EUR", "").strip()
    # Si tiene coma decimal (estilo es-ES) y punto miles, normaliza
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return round(float(s), 2)
    except ValueError:
        return None


# ---------- Tegui Distel (Shopify) ------------------------------------------

def _shopify_product_endpoint(url: str) -> str:
    p = urlparse(url)
    # /products/<handle>?variant=...  →  /products/<handle>.json
    path = p.path
    if not path.endswith(".json"):
        path = re.sub(r"\.html?$", "", path)
        path = path.rstrip("/") + ".json"
    return urlunparse((p.scheme, p.netloc, path, "", "", ""))


def _scrape_shopify(url: str, taxonomy: dict) -> dict | None:
    endpoint = _shopify_product_endpoint(url)
    print(f"  [shopify] {endpoint}")
    r = requests.get(endpoint, timeout=25, headers={"User-Agent": UA})
    r.raise_for_status()
    payload = r.json().get("product") or {}
    if not payload:
        return None
    title = (payload.get("title") or "").strip()
    if not title:
        return None
    body_html = payload.get("body_html") or ""
    description = _strip_html(body_html)[:1500]
    vendor = (payload.get("vendor") or "Tegui").strip() or "Tegui"
    images = []
    for img in payload.get("images", []) or []:
        src = img.get("src") if isinstance(img, dict) else None
        if src and src not in images:
            images.append(src)
    # Variante específica (?variant=ID) o primera variante
    variant_id = None
    qs = urlparse(url).query
    m = re.search(r"variant=(\d+)", qs)
    if m:
        variant_id = m.group(1)
    variants = payload.get("variants") or []
    chosen = None
    for v in variants:
        if variant_id and str(v.get("id")) == variant_id:
            chosen = v
            break
    if chosen is None and variants:
        chosen = variants[0]
    if chosen is None:
        return None
    raw_sku = (chosen.get("sku") or "").strip()
    # Algunos vendedores rellenan variant.sku con texto descriptivo en vez de
    # una referencia. Si pasa, usa la referencia interna (variant id) prefijada
    # con tg- para que sea identificable y único.
    if not raw_sku or " " in raw_sku or len(raw_sku) > 25:
        raw_sku = f"tg-{chosen.get('id')}"
    sku = raw_sku
    price = _normalize_price(chosen.get("price"))
    if price is None:
        return None
    barcode = (chosen.get("barcode") or "").strip()
    product_type = (payload.get("product_type") or "").strip()

    specs: dict[str, str] = {}
    # Inferimos algunos specs textuales del propio body_html
    text_clean = description
    if barcode:
        specs["EAN"] = barcode
    if product_type:
        specs["Tipo de producto"] = product_type
    # Rellenamos con la taxonomía aportada por el usuario
    for k, v in (taxonomy or {}).items():
        if v:
            specs[k] = v
    specs["Marca"] = vendor

    return {
        "sku": str(sku)[:60],
        "name": title,
        "slug": _slugify(title),
        "brand": vendor,
        "price": price,
        "image_url": images[0] if images else None,
        "images": images[:8],
        "description": text_clean or None,
        "specs": specs,
        "source_url": url,
    }


# ---------- Leroy Merlin (Camoufox + JSON-LD) ------------------------------

_LM_SESSION = None


def _get_lm_session():
    """Lazy-init Camoufox para evitar pagar el coste si no hay URLs LM."""
    global _LM_SESSION
    if _LM_SESSION is not None:
        return _LM_SESSION
    try:
        from camoufox.sync_api import Camoufox  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "Camoufox no instalado. Ejecuta `pip install -r requirements.txt`"
            " y `python -m camoufox fetch`."
        ) from exc

    cm = Camoufox(headless=True, humanize=True, geoip=False, locale=["es-ES"])
    browser = cm.__enter__()
    page = browser.new_page()
    # Warmup en home de LM para coger cookies de DataDome
    try:
        page.goto("https://www.leroymerlin.es/", wait_until="domcontentloaded", timeout=45000)
        time.sleep(3.0)
    except Exception:  # noqa: BLE001
        pass
    _LM_SESSION = {"cm": cm, "browser": browser, "page": page}
    return _LM_SESSION


def _close_lm_session():
    global _LM_SESSION
    if _LM_SESSION is None:
        return
    try:
        _LM_SESSION["cm"].__exit__(None, None, None)
    except Exception:  # noqa: BLE001
        pass
    _LM_SESSION = None


def _scrape_leroy(url: str, taxonomy: dict) -> dict | None:
    print(f"  [leroy]   {url}")
    sess = _get_lm_session()
    page = sess["page"]
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    time.sleep(1.5)
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(1.0)
    html = page.content()
    products = _extract_jsonld_products(html)
    if not products:
        return None
    p = products[0]
    title = (p.get("name") or "").strip()
    if not title:
        return None
    sku = (p.get("sku") or p.get("mpn") or "").strip()
    if not sku:
        m = re.search(r"-(\d{6,})\.html", url)
        sku = m.group(1) if m else _slugify(title)[:30]
    description = (p.get("description") or "").strip()
    brand = ""
    b = p.get("brand")
    if isinstance(b, dict):
        brand = (b.get("name") or "").strip()
    elif isinstance(b, str):
        brand = b.strip()
    brand = brand or "Tegui"
    # Imagen JSON-LD
    images: list[str] = []
    img = p.get("image")
    if isinstance(img, list):
        for x in img:
            if isinstance(x, str) and x not in images:
                images.append(x)
    elif isinstance(img, str):
        images.append(img)
    elif isinstance(img, dict):
        u = img.get("url")
        if u:
            images.append(u)
    # Precio
    price = None
    offers = p.get("offers")
    if isinstance(offers, dict):
        price = _normalize_price(offers.get("price") or offers.get("lowPrice"))
    elif isinstance(offers, list) and offers:
        for off in offers:
            if isinstance(off, dict):
                price = _normalize_price(off.get("price") or off.get("lowPrice"))
                if price:
                    break
    if price is None:
        return None

    # Specs de la tabla "Características técnicas"
    specs: dict[str, str] = {}
    for match in re.finditer(
        r"<tr[^>]*>\s*<t[hd][^>]*>(.*?)</t[hd]>\s*<t[hd][^>]*>(.*?)</t[hd]>\s*</tr>",
        html, re.IGNORECASE | re.DOTALL,
    ):
        k = _strip_html(match.group(1))[:80]
        v = _strip_html(match.group(2))[:200]
        if k and v and k.lower() not in {"referencia", "ean", "código", "codigo"}:
            specs.setdefault(k, v)
    gtin = (p.get("gtin") or "").strip()
    if gtin:
        specs["EAN"] = gtin
    for k, v in (taxonomy or {}).items():
        if v:
            specs[k] = v
    specs["Marca"] = brand

    return {
        "sku": str(sku)[:60],
        "name": title,
        "slug": _slugify(title),
        "brand": brand,
        "price": price,
        "image_url": images[0] if images else None,
        "images": images[:8],
        "description": description[:1500] if description else None,
        "specs": specs,
        "source_url": url,
    }


_ATTRIBUTE_QUESTION_RE = re.compile(
    # detecta "[A-Z palabras] ?" seguido de su respuesta hasta el siguiente
    # signo o final de cadena. Ejemplo: "ALGÚN MANDO EXTRA A LOS DEL KIT? Sin Mando Adicional"
    r"\s+[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 ]{4,}\?.*$"
)


def _strip_attribute_questions(title: str) -> str:
    """Quita el fragmento de preguntas-respuesta de atributos que algunos
    PrestaShop concatenan al título cuando el producto tiene combinaciones."""
    if not title:
        return title
    cleaned = _ATTRIBUTE_QUESTION_RE.sub("", title).strip(" -·,")
    return cleaned or title


def _isolate_product_gallery(html: str) -> str:
    """Devuelve solo el HTML de la galería principal del producto, recortando
    'productos relacionados' y otras secciones para que la extracción de
    imágenes no mezcle productos que comparten layout."""
    # PrestaShop estándar
    for cls in ("images-container", "product-cover", "product-images", "product-gallery"):
        # Busca el primer <div class="...{cls}..."> y captura su contenido
        # equilibrando un nesting básico (suficiente para PrestaShop typical).
        m = re.search(
            rf'<div[^>]*class="[^"]*\b{cls}\b[^"]*"[^>]*>',
            html, re.IGNORECASE,
        )
        if not m:
            continue
        start = m.end()
        # Busca el cierre balanceado (heurístico: hasta el siguiente
        # <section o <div con class de bloque relacionado).
        end_match = re.search(
            r'</section>|<section[^>]*class="[^"]*(featured|crossselling|related)',
            html[start:], re.IGNORECASE,
        )
        end = start + (end_match.start() if end_match else 4000)
        return html[m.start():end]
    # Fallback: solo og:image (sin más DOM scrap)
    return ""


# ---------- PrestaShop genérico (DomoElectra, WebDosB, etc.) ----------------

def _scrape_prestashop(url: str, taxonomy: dict, brand_default: str) -> dict | None:
    print(f"  [presta]  {url}")
    # PrestaShop ignora el fragmento (#/...) que algunas tiendas usan para
    # opciones; el server-side responde igual sin él. Lo quitamos para
    # mantener la URL canónica.
    parsed = urlparse(url)
    fetch_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, parsed.query, ""))
    r = requests.get(fetch_url, timeout=25, headers={"User-Agent": UA})
    r.raise_for_status()
    html = r.text

    # 1) Intentar JSON-LD Product (a veces lo tiene además del breadcrumb)
    products = _extract_jsonld_products(html)
    title = price = description = sku = None
    images: list[str] = []
    if products:
        p = products[0]
        title = (p.get("name") or "").strip() or None
        description = (p.get("description") or "").strip() or None
        sku = (p.get("sku") or "").strip() or None
        offers = p.get("offers") or {}
        if isinstance(offers, dict):
            price = _normalize_price(offers.get("price") or offers.get("lowPrice"))
        img = p.get("image")
        if isinstance(img, list):
            for x in img:
                if isinstance(x, str):
                    images.append(x)
        elif isinstance(img, str):
            images.append(img)

    # 2) Título: prioriza el <h1> sobre og:title. Algunos PrestaShop (webdosb)
    # añaden las preguntas de "atributos para personalizar" al og:title cuando
    # el producto tiene combinaciones, ej:
    #   "Kit X ALGÚN MANDO EXTRA? Sin Mando NECESITA CREMALLERA? SIN..."
    # El <h1> en cambio mantiene el nombre canónico del producto.
    if not title:
        m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.IGNORECASE | re.DOTALL)
        if m:
            title = _strip_html(m.group(1)) or None
    if not title:
        title = _meta_content(html, "og:title")
        if title:
            title = re.sub(r"\s+", " ", title).strip()
    if title:
        title = _strip_attribute_questions(title)
    if not price:
        price = _normalize_price(_meta_content(html, "product:price:amount"))
    if not images:
        # Restringimos la extracción al contenedor de la galería del producto
        # (.images-container / .product-cover) para no recoger imágenes de
        # bloques "Productos relacionados" o "También compraron".
        gallery_html = _isolate_product_gallery(html)
        og_img = _meta_content(html, "og:image")
        if og_img:
            # algunos themes (webdosb) sirven el og:image en thickbox; subimos
            # a large_default cuando podamos para tener una imagen más grande.
            og_img_large = re.sub(r"-thickbox_default", "-large_default", og_img)
            images.append(og_img_large)
        for m in re.finditer(
            r'(?:src|data-src|data-image-large-src|content)="([^"]+-(?:large|home)_default[^"]+\.(?:jpg|jpeg|png|webp))"',
            gallery_html or "",
            re.I,
        ):
            u = m.group(1)
            if u.startswith("//"):
                u = "https:" + u
            elif u.startswith("/"):
                u = urljoin(url, u)
            if u not in images:
                images.append(u)
    # Descripción si no la dio JSON-LD
    if not description:
        m = re.search(
            r'<div[^>]+id=["\']description["\'][^>]*>(.*?)</div>',
            html, re.IGNORECASE | re.DOTALL,
        )
        if not m:
            m = re.search(
                r'<div[^>]+class=["\'][^"\']*product-description[^"\']*["\'][^>]*>(.*?)</div>',
                html, re.IGNORECASE | re.DOTALL,
            )
        if m:
            description = _strip_html(m.group(1))[:1500]

    # SKU: prioriza [itemprop="sku"] (PrestaShop lo expone aquí en webdosb),
    # luego cae a referencia visual y al final al ID interno de la URL.
    if not sku:
        for pattern in (
            r'<[^>]*itemprop=["\']sku["\'][^>]*>([^<]+)</',
            r'<[^>]*data-product-sku=["\']([^"\']+)["\']',
            r'class=["\']product-reference[^"\']*["\'][^>]*>\s*[^<]*<span[^>]*>([^<]+)</span>',
        ):
            m = re.search(pattern, html, re.IGNORECASE)
            if m:
                cand = m.group(1).strip()
                if cand and cand.lower() not in {"referencia", "ref"}:
                    sku = cand
                    break
    if not sku:
        # último recurso: ID PrestaShop de la URL.
        m = re.search(r"/(\d{2,})-", url)
        sku = m.group(1) if m else _slugify(title or "ps")[:30]

    if not title or price is None:
        return None

    # Tabla de Datos técnicos / Más información (PrestaShop)
    specs: dict[str, str] = {}
    for match in re.finditer(
        r"<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>",
        html, re.IGNORECASE | re.DOTALL,
    ):
        k = _strip_html(match.group(1))[:80]
        v = _strip_html(match.group(2))[:200]
        if k and v and k.lower() not in {"referencia", "ean", "código", "codigo"}:
            specs.setdefault(k, v)
    for k, v in (taxonomy or {}).items():
        if v:
            specs[k] = v
    specs.setdefault("Marca", brand_default)

    return {
        "sku": str(sku)[:60],
        "name": title,
        "slug": _slugify(title),
        "brand": brand_default,
        "price": price,
        "image_url": images[0] if images else None,
        "images": images[:8],
        "description": description,
        "specs": specs,
        "source_url": url,
    }


# ---------- serviciotecnicofermax.com (Jimdo, sin JSON-LD) -----------------

def _scrape_serviciotecnicofermax(url: str, taxonomy: dict) -> dict | None:
    print(f"  [stf]     {url}")
    parsed = urlparse(url)
    fetch_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, parsed.query, ""))
    r = requests.get(fetch_url, timeout=25, headers={"User-Agent": UA})
    r.raise_for_status()
    html = r.text

    title = _meta_content(html, "og:title") or ""
    title = _clean_text(title or "")
    if not title:
        m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.IGNORECASE | re.DOTALL)
        title = _strip_html(m.group(1)) if m else ""
    description = _meta_content(html, "og:description")
    if description:
        description = _clean_text(description)
    image = _meta_content(html, "og:image")
    images = [image] if image else []

    # SKU = primeros dígitos del path: /94211-kit-...
    m = re.search(r"/(\d{4,})-", parsed.path)
    sku = m.group(1) if m else _slugify(title)[:30]

    # Precio: buscar el primer "X,XX €" en el body
    price = None
    for cand in re.findall(r"(\d{1,4}(?:[.\s]\d{3})*,\d{2})\s*€", html):
        price = _normalize_price(cand)
        if price and price > 5:  # filtra falsos positivos como "0,00 €"
            break

    if not title or price is None:
        return None

    specs: dict[str, str] = {}
    for k, v in (taxonomy or {}).items():
        if v:
            specs[k] = v
    specs.setdefault("Marca", "Fermax")

    return {
        "sku": str(sku)[:60],
        "name": title,
        "slug": _slugify(title),
        "brand": "Fermax",
        "price": price,
        "image_url": images[0] if images else None,
        "images": images[:4],
        "description": description,
        "specs": specs,
        "source_url": url,
    }


def _clean_text(value: str) -> str:
    if not value:
        return ""
    text = value
    for entity, replacement in _HTML_ENTITIES.items():
        text = text.replace(entity, replacement)
    text = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ---------- Dispatcher ------------------------------------------------------

def _scrape_one(entry: dict) -> dict | None:
    url = entry["url"]
    taxonomy = entry.get("taxonomy") or {}
    brand_hint = entry.get("brand")  # opcional: forzar marca si la web no la da
    host = urlparse(url).netloc.lower()
    item: dict | None = None
    try:
        if "tegui-distel.com" in host:
            item = _scrape_shopify(url, taxonomy)
        elif "leroymerlin.es" in host:
            item = _scrape_leroy(url, taxonomy)
        elif "domoelectra.com" in host:
            item = _scrape_prestashop(url, taxonomy, brand_hint or "Tegui")
        elif "webdosb.com" in host:
            item = _scrape_prestashop(url, taxonomy, brand_hint or "GarperLux")
        elif "serviciotecnicofermax.com" in host:
            item = _scrape_serviciotecnicofermax(url, taxonomy)
        else:
            print(f"  [skip] dominio no soportado: {host}")
            return None
    except Exception as exc:  # noqa: BLE001
        print(f"  [err] {url}: {exc}")
        return None
    if item is None:
        return None
    # Anota el grupo y eje de variantes; los siblings se completan después en
    # _attach_variant_siblings cuando ya tenemos todos los productos scrapeados.
    if entry.get("variant_group"):
        item["specs"]["_variant_group"] = entry["variant_group"]
        if entry.get("variant_axis"):
            item["specs"]["_variant_axis"] = entry["variant_axis"]
        if entry.get("variant_label"):
            item["specs"]["_variant_label"] = entry["variant_label"]
    return item


def _attach_variant_siblings(items: list[dict]) -> None:
    """Para cada grupo de variantes, calcula:
       - _variant_default: SKU del producto por defecto (precio mínimo del grupo)
       - _variants: lista [{sku, label, price, image}] de TODOS los hermanos
       y lo escribe en specs de cada miembro del grupo.
    """
    groups: dict[str, list[dict]] = {}
    for it in items:
        gid = it["specs"].get("_variant_group")
        if not gid:
            continue
        groups.setdefault(gid, []).append(it)
    for gid, members in groups.items():
        members.sort(key=lambda x: float(x.get("price") or 0))
        default_sku = members[0]["sku"]
        siblings = []
        for m in members:
            siblings.append({
                "sku": m["sku"],
                "label": m["specs"].get("_variant_label") or m["specs"].get(
                    m["specs"].get("_variant_axis") or "Especialidad"
                ) or m["name"],
                "price": m["price"],
                "image": m.get("image_url") or (m.get("images") or [None])[0],
            })
        for m in members:
            m["specs"]["_variant_default"] = default_sku
            m["specs"]["_variants"] = siblings
            # Por consistencia con el front: marca explícita de "soy default".
            m["specs"]["_variant_is_default"] = "1" if m["sku"] == default_sku else "0"


def main(argv: list[str]):
    config_path = ROOT / (argv[0] if argv else "tegui_urls.json")
    if not config_path.exists():
        print(f"[err] no existe {config_path}")
        return 1
    config = json.loads(config_path.read_text(encoding="utf-8"))
    items = config.get("items") or []
    cat_slug = config.get("category_slug") or "porteros-videoporteros"
    print(f"[info] {len(items)} URLs en cola | categoría destino: {cat_slug}")

    out_path = OUTPUT_DIR / f"{cat_slug}.json"
    existing: list[dict] = []
    if out_path.exists():
        try:
            existing = json.loads(out_path.read_text(encoding="utf-8")) or []
        except Exception:  # noqa: BLE001
            existing = []
    by_sku = {p.get("sku"): p for p in existing if p.get("sku")}

    seen_in_run: set[str] = set()
    new_count = 0
    upd_count = 0
    for i, entry in enumerate(items, 1):
        url = entry["url"]
        if url in seen_in_run:
            print(f"\n[{i}/{len(items)}] (duplicada) {url}")
            continue
        seen_in_run.add(url)
        print(f"\n[{i}/{len(items)}] {url}")
        item = _scrape_one(entry)
        if not item:
            print("  -> sin datos extraídos")
            continue
        sku = item["sku"]
        if sku in by_sku:
            by_sku[sku] = item
            upd_count += 1
        else:
            by_sku[sku] = item
            new_count += 1
        print(f"  + {item['brand']} | {item['name'][:60]} | {item['price']}€  ({len(item.get('images') or [])} img)")
        time.sleep(0.8)

    _close_lm_session()

    merged = list(by_sku.values())
    _attach_variant_siblings(merged)
    out_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"\n[done] guardado {len(merged)} productos en {out_path.name} "
        f"(nuevos={new_count}, actualizados={upd_count})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
