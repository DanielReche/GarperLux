#!/usr/bin/env python3
"""
GarperLux — Limpia documentos promocionales/no-técnicos del JSON scrapeado y
de la DB. Se llaman "Oferta especial", "Black Friday", "Promoción", etc., y
no aportan información técnica al producto.

Idempotente: si ya están limpios no toca nada.

Uso:
    python prune_promo_documents.py            # ejecuta la limpieza
    python prune_promo_documents.py --dry-run  # solo enseña qué borraría
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent
DB_PATH = PROJECT_ROOT / "backend" / "database" / "garperlux.sqlite"
JSON_PATH = ROOT / "output" / "_product_documents.json"

# Mismas reglas que en scrape_documents.py para que el scraper y la limpieza
# coincidan al 100%.
PROMO_RE = re.compile(
    r"oferta\s+especial|oferta\s+black|black\s+friday|rebajas|"
    r"promoci[oó]n|promo\s+|cup[oó]n|publicidad|marketing|catalogo\s+ofertas",
    re.IGNORECASE,
)


def is_promo(doc: dict) -> bool:
    label = doc.get("label", "") or ""
    url = doc.get("url", "") or ""
    return bool(PROMO_RE.search(label) or PROMO_RE.search(url))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    if not JSON_PATH.exists():
        print(f"[err] no existe el JSON: {JSON_PATH}")
        return 1

    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    json_pruned = 0
    affected_skus_json: list[str] = []
    for sku, v in data.items():
        docs = v.get("documents") or []
        clean = [d for d in docs if not is_promo(d)]
        if len(clean) != len(docs):
            json_pruned += len(docs) - len(clean)
            affected_skus_json.append(sku)
            v["documents"] = clean
    if args.dry_run:
        print(f"[DRY] borraría {json_pruned} docs del JSON, en {len(affected_skus_json)} productos.")
    else:
        JSON_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[json] borradas {json_pruned} entradas, en {len(affected_skus_json)} productos.")

    if not DB_PATH.exists():
        print(f"[warn] no existe la DB: {DB_PATH}; salto la fase de limpieza en SQLite.")
        return 0

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    rows = cur.execute("SELECT id, sku, specs_json FROM products WHERE specs_json LIKE '%_documents%'").fetchall()
    db_pruned = 0
    affected_skus_db: list[str] = []
    for pid, sku, specs_raw in rows:
        try:
            specs = json.loads(specs_raw or "{}")
        except Exception:  # noqa: BLE001
            continue
        docs = specs.get("_documents")
        if not isinstance(docs, list) or not docs:
            continue
        clean = [d for d in docs if isinstance(d, dict) and not is_promo(d)]
        if len(clean) == len(docs):
            continue
        db_pruned += len(docs) - len(clean)
        affected_skus_db.append(sku)
        if clean:
            specs["_documents"] = clean
        else:
            specs.pop("_documents", None)
        if not args.dry_run:
            cur.execute("UPDATE products SET specs_json = ? WHERE id = ?",
                        (json.dumps(specs, ensure_ascii=False), pid))
    if args.dry_run:
        print(f"[DRY] borraría {db_pruned} docs de la DB, en {len(affected_skus_db)} productos.")
    else:
        conn.commit()
        print(f"[db]   borradas {db_pruned} entradas, en {len(affected_skus_db)} productos.")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
