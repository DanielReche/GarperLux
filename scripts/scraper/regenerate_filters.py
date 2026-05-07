#!/usr/bin/env python3
"""
GarperLux — Regenera la sección 'Marca' de cada página de categoría
para que liste exactamente las marcas presentes en SQLite.

Esto garantiza que cualquier marca que aparezca en el filtro tenga al menos un
producto que coincida (coherencia sidebar ↔ catálogo).

Uso:
    python regenerate_filters.py               # actualiza las 9 páginas
    python regenerate_filters.py iluminacion   # solo una

Comportamiento idempotente: si la sección Marca no es detectable, deja la
página tal cual y avisa.
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent
DB_PATH = PROJECT_ROOT / "backend" / "database" / "garperlux.sqlite"
WEB_TIENDA = PROJECT_ROOT / "web" / "pages" / "tienda"

CATEGORY_TO_PAGE = {
    "mecanismos": "mecanismos.html",
    "iluminacion": "iluminacion.html",
    "proteccion": "protecciones-electricas.html",
    "porteros-videoporteros": "porteros-videoporteros.html",
    "domotica": "domotica.html",
    "automatismos": "automatismos.html",
    "antenas-telecomunicaciones": "antenas-telecomunicaciones.html",
    "seguridad": "seguridad.html",
    "cableado": "categoria-cableado.html",
}


def _brands_in_db(conn: sqlite3.Connection, category_slug: str) -> list[tuple[str, int]]:
    """Devuelve [(brand_name, count), ...] ordenado desc por count."""
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT b.name AS brand, COUNT(*) AS n
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        JOIN categories c ON c.id = p.category_id
        WHERE c.slug = ?
        GROUP BY b.id
        ORDER BY n DESC, b.name
        """,
        (category_slug,),
    ).fetchall()
    return [(r[0], int(r[1])) for r in rows]


_BRAND_BLOCK_PATTERN = re.compile(
    r'(<summary[^>]*>\s*<span[^>]*>Marca</span>.*?</summary>\s*<div[^>]*>)(.*?)(\s*</div>\s*</details>)',
    re.IGNORECASE | re.DOTALL,
)


def _build_brand_html(brands: list[tuple[str, int]], max_inline: int = 8) -> str:
    if not brands:
        return '<span class="text-xs text-graphite">Sin marcas en catálogo</span>'
    parts = []
    visible = brands[:max_inline]
    for name, count in visible:
        safe = name.replace("<", "").replace(">", "")
        parts.append(
            f'<label class="filter-check"><input type="checkbox"/> {safe} '
            f'<span class="count">{count}</span></label>'
        )
    extra = len(brands) - max_inline
    if extra > 0:
        parts.append(
            f'<button class="text-xs text-copper hover:underline mt-1">'
            f'+ Ver {extra} marca{"s" if extra != 1 else ""} más</button>'
        )
    return "\n              ".join(parts)


def _update_page(conn: sqlite3.Connection, slug: str) -> bool:
    page_name = CATEGORY_TO_PAGE.get(slug)
    if not page_name:
        print(f"[skip] {slug}: sin página asociada")
        return False
    path = WEB_TIENDA / page_name
    if not path.exists():
        print(f"[skip] {slug}: {path.name} no existe")
        return False
    brands = _brands_in_db(conn, slug)
    if not brands:
        print(f"[skip] {slug}: sin productos en DB todavía")
        return False
    html = path.read_text(encoding="utf-8")
    block = _build_brand_html(brands)
    new_html, n = _BRAND_BLOCK_PATTERN.subn(
        lambda m: f"{m.group(1)}\n              {block}\n            {m.group(3)}",
        html,
        count=1,
    )
    if n == 0:
        print(f"[warn] {slug}: bloque 'Marca' no encontrado en {page_name}")
        return False
    if new_html == html:
        print(f"[ok ]  {slug}: sin cambios ({len(brands)} marcas)")
        return True
    path.write_text(new_html, encoding="utf-8")
    print(f"[upd]  {slug}: {len(brands)} marcas en {page_name}")
    for name, count in brands[:6]:
        print(f"         · {name} ({count})")
    return True


def main(argv: list[str]):
    if not DB_PATH.exists():
        print(f"[err] no existe la DB: {DB_PATH}")
        return 1
    requested = {arg.lower() for arg in argv} if argv else set(CATEGORY_TO_PAGE.keys())
    conn = sqlite3.connect(DB_PATH)
    try:
        for slug in CATEGORY_TO_PAGE:
            if slug not in requested:
                continue
            _update_page(conn, slug)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
