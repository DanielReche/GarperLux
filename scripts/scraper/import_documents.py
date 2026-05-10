#!/usr/bin/env python3
"""
GarperLux — Importa los enlaces a documentos oficiales scrapeados a la DB.

Lee `output/_product_documents.json` (lo genera scrape_documents.py) y, por
cada SKU encontrado, fusiona el array `documents` en `products.specs_json`
bajo la clave `_documents`. La clave es interna (todas las claves que
empiezan por `_` se filtran en la vista de specs), así no rompe la UI.

Uso:
    python import_documents.py            # importa todos los productos del JSON
    python import_documents.py --dry-run  # solo enseña los cambios

Idempotente: si vuelves a ejecutarlo con el mismo JSON, deja la DB igual.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent
DB_PATH = PROJECT_ROOT / "backend" / "database" / "garperlux.sqlite"
JSON_PATH = ROOT / "output" / "_product_documents.json"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    if not DB_PATH.exists():
        print(f"[err] no existe la DB: {DB_PATH}")
        return 1
    if not JSON_PATH.exists():
        print(f"[err] no existe el JSON: {JSON_PATH}. Ejecuta scrape_documents.py primero.")
        return 1

    docs_by_sku = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    updated = 0
    skipped_empty = 0
    skipped_unchanged = 0
    skipped_missing = 0
    for sku, info in docs_by_sku.items():
        documents = info.get("documents") or []
        if not documents:
            skipped_empty += 1
            continue
        row = cur.execute("SELECT specs_json FROM products WHERE sku = ?", (sku,)).fetchone()
        if not row:
            skipped_missing += 1
            continue
        try:
            specs = json.loads(row[0] or "{}")
        except Exception:  # noqa: BLE001
            specs = {}
        # Comparamos por url para detectar cambios reales.
        existing_urls = {d.get("url") for d in (specs.get("_documents") or []) if isinstance(d, dict)}
        new_urls = {d.get("url") for d in documents if isinstance(d, dict)}
        if existing_urls == new_urls:
            skipped_unchanged += 1
            continue
        specs["_documents"] = documents
        specs_json = json.dumps(specs, ensure_ascii=False)
        if args.dry_run:
            print(f"  [DRY] {sku}: {len(documents)} doc(s)")
        else:
            cur.execute("UPDATE products SET specs_json = ? WHERE sku = ?", (specs_json, sku))
        updated += 1

    if not args.dry_run:
        conn.commit()
    conn.close()

    print(f"\n[done] actualizados={updated} sin_docs={skipped_empty} sin_cambios={skipped_unchanged} sku_no_existe={skipped_missing}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
