#!/usr/bin/env python3
"""
GarperLux — Extrae enlaces a documentos oficiales (PDFs) de las páginas
fuente (source_url) de cada producto, sin descargar los archivos.

Lee `_source` de cada producto en la DB SQLite y, según el host, aplica un
extractor específico:

  - www.webdosb.com  -> PrestaShop. La página embebe `data-product=` con un
    JSON que incluye `attachments[]` con `id_attachment`, `file_name`,
    `name`, `mime`, `file_size_formatted`. La URL pública es
    `https://www.webdosb.com/index.php?controller=attachment&id_attachment=<id>`.

  - tegui-distel.com -> Shopify. La ficha del producto NO enlaza PDFs, pero
    `https://tegui-distel.com/pages/manuales-tecnicos-y-documentacion` lista
    todos los manuales en cdn.shopify.com. Hacemos una única descarga del
    índice y luego emparejamos los manuales relevantes a cada producto por
    coincidencia de SKU/keywords del nombre.

  - www.leroymerlin.es -> protegido por DataDome / Akamai. Usamos Camoufox
    (Firefox modificado anti-bot) si está disponible. Las fichas técnicas
    suelen venir como `<a href="https://media.adeo.com/media/<id>/media.pdf">`
    con texto "Manual de instrucciones y reparabilidad".

  - www.domoelectra.com / www.serviciotecnicofermax.com -> sus fichas no
    publican PDFs; el script no escribe nada para esos productos.

Salida: scripts/scraper/output/_product_documents.json — diccionario keyed
por SKU con {documents: [{type, label, url, size, mime, source_host}, ...]}.

Uso:
    python scrape_documents.py                       # todos los hosts soportados
    python scrape_documents.py --hosts webdosb,tegui-distel
    python scrape_documents.py --hosts leroymerlin   # requiere Camoufox
    python scrape_documents.py --limit 5             # primeros 5 productos
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import time
from html import unescape
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

try:
    import requests
except ImportError:
    print("[err] falta requests. Instálalo: pip install requests")
    sys.exit(1)


ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent
DB_PATH = PROJECT_ROOT / "backend" / "database" / "garperlux.sqlite"
OUTPUT = ROOT / "output" / "_product_documents.json"
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
USER_AGENT = CONFIG["site"]["user_agent"]

SUPPORTED_HOSTS = {
    "www.webdosb.com",
    "tegui-distel.com",
    "www.leroymerlin.es",
    "www.domoelectra.com",
    "www.serviciotecnicofermax.com",
}

TEGUI_DOCS_INDEX_URL = "https://tegui-distel.com/pages/manuales-tecnicos-y-documentacion"


# ============= Helpers ======================================================

def _safe_print(line: str):
    """Imprime soportando consolas Windows que se quejan con cp1252."""
    try:
        print(line)
    except UnicodeEncodeError:
        print(line.encode("ascii", "replace").decode("ascii"))


def _http_get(url: str, timeout: int = 30) -> str | None:
    try:
        r = requests.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT,
                                                        "Accept-Language": "es-ES,es;q=0.9"})
        if r.status_code != 200:
            print(f"  [http {r.status_code}] {url}")
            return None
        return r.text
    except Exception as exc:  # noqa: BLE001
        print(f"  [err] {url}: {exc}")
        return None


def _classify(label: str, file_name: str = "") -> str:
    text = f"{label} {file_name}".lower()
    if any(k in text for k in ("manual", "instalacion", "instrucciones", "instruccion", "guide")):
        return "manual"
    if any(k in text for k in ("declar", "conformidad")) or re.search(r"\bce\b", text):
        return "ce"
    if any(k in text for k in ("ficha", "datasheet", "spec", "tecnica", "técnica")):
        return "datasheet"
    if any(k in text for k in ("catalog", "catálogo")):
        return "catalog"
    return "official"


def _tokenize(text: str) -> set[str]:
    text = (text or "").lower()
    text = text.translate(str.maketrans("áéíóúüñ", "aeiouun"))
    tokens = re.findall(r"[a-z0-9]+", text)
    # Stopwords y palabras genéricas que aportan poco al matching.
    STOP = {
        "de", "la", "el", "los", "las", "para", "con", "y", "del", "al", "por",
        "manual", "tecnico", "instalacion", "tegui", "distel", "instruccion",
        "instrucciones", "datasheet", "ficha", "tecnica", "ok", "20", "21", "22",
        "23", "24", "25",
    }
    return {t for t in tokens if t not in STOP and len(t) >= 2}


# ============= Extractor: webdosb.com =======================================

_DATA_PRODUCT = re.compile(r'data-product="([^"]+)"', re.IGNORECASE)


def extract_webdosb(html: str, source_url: str) -> list[dict]:
    out: list[dict] = []
    m = _DATA_PRODUCT.search(html)
    if not m:
        return out
    raw = unescape(m.group(1))
    try:
        data = json.loads(raw)
    except Exception:  # noqa: BLE001
        return out
    for att in data.get("attachments") or []:
        idx = att.get("id_attachment")
        if not idx:
            continue
        url = f"https://www.webdosb.com/index.php?controller=attachment&id_attachment={idx}"
        label = (att.get("name") or att.get("file_name") or "Documento").strip()
        out.append({
            "type": _classify(label, att.get("file_name") or ""),
            "label": label,
            "url": url,
            "size": att.get("file_size_formatted") or None,
            "mime": att.get("mime") or "application/pdf",
            "source_host": "www.webdosb.com",
        })
    return out


# ============= Extractor: leroymerlin.es ====================================

_LM_PDF_RE = re.compile(
    r'<a\b[^>]*href=["\'](https://media\.adeo\.com/[^"\']+\.pdf[^"\']*)["\'][^>]*>(.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
_TAG = re.compile(r"<[^>]+>")
# Filtra PDFs de cabecera/footer (privacidad, RGPD...) y los de marketing
# ("Oferta especial", "Black Friday", etc.) que no son documentación técnica.
_LM_NOISE_RE = re.compile(
    r"privacidad|cookie|condiciones|legal|aviso|"
    r"oferta\s+especial|oferta\s+black|black\s+friday|rebajas|"
    r"promoci[oó]n|promo\s+|cup[oó]n|publicidad|marketing|catalogo\s+ofertas",
    re.IGNORECASE,
)


def extract_leroymerlin(html: str, source_url: str) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for match in _LM_PDF_RE.finditer(html):
        url = match.group(1).strip()
        if url in seen:
            continue
        seen.add(url)
        label = re.sub(r"\s+", " ", _TAG.sub(" ", match.group(2))).strip()
        if not label:
            label = "Manual del fabricante"
        if _LM_NOISE_RE.search(label) or _LM_NOISE_RE.search(url):
            continue
        out.append({
            "type": _classify(label, url),
            "label": label[:80],
            "url": url,
            "size": None,
            "mime": "application/pdf",
            "source_host": "www.leroymerlin.es",
        })
    return out


# ============= Extractor: tegui-distel.com ==================================
# Las páginas de producto NO tienen enlaces a PDFs; los manuales viven en una
# página índice única. Cargamos ese índice una sola vez, lo parseamos y
# emparejamos los PDFs a cada producto por coincidencia de SKU o keywords.

_TEGUI_INDEX_CACHE: list[dict] | None = None


def _load_tegui_index() -> list[dict]:
    global _TEGUI_INDEX_CACHE
    if _TEGUI_INDEX_CACHE is not None:
        return _TEGUI_INDEX_CACHE
    print(f"  [tegui] cargando índice de manuales: {TEGUI_DOCS_INDEX_URL}")
    html = _http_get(TEGUI_DOCS_INDEX_URL)
    if not html:
        _TEGUI_INDEX_CACHE = []
        return _TEGUI_INDEX_CACHE
    pdf_re = re.compile(
        r'<a\b[^>]*href=["\']([^"\']+\.pdf[^"\']*)["\'][^>]*>(.*?)</a>',
        re.IGNORECASE | re.DOTALL,
    )
    docs: list[dict] = []
    seen_urls: set[str] = set()
    for m in pdf_re.finditer(html):
        href = m.group(1)
        if href.startswith("//"):
            href = "https:" + href
        elif href.startswith("/"):
            href = "https://tegui-distel.com" + href
        if href in seen_urls:
            continue
        seen_urls.add(href)
        text = re.sub(r"\s+", " ", _TAG.sub(" ", m.group(2))).strip()
        if not text:
            text = href.rsplit("/", 1)[-1].split("?")[0]
        # Sólo nos interesan los PDFs en el CDN de Shopify (los oficiales).
        if "cdn.shopify.com" not in href and "/files/" not in href:
            continue
        docs.append({
            "url": href,
            "label": text,
            "tokens": _tokenize(f"{text} {href}"),
        })
    print(f"  [tegui] {len(docs)} manuales en índice")
    _TEGUI_INDEX_CACHE = docs
    return docs


def extract_tegui(html: str, source_url: str, *, sku: str | None = None,
                  product_name: str | None = None) -> list[dict]:
    docs = _load_tegui_index()
    if not docs:
        return []
    # 1) Coincidencia por SKU. Si el SKU aparece como fragmento (>3 chars) en
    #    la URL o el texto del PDF, es un match seguro.
    matches: list[tuple[float, dict]] = []
    sku_clean = re.sub(r"[^A-Za-z0-9]", "", sku or "")
    for doc in docs:
        score = 0.0
        text_blob = f"{doc['label']} {doc['url']}".lower()
        if sku_clean and len(sku_clean) >= 4 and sku_clean.lower() in text_blob:
            score += 100
        # Coincidencia de keywords del nombre.
        product_tokens = _tokenize(product_name or "")
        if product_tokens:
            common = product_tokens & doc["tokens"]
            score += len(common) * 5
            # Penaliza PDFs muy genéricos (sin tokens fuertes).
            if not common:
                score -= 1
        if score > 0:
            matches.append((score, doc))
    matches.sort(key=lambda x: -x[0])
    out: list[dict] = []
    seen_urls: set[str] = set()
    # Tomamos los matches con score >= 10 (>=2 keywords coincidentes), hasta 3 PDFs.
    for score, doc in matches:
        if score < 10:
            break
        if doc["url"] in seen_urls:
            continue
        seen_urls.add(doc["url"])
        out.append({
            "type": _classify(doc["label"], doc["url"]),
            "label": doc["label"][:80],
            "url": doc["url"],
            "size": None,
            "mime": "application/pdf",
            "source_host": "tegui-distel.com",
        })
        if len(out) >= 3:
            break
    return out


# ============= Routing por host =============================================

PLAIN_EXTRACTORS = {
    "www.webdosb.com": extract_webdosb,
    "www.leroymerlin.es": extract_leroymerlin,
    "tegui-distel.com": extract_tegui,
}


def _extract_for(html: str, source_url: str, *, sku: str | None = None,
                 product_name: str | None = None) -> list[dict]:
    host = urlparse(source_url).netloc
    extractor = PLAIN_EXTRACTORS.get(host)
    if not extractor:
        return []
    if extractor is extract_tegui:
        return extract_tegui(html, source_url, sku=sku, product_name=product_name)
    return extractor(html, source_url)


# ============= Camoufox (Leroy Merlin) ======================================

def _make_camoufox_session():
    try:
        from camoufox.sync_api import Camoufox
    except ImportError:
        return None

    class _CamoSession:
        def __init__(self):
            self._cm = Camoufox(headless=True, humanize=True, geoip=False, locale=["es-ES"])
            self._browser = self._cm.__enter__()
            self._page = self._browser.new_page()

        def close(self):
            try:
                self._cm.__exit__(None, None, None)
            except Exception:  # noqa: BLE001
                pass

        def fetch(self, url: str) -> str | None:
            try:
                self._page.goto(url, wait_until="domcontentloaded", timeout=60000)
                time.sleep(2.0)
                # Algunas fichas LM cargan el bloque de descargas tras scroll.
                self._page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(1.0)
                return self._page.content()
            except Exception as exc:  # noqa: BLE001
                print(f"  [camoufox-err] {url}: {exc}")
                return None

    return _CamoSession()


# ============= Loop principal ===============================================

def _load_existing() -> dict:
    if not OUTPUT.exists():
        return {}
    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hosts", default="", help="Hosts permitidos separados por coma. Por defecto: todos los soportados.")
    parser.add_argument("--limit", type=int, default=0, help="Procesa solo los primeros N productos del scope.")
    parser.add_argument("--retry-failed", action="store_true", help="Reintenta productos cuyo último intento devolvió 0 documentos.")
    parser.add_argument("--delay", type=float, default=1.5, help="Delay entre peticiones HTTP (s).")
    args = parser.parse_args(argv)

    if not DB_PATH.exists():
        print(f"[err] no existe la DB: {DB_PATH}")
        return 1

    if args.hosts:
        wanted = {h.strip().lower() for h in args.hosts.split(",") if h.strip()}
        allowed_hosts: set[str] = set()
        for h in SUPPORTED_HOSTS:
            short = h.replace("www.", "").split(".")[0]
            if h in wanted or short in wanted:
                allowed_hosts.add(h)
        if not allowed_hosts:
            print(f"[err] hosts no soportados. Disponibles: {sorted(SUPPORTED_HOSTS)}")
            return 1
    else:
        allowed_hosts = set(SUPPORTED_HOSTS)

    print(f"[hosts] {sorted(allowed_hosts)}")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    rows = cur.execute("SELECT sku, name, specs_json FROM products ORDER BY id").fetchall()
    conn.close()

    existing = _load_existing()
    needs_camo = "www.leroymerlin.es" in allowed_hosts
    camo_session = None
    if needs_camo:
        camo_session = _make_camoufox_session()
        if camo_session is None:
            print("[warn] Camoufox no disponible; se omitirán productos de leroymerlin.")
            allowed_hosts.discard("www.leroymerlin.es")

    processed = 0
    matched = 0
    new_docs = 0
    try:
        for sku, name, specs_json in rows:
            try:
                specs = json.loads(specs_json or "{}")
            except Exception:  # noqa: BLE001
                specs = {}
            source = specs.get("_source")
            if not source:
                continue
            host = urlparse(source).netloc
            if host not in allowed_hosts:
                continue
            prev = existing.get(sku) or {}
            prev_docs = prev.get("documents") or []
            if prev_docs and not args.retry_failed:
                continue
            if args.limit and processed >= args.limit:
                break

            _safe_print(f"\n[{processed + 1}] {sku} | {host}")
            _safe_print(f"    {source}")

            if host == "www.leroymerlin.es" and camo_session is not None:
                html = camo_session.fetch(source)
            else:
                html = _http_get(source)
            processed += 1
            if not html:
                existing[sku] = {"source_url": source, "host": host,
                                 "documents": prev_docs, "last_attempt_failed": True}
                _persist(existing)
                continue
            docs = _extract_for(html, source, sku=str(sku), product_name=name)
            seen_urls: set[str] = set()
            unique: list[dict] = []
            for d in docs:
                if d["url"] in seen_urls:
                    continue
                seen_urls.add(d["url"])
                unique.append(d)
            existing[sku] = {
                "source_url": source,
                "host": host,
                "name": name,
                "documents": unique,
                "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
            if unique:
                matched += 1
                new_docs += len(unique)
                for d in unique:
                    _safe_print(f"    -> {d['type']:<10} {d['label'][:55]:<55} {d.get('size') or ''}")
            else:
                _safe_print("    (sin documentos detectables)")
            _persist(existing)
            time.sleep(args.delay)
    finally:
        if camo_session is not None:
            camo_session.close()

    print(f"\n[done] procesados={processed} con_docs={matched} total_docs={new_docs} -> {OUTPUT}")
    return 0


def _persist(data: dict):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
