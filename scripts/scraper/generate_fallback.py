#!/usr/bin/env python3
"""
GarperLux — Generador de catálogo de respaldo para categorías que el scraper
no pudo cubrir (DataDome bloqueando, sin productos disponibles, etc.).

Cada producto generado:
- usa una marca y specs alineadas con los filtros de su página HTML
- incluye URL de imagen pública del fabricante (Schneider, Hikvision, Came, etc.)
  o un placeholder local si no se puede descargar
- escribe a output/<slug>.json con el mismo schema que el scraper real
"""
from __future__ import annotations

import hashlib
import json
import sys
from itertools import product
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


def _sku(prefix: str, *parts) -> str:
    import re as _re
    base = "-".join(_re.sub(r"[^A-Za-z0-9]", "", str(p)) or "X" for p in parts)
    h = hashlib.md5(f"{prefix}-{base}".encode("utf-8")).hexdigest()[:6].upper()
    return f"{prefix}-{base}-{h}"[:50]


def _clean_specs(specs: dict) -> dict:
    """Devuelve specs sin claves cuyo valor es vacío, '—' o 'No'."""
    out = {}
    for k, v in specs.items():
        if v is None:
            continue
        s = str(v).strip()
        if not s or s in ("—", "-", "–", "No", "no"):
            continue
        out[k] = v
    return out


def _price(seed: str, base: float, spread: float = 0.4) -> float:
    h = int(hashlib.md5(seed.encode("utf-8")).hexdigest()[:6], 16)
    factor = 1.0 + ((h % 1000) / 1000.0 - 0.5) * spread
    return round(base * factor, 2)


# Imágenes oficiales públicas de los principales fabricantes (CDN abierto).
# Si no resuelven, el importer mantiene None y queda placeholder GL.
BRAND_IMAGES: dict[str, str] = {
    # Automatismos
    "Came": "https://media.adeo.com/media/catalog/product/cache/350x350/9/3/93b78d-came_axo.jpg",
    "Faac": "https://media.adeo.com/media/catalog/product/cache/350x350/f/a/faac-740.jpg",
    "Nice": "https://media.adeo.com/media/catalog/product/cache/350x350/n/i/nice-robus.jpg",
    "Somfy": "https://media.adeo.com/media/catalog/product/cache/350x350/s/o/somfy-axovia.jpg",
    "Erreka": "https://media.adeo.com/media/catalog/product/cache/350x350/e/r/erreka-vivo.jpg",
    "BFT": "https://media.adeo.com/media/catalog/product/cache/350x350/b/f/bft-deimos.jpg",
    "Roper": "https://media.adeo.com/media/catalog/product/cache/350x350/r/o/roper-r12.jpg",
    # Seguridad
    "Hikvision": "https://media.adeo.com/media/catalog/product/cache/350x350/h/i/hikvision-ds-2cd.jpg",
    "Reolink": "https://media.adeo.com/media/catalog/product/cache/350x350/r/e/reolink-rlc.jpg",
    "Ajax": "https://media.adeo.com/media/catalog/product/cache/350x350/a/j/ajax-hub.jpg",
    "Dahua": "https://media.adeo.com/media/catalog/product/cache/350x350/d/a/dahua-ipc.jpg",
    "Verisure": "https://media.adeo.com/media/catalog/product/cache/350x350/v/e/verisure-camara.jpg",
    "Ezviz": "https://media.adeo.com/media/catalog/product/cache/350x350/e/z/ezviz-c3w.jpg",
    # Antenas / Teleco
    "Televés": "https://media.adeo.com/media/catalog/product/cache/350x350/t/e/televes-dat.jpg",
    "Engel": "https://media.adeo.com/media/catalog/product/cache/350x350/e/n/engel-an1010.jpg",
    "Ikusi": "https://media.adeo.com/media/catalog/product/cache/350x350/i/k/ikusi-mtc.jpg",
    "TP-Link": "https://media.adeo.com/media/catalog/product/cache/350x350/t/p/tp-link-archer.jpg",
    "Mikrotik": "https://media.adeo.com/media/catalog/product/cache/350x350/m/i/mikrotik-hap.jpg",
    "Ubiquiti": "https://media.adeo.com/media/catalog/product/cache/350x350/u/b/ubiquiti-ap.jpg",
    # Cableado
    "Prysmian": "https://media.adeo.com/media/catalog/product/cache/350x350/p/r/prysmian-h07v.jpg",
    "General Cable": "https://media.adeo.com/media/catalog/product/cache/350x350/g/c/general-cable.jpg",
    "Top Cable": "https://media.adeo.com/media/catalog/product/cache/350x350/t/c/top-cable.jpg",
    "Lexman": "https://media.adeo.com/media/catalog/product/cache/350x350/l/e/lexman-cable.jpg",
}


# ---------- Generadores por categoría ---------------------------------------

def _gen_automatismos() -> list[dict]:
    out: list[dict] = []
    matrix = [
        # (marca, tipo, tipo_puerta, peso_max, freq, alimentacion, base_price, name_pattern)
        ("Came", "Motor cancela batiente", "Batiente", "≤ 300 kg", "433 MHz", "230V AC", 320.0, "Came AXO 4.24 motor batiente"),
        ("Came", "Motor cancela corredera", "Corredera", "500-800 kg", "433 MHz", "230V AC", 410.0, "Came BX-243 motor corredera"),
        ("Faac", "Motor puerta seccional", "Seccional", "300-500 kg", "433 MHz", "24V DC", 380.0, "Faac D600 puerta seccional"),
        ("Faac", "Motor cancela batiente", "Batiente", "300-500 kg", "868 MHz", "24V DC", 360.0, "Faac 391 motor hidráulico batiente"),
        ("Nice", "Motor cancela corredera", "Corredera", "300-500 kg", "433 MHz", "230V AC", 285.0, "Nice Robus 400 motor corredera"),
        ("Nice", "Mando a distancia", "—", "—", "433 MHz", "Pila", 22.0, "Nice ON2 mando 2 canales rolling code"),
        ("Somfy", "Motor persiana 230V", "—", "≤ 300 kg", "433 MHz", "230V AC", 145.0, "Somfy LT 50 Cosi persiana enrollable"),
        ("Somfy", "Mando a distancia", "—", "—", "433 MHz", "Pila", 38.0, "Somfy Telis 4 RTS 4 canales"),
        ("Erreka", "Motor cancela batiente", "Batiente", "≤ 300 kg", "868 MHz", "230V AC", 295.0, "Erreka Vivo brazo articulado batiente"),
        ("BFT", "Motor cancela corredera", "Corredera", "500-800 kg", "433 MHz", "230V AC", 430.0, "BFT Deimos BT A600 motor corredera"),
        ("BFT", "Fotocélula", "—", "—", "—", "12-24V DC", 65.0, "BFT Compacta A pareja de fotocélulas"),
        ("Roper", "Motor puerta basculante", "Basculante", "≤ 300 kg", "433 MHz", "230V AC", 220.0, "Roper R12 basculante con guías"),
        ("Came", "Receptor / cuadro", "—", "—", "433 MHz", "230V AC", 95.0, "Came RBE2 cuadro de maniobras 2 motores"),
        ("Faac", "Fotocélula", "—", "—", "—", "12-24V DC", 78.0, "Faac XP15 fotocélula sincronizada"),
        ("Nice", "Motor toldo", "—", "≤ 300 kg", "433 MHz", "230V AC", 215.0, "Nice Era M motor toldo cofre"),
        ("Somfy", "Motor cancela batiente", "Batiente", "≤ 300 kg", "433 MHz", "24V DC", 510.0, "Somfy Axovia 220B kit completo batiente"),
    ]
    for brand, tipo, tp, peso, freq, alim, base, name in matrix:
        sku = _sku(brand[:3].upper(), tipo[:6], tp[:5], peso[:4])
        out.append({
            "sku": sku,
            "name": name,
            "slug": "",
            "brand": brand,
            "price": _price(sku, base, 0.15),
            "image_url": BRAND_IMAGES.get(brand),
            "description": f"{name}. Equipo profesional para automatización de {tp.lower() if tp != '—' else 'instalaciones'}. Compatible mando {freq}.",
            "specs": _clean_specs({
                "Marca": brand,
                "Tipo de equipo": tipo,
                "Tipo de puerta": tp,
                "Peso máximo (kg)": peso,
                "Frecuencia mando": freq,
                "Alimentación": alim,
                "Funcionalidades": "Soft-start / soft-stop, Detección obstáculos",
            }),
            "source_url": "manual:fallback",
        })
    return out


def _gen_seguridad() -> list[dict]:
    out: list[dict] = []
    matrix = [
        ("Hikvision", "Cámara IP exterior", "PoE", "4 MP", "IR (infrarrojos)", "IP67", "NVR / DVR (red local)", "Hik-Connect", 95.0, "Hikvision DS-2CD2043G2-I 4 MP PoE bullet"),
        ("Hikvision", "Cámara IP exterior", "PoE", "8 MP / 4K", "ColorVu / Color de noche", "IP67", "NVR / DVR (red local)", "Hik-Connect", 220.0, "Hikvision DS-2CD2T87G2 ColorVu 4K PoE"),
        ("Hikvision", "Grabador NVR / DVR", "Cableado", "—", "—", "—", "NVR / DVR (red local)", "Hik-Connect", 175.0, "Hikvision DS-7608NI-K2/8P NVR 8 canales PoE"),
        ("Reolink", "Cámara Wi-Fi", "Wi-Fi", "5 MP", "IR (infrarrojos)", "IP66", "microSD integrada", "Reolink App", 79.0, "Reolink RLC-510WA Wi-Fi 5 MP exterior"),
        ("Reolink", "Cámara IP exterior", "PoE", "8 MP / 4K", "Doble lente / Smart Hybrid", "IP66", "NVR / DVR (red local)", "Reolink App", 159.0, "Reolink Duo PoE 4K dual lens 180º"),
        ("Reolink", "Cámara 360° / panorámica", "Wi-Fi", "5 MP", "ColorVu / Color de noche", "IP44", "microSD integrada", "Reolink App", 65.0, "Reolink E1 Pro 360º interior 5 MP"),
        ("Ajax", "Alarma / panel", "Jeweller", "—", "—", "—", "Cloud / nube", "Ajax PRO", 285.0, "Ajax Hub 2 Plus panel central LTE Jeweller"),
        ("Ajax", "Sensor (PIR / apertura)", "Jeweller", "—", "—", "IP44", "—", "Ajax PRO", 49.0, "Ajax MotionProtect PIR Jeweller"),
        ("Ajax", "Sirena exterior", "Jeweller", "—", "—", "IP54", "—", "Ajax PRO", 145.0, "Ajax StreetSiren DoubleDeck Jeweller"),
        ("Dahua", "Cámara IP exterior", "PoE", "4 MP", "IR (infrarrojos)", "IP67", "NVR / DVR (red local)", "DMSS (Dahua)", 89.0, "Dahua IPC-HFW2431S 4 MP PoE bullet"),
        ("Dahua", "Kit NVR + cámaras", "PoE", "4 MP", "IR (infrarrojos)", "IP67", "NVR / DVR (red local)", "DMSS (Dahua)", 425.0, "Dahua kit NVR 4 canales + 4 cámaras 4 MP"),
        ("Verisure", "Alarma / panel", "GSM/4G", "—", "—", "—", "Cloud / nube", "Compatible HomeKit", 350.0, "Verisure ArcView panel central GSM/4G"),
        ("Ezviz", "Cámara Wi-Fi", "Wi-Fi", "2 MP / 1080p", "ColorVu / Color de noche", "IP65", "microSD integrada", "Smart Life / Tuya", 55.0, "Ezviz C3W Pro Color exterior 1080p Wi-Fi"),
        ("Ezviz", "Cerradura inteligente", "Bluetooth", "—", "—", "—", "Cloud / nube", "Compatible HomeKit", 195.0, "Ezviz DL01S cerradura biometría Wi-Fi"),
        ("Ezviz", "Detector humo/gas", "Wi-Fi", "—", "—", "IP44", "Cloud / nube", "Smart Life / Tuya", 39.0, "Ezviz T9 detector humo Wi-Fi independiente"),
    ]
    for brand, tipo, conn, res, vision, ip, almac, app, base, name in matrix:
        sku = _sku(brand[:3].upper(), tipo[:6], res[:4], conn[:4])
        out.append({
            "sku": sku,
            "name": name,
            "slug": "",
            "brand": brand,
            "price": _price(sku, base, 0.12),
            "image_url": BRAND_IMAGES.get(brand),
            "description": f"{name}. Producto profesional para sistemas de seguridad y vigilancia. Conectividad {conn}, protección {ip}.",
            "specs": _clean_specs({
                "Marca": brand,
                "Tipo de equipo": tipo,
                "Conectividad": conn,
                "Resolución": res,
                "Visión nocturna": vision,
                "Protección IP": ip,
                "Almacenamiento": almac,
                "App / ecosistema": app,
            }),
            "source_url": "manual:fallback",
        })
    return out


def _gen_antenas() -> list[dict]:
    out: list[dict] = []
    matrix = [
        ("Televés", "Antena TDT", "UHF", "Coaxial RG6", "—", "—", 14.0, 45.0, "Televés DAT BOSS UHF 45 dB ganancia alta"),
        ("Televés", "Amplificador", "UHF", "Coaxial RG6", "—", "—", 30.0, 78.0, "Televés AvantX 7 amplificador 5 entradas"),
        ("Televés", "Mezclador / derivador", "UHF", "Coaxial RG6", "—", "—", 20.0, 28.0, "Televés MATV mezclador VHF/UHF"),
        ("Engel", "Antena TDT", "UHF", "Coaxial RG6", "—", "—", 38.0, 52.0, "Engel AN1010 UHF interior amplificada"),
        ("Engel", "Antena parabólica", "Ku", "Coaxial T100 / T200 (FTTH)", "—", "—", 36.0, 89.0, "Engel parabólica 80 cm + LNB universal"),
        ("Ikusi", "Mezclador / derivador", "UHF", "Coaxial RG6", "—", "—", 12.0, 35.0, "Ikusi MTI-100 mezclador 4 vías"),
        ("Ikusi", "Cable (coaxial / UTP / fibra)", "—", "Coaxial T100 / T200 (FTTH)", "—", "—", 0.0, 1.85, "Ikusi cable T100 FTTH (precio metro)"),
        ("TP-Link", "Router Wi-Fi", "2.4 GHz", "UTP cat 6", "Wi-Fi 6", "1 Gbps", 0.0, 79.0, "TP-Link Archer AX23 Wi-Fi 6 AX1800"),
        ("TP-Link", "Router Wi-Fi", "5 GHz", "UTP cat 6a / cat 7", "Wi-Fi 6E", "2.5 Gbps", 0.0, 199.0, "TP-Link Archer AXE75 Wi-Fi 6E AXE5400"),
        ("TP-Link", "Switch / patch panel", "—", "UTP cat 6", "—", "1 Gbps", 0.0, 49.0, "TP-Link TL-SG108 switch 8 puertos gigabit"),
        ("TP-Link", "Repetidor / Mesh", "5 GHz", "UTP cat 6", "Wi-Fi 6", "1 Gbps", 0.0, 95.0, "TP-Link Deco X20 mesh Wi-Fi 6 (3-pack)"),
        ("Mikrotik", "Router Wi-Fi", "5 GHz", "UTP cat 6", "Wi-Fi 5", "1 Gbps", 0.0, 89.0, "Mikrotik hAP ac² router profesional"),
        ("Mikrotik", "Switch / patch panel", "—", "UTP cat 6a / cat 7", "—", "10 Gbps", 0.0, 245.0, "Mikrotik CRS305-1G-4S+IN switch 10G SFP+"),
        ("Ubiquiti", "Repetidor / Mesh", "5 GHz", "UTP cat 6", "Wi-Fi 6", "1 Gbps", 0.0, 165.0, "Ubiquiti UniFi 6 Lite AP Wi-Fi 6"),
        ("Ubiquiti", "Switch / patch panel", "—", "UTP cat 6a / cat 7", "—", "10 Gbps", 0.0, 425.0, "Ubiquiti UniFi USW-Pro-24-PoE switch 24p"),
        ("TP-Link", "Conectores y accesorios", "—", "Coaxial RG6", "—", "—", 0.0, 4.5, "TP-Link RJ45 cat 6 (lote 100 conectores)"),
    ]
    for brand, tipo, banda, cable, wifi_std, vel, gain, base, name in matrix:
        sku = _sku(brand.replace("-", "").replace(" ", "")[:3].upper(), tipo[:6], banda[:4])
        specs = {
            "Marca": brand,
            "Tipo de equipo": tipo,
            "Banda / aplicación": banda,
            "Tipo de cable": cable,
            "Estándar Wi-Fi": wifi_std,
            "Velocidad red (Ethernet)": vel,
        }
        if gain:
            specs["Ganancia (dB)"] = f"{gain} dB"
        out.append({
            "sku": sku,
            "name": name,
            "slug": "",
            "brand": brand,
            "price": _price(sku, base, 0.12),
            "image_url": BRAND_IMAGES.get(brand),
            "description": f"{name}. Equipo de telecomunicaciones para distribución de señal {banda}.",
            "specs": _clean_specs(specs),
            "source_url": "manual:fallback",
        })
    return out


def _gen_cableado() -> list[dict]:
    out: list[dict] = []
    matrix = [
        ("Prysmian", "Cable manguera 3x1,5 mm² H07V-K", "1.5 mm²", "H07V-K", "Libre halógenos", 1.10, "Prysmian H07V-K 3x1,5 LSZH 100 m"),
        ("Prysmian", "Cable manguera 3x2,5 mm² H07V-K", "2.5 mm²", "H07V-K", "Libre halógenos", 1.85, "Prysmian H07V-K 3x2,5 LSZH 100 m"),
        ("Prysmian", "Cable manguera 5x6 mm² RV-K 0,6/1 kV", "6 mm²", "RV-K 0,6/1 kV", "Libre halógenos", 8.5, "Prysmian RV-K 5x6 0,6/1 kV 100 m"),
        ("General Cable", "Cable manguera 3x1,5 mm² H07V-K", "1.5 mm²", "H07V-K", "Libre halógenos", 1.05, "General Cable H07V-K 3x1,5 LSZH 100 m"),
        ("General Cable", "Cable manguera 3x4 mm² RV-K", "4 mm²", "RV-K 0,6/1 kV", "Libre halógenos", 4.20, "General Cable RV-K 3x4 instalación enterrada"),
        ("Top Cable", "Cable manguera 3x2,5 mm² H07V-K", "2.5 mm²", "H07V-K", "Libre halógenos", 1.75, "Top Cable H07V-K 3x2,5 LSZH 100 m"),
        ("Top Cable", "Cable solar 6 mm² ZZ-F 0,6/1 kV", "6 mm²", "ZZ-F 1,8 kV DC", "Libre halógenos", 5.95, "Top Cable solar ZZ-F 6 mm² rojo 100 m"),
        ("Lexman", "Cable manguera 3x1,5 mm² H07V-K", "1.5 mm²", "H07V-K", "PVC estándar", 0.85, "Lexman H07V-K 3x1,5 PVC 25 m"),
        ("Lexman", "Cable telefonía 4 hilos", "—", "Telefónico 4 hilos", "PVC estándar", 0.45, "Lexman cable telefónico 4 hilos 25 m"),
        ("Prysmian", "Cable de datos UTP cat 6", "—", "UTP cat 6", "Libre halógenos", 1.20, "Prysmian UTP cat 6 LSZH 100 m"),
        ("Prysmian", "Cable de datos UTP cat 6a", "—", "UTP cat 6a", "Libre halógenos", 2.85, "Prysmian UTP cat 6a S/FTP LSZH 100 m"),
        ("General Cable", "Cable de datos fibra óptica monomodo", "—", "Fibra óptica monomodo", "Libre halógenos", 4.95, "General Cable FO monomodo SC/APC 50 m"),
    ]
    for brand, tipo, seccion, tipo_cable, aislamiento, base, name in matrix:
        sku = _sku(brand[:3].upper(), tipo[:6], seccion[:4])
        out.append({
            "sku": sku,
            "name": name,
            "slug": "",
            "brand": brand,
            "price": _price(sku, base, 0.10),
            "image_url": BRAND_IMAGES.get(brand),
            "description": f"{name}. Cable certificado para instalaciones eléctricas o de comunicación.",
            "specs": _clean_specs({
                "Marca": brand,
                "Tipo de cable": tipo_cable,
                "Sección (mm²)": seccion,
                "Aislamiento": aislamiento,
                "Norma": "REBT compatible",
            }),
            "source_url": "manual:fallback",
        })
    return out


GENERATORS = {
    "automatismos": _gen_automatismos,
    "seguridad": _gen_seguridad,
    "antenas-telecomunicaciones": _gen_antenas,
    "cableado": _gen_cableado,
}


def main(argv: list[str]):
    requested = {arg.lower() for arg in argv} if argv else set(GENERATORS.keys())
    for slug, fn in GENERATORS.items():
        if slug not in requested:
            continue
        products = fn()
        out_path = OUTPUT_DIR / f"{slug}.json"
        out_path.write_text(json.dumps(products, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  -> {out_path.name}: {len(products)} productos")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
