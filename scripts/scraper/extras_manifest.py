"""
Manifiesto estructurado de productos nuevos a scrapear desde Leroy Merlin.

Cada entrada es un dict con la metadata fiable que pasó el usuario (familia,
subcategoría, gama, color/tipo/intensidad...) más la URL del producto. La meta
manda — la usamos tal cual al insertar en DB y al construir los grupos de
variantes, en lugar de fiarnos de los specs ruidosos del proveedor.

Convenios:
  - family in {'mecanismos', 'proteccion'} (slug DB)
  - subcategoria como label canónico ("Marcos", "Enchufes", "Interruptores",
    "Magnetotérmicos", "Diferenciales", "Sobretensiones").
  - color: "Blanco", "Antracita", "Plata", "Negro", "Marfil", "Bronce",
    "Gris-Plata".
  - tipo: para mecanismos {"Individual","Doble","Triple","Cuádruple",
    "Conmutador","Cruzamiento","Simple"}; para protección añade flags como
    "Autorrearmable", "Alta sensibilidad", "1 Módulo".
  - intensidad: "10A".."40A".
"""

EXTRAS = [
    # ============== NIESSEN — Zenit · Marcos ==============
    {"url": "https://www.leroymerlin.es/productos/marco-individual-niessen-zenit-blanco-14788004.html",   "brand": "Niessen", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Zenit", "color": "Blanco",    "tipo": "Individual"},
    {"url": "https://www.leroymerlin.es/productos/marco-individual-niessen-zenit-antracita-14788452.html","brand": "Niessen", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Zenit", "color": "Antracita", "tipo": "Individual"},
    {"url": "https://www.leroymerlin.es/productos/marco-individual-niessen-zenit-plata-14906871.html",    "brand": "Niessen", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Zenit", "color": "Plata",     "tipo": "Individual"},
    {"url": "https://www.leroymerlin.es/productos/marco-doble-niessen-zenit-blanco-14906745.html",        "brand": "Niessen", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Zenit", "color": "Blanco",    "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/marco-doble-niessen-zenit-antracita-14906955.html",     "brand": "Niessen", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Zenit", "color": "Antracita", "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/marco-doble-niessen-zenit-plata-14906906.html",         "brand": "Niessen", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Zenit", "color": "Plata",     "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/marco-triple-niessen-zenit-blanco-14788032.html",       "brand": "Niessen", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Zenit", "color": "Blanco",    "tipo": "Triple"},
    {"url": "https://www.leroymerlin.es/productos/marco-triple-niessen-zenit-antracita-14788473.html",    "brand": "Niessen", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Zenit", "color": "Antracita", "tipo": "Triple"},
    {"url": "https://www.leroymerlin.es/productos/marco-triple-niessen-zenit-cristal-negro-14788613.html","brand": "Niessen", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Zenit", "color": "Negro",     "tipo": "Triple"},

    # ============== NIESSEN — Zenit · Enchufes ==============
    {"url": "https://www.leroymerlin.es/productos/enchufe-niessen-zenit-blanco-14787843.html",    "brand": "Niessen", "family": "mecanismos", "subcategoria": "Enchufes", "gama": "Zenit", "color": "Blanco"},
    {"url": "https://www.leroymerlin.es/productos/enchufe-niessen-zenit-plata-14788151.html",     "brand": "Niessen", "family": "mecanismos", "subcategoria": "Enchufes", "gama": "Zenit", "color": "Plata"},
    {"url": "https://www.leroymerlin.es/productos/enchufe-niessen-zenit-antracita-14788375.html", "brand": "Niessen", "family": "mecanismos", "subcategoria": "Enchufes", "gama": "Zenit", "color": "Antracita"},

    # ============== NIESSEN — Zenit · Interruptores ==============
    {"url": "https://www.leroymerlin.es/productos/interruptor-niessen-zenit-blanco-14787801.html",                       "brand": "Niessen", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Zenit", "color": "Blanco",    "tipo": "Conmutador"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-conmutador-con-luz-niessen-zenit-antracita-96026206.html", "brand": "Niessen", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Zenit", "color": "Antracita", "tipo": "Conmutador"},
    {"url": "https://www.leroymerlin.es/productos/pack-de-interruptor-y-marco-individual-zenit-plata-82037059.html",     "brand": "Niessen", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Zenit", "color": "Plata",     "tipo": "Conmutador"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-doble-niessen-zenit-blanco-14787815.html",                 "brand": "Niessen", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Zenit", "color": "Blanco",    "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/pack-de-interruptor-y-marco-doble-zenit-plata-82037060.html",          "brand": "Niessen", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Zenit", "color": "Plata",     "tipo": "Doble"},

    # ============== SIMON — Serie 270 · Marcos ==============
    {"url": "https://www.leroymerlin.es/productos/marco-individual-simon-270-blanco-85164288.html",       "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 270", "color": "Blanco",  "tipo": "Individual"},
    {"url": "https://www.leroymerlin.es/productos/marco-individual-simon-270-negro-mate-85164293.html",   "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 270", "color": "Negro",   "tipo": "Individual"},
    {"url": "https://www.leroymerlin.es/productos/marco-individual-simon-270-color-bronce-83411685.html", "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 270", "color": "Bronce",  "tipo": "Individual"},
    {"url": "https://www.leroymerlin.es/productos/marco-doble-simon-270-blanco-85164289.html",            "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 270", "color": "Blanco",  "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/marco-doble-simon-270-negro-mate-85164300.html",        "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 270", "color": "Negro",   "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/marco-doble-combinable-simon-270-color-bronce-83411689.html", "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 270", "color": "Bronce", "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/marco-triple-simon-270-blanco-85164290.html",           "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 270", "color": "Blanco",  "tipo": "Triple"},
    {"url": "https://www.leroymerlin.es/productos/marco-triple-simon-270-negro-mate-85164301.html",       "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 270", "color": "Negro",   "tipo": "Triple"},
    {"url": "https://www.leroymerlin.es/productos/marco-triple-simon-270-color-bronce-83411692.html",     "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 270", "color": "Bronce",  "tipo": "Triple"},

    # ============== SIMON — Serie 270 · Enchufes ==============
    {"url": "https://www.leroymerlin.es/productos/enchufe-simon-270-blanco-85164181.html",                              "brand": "Simon", "family": "mecanismos", "subcategoria": "Enchufes", "gama": "Serie 270", "color": "Blanco"},
    {"url": "https://www.leroymerlin.es/productos/enchufe-con-toma-de-tierra-simon-270-negro-mate-85164195.html",       "brand": "Simon", "family": "mecanismos", "subcategoria": "Enchufes", "gama": "Serie 270", "color": "Negro"},
    {"url": "https://www.leroymerlin.es/productos/enchufe-clean-con-toma-de-tierra-simon-270-color-oro-83411570.html",  "brand": "Simon", "family": "mecanismos", "subcategoria": "Enchufes", "gama": "Serie 270", "color": "Bronce"},

    # ============== SIMON — Serie 270 · Interruptores ==============
    {"url": "https://www.leroymerlin.es/productos/interruptor-conmutador-simon-s270-blanco-85164262.html",     "brand": "Simon", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Serie 270", "color": "Blanco", "tipo": "Conmutador"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-conmutador-simon-s270-negro-mate-85164212.html", "brand": "Simon", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Serie 270", "color": "Negro",  "tipo": "Conmutador"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-conmutador-simon-270-color-oro-83411651.html",   "brand": "Simon", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Serie 270", "color": "Bronce", "tipo": "Conmutador"},
    {"url": "https://www.leroymerlin.es/productos/conmutador-doble-simon-s270-blanco-85164277.html",           "brand": "Simon", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Serie 270", "color": "Blanco", "tipo": "Conmutador doble"},
    {"url": "https://www.leroymerlin.es/productos/cruzamiento-simon-s270-negro-mate-85164241.html",            "brand": "Simon", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Serie 270", "color": "Negro",  "tipo": "Cruzamiento"},

    # ============== SIMON — Serie 31 · Marcos ==============
    {"url": "https://www.leroymerlin.es/productos/marco-individual-simon-31-blanco-12842312.html", "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 31", "color": "Blanco", "tipo": "Individual"},
    {"url": "https://www.leroymerlin.es/productos/marco-doble-simon-31-blanco-14807996.html",      "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 31", "color": "Blanco", "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/marco-triple-simon-31-blanco-14808003.html",     "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 31", "color": "Blanco", "tipo": "Triple"},
    {"url": "https://www.leroymerlin.es/productos/marco-individual-simon-31-marfil-14808024.html", "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 31", "color": "Marfil", "tipo": "Individual"},
    {"url": "https://www.leroymerlin.es/productos/marco-doble-simon-31-marfil-14808031.html",      "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 31", "color": "Marfil", "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/marco-triple-simon-31-marfil-14808045.html",     "brand": "Simon", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Serie 31", "color": "Marfil", "tipo": "Triple"},

    # ============== SIMON — Serie 31 · Enchufes ==============
    {"url": "https://www.leroymerlin.es/productos/enchufe-con-toma-de-tierra-simon-31-blanco-14807401.html", "brand": "Simon", "family": "mecanismos", "subcategoria": "Enchufes", "gama": "Serie 31", "color": "Blanco"},
    {"url": "https://www.leroymerlin.es/productos/enchufe-con-toma-de-tierra-simon-31-marfil-14807772.html", "brand": "Simon", "family": "mecanismos", "subcategoria": "Enchufes", "gama": "Serie 31", "color": "Marfil"},

    # ============== SIMON — Serie 31 · Interruptores ==============
    {"url": "https://www.leroymerlin.es/productos/interruptor-simon-31-blanco-14807352.html",       "brand": "Simon", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Serie 31", "color": "Blanco", "tipo": "Conmutador"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-simon-31-marfil-14807485.html",       "brand": "Simon", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Serie 31", "color": "Marfil", "tipo": "Conmutador"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-doble-simon-31-blanco-14807366.html", "brand": "Simon", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Serie 31", "color": "Blanco", "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-doble-simon-31-marfil-14807492.html", "brand": "Simon", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Serie 31", "color": "Marfil", "tipo": "Doble"},

    # ============== SCHNEIDER — Miluz · Marcos ==============
    {"url": "https://www.leroymerlin.es/productos/marco-doble-schneider-electric-miluz-blanco-84388235.html",            "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Miluz", "color": "Blanco",     "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/marco-doble-schneider-electric-miluz-antracita-84388231.html",         "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Miluz", "color": "Antracita",  "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/marco-doble-schneider-electric-miluz-gris-plata-84388280.html",        "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Miluz", "color": "Gris-Plata", "tipo": "Doble"},
    {"url": "https://www.leroymerlin.es/productos/marco-vertical-triple-schneider-electric-miluz-blanco-84388246.html",  "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Miluz", "color": "Blanco",     "tipo": "Triple"},
    {"url": "https://www.leroymerlin.es/productos/marco-triple-schneider-electric-miluz-antracita-84388292.html",        "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Miluz", "color": "Antracita",  "tipo": "Triple"},
    {"url": "https://www.leroymerlin.es/productos/marco-triple-schneider-electric-miluz-gris-plata-84388281.html",       "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Miluz", "color": "Gris-Plata", "tipo": "Triple"},
    {"url": "https://www.leroymerlin.es/productos/marco-cuadruple-schneider-electric-miluz-blanco-84388237.html",        "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Miluz", "color": "Blanco",     "tipo": "Cuádruple"},
    {"url": "https://www.leroymerlin.es/productos/marco-cuadruple-schneider-electric-miluz-antracita-84388230.html",     "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Miluz", "color": "Antracita",  "tipo": "Cuádruple"},
    {"url": "https://www.leroymerlin.es/productos/marco-cuadruple-schneider-electric-miluz-gris-plata-84388279.html",    "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Marcos", "gama": "Miluz", "color": "Gris-Plata", "tipo": "Cuádruple"},

    # ============== SCHNEIDER — Miluz · Enchufes ==============
    {"url": "https://www.leroymerlin.es/productos/enchufe-con-toma-de-tierra-schneider-electric-miluz-blanco-84388218.html", "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Enchufes", "gama": "Miluz", "color": "Blanco"},
    {"url": "https://www.leroymerlin.es/productos/enchufe-schuko-schneider-miluz-antracita-84388282.html",                  "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Enchufes", "gama": "Miluz", "color": "Antracita"},

    # ============== SCHNEIDER — Miluz · Interruptores ==============
    {"url": "https://www.leroymerlin.es/productos/conmutador-schneider-electric-miluz-blanco-82952489.html",     "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Miluz", "color": "Blanco",    "tipo": "Conmutador"},
    {"url": "https://www.leroymerlin.es/productos/cruzamiento-schneider-electric-miluz-blanco-84388242.html",    "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Miluz", "color": "Blanco",    "tipo": "Cruzamiento"},
    {"url": "https://www.leroymerlin.es/productos/cruzamiento-schneider-electric-miluz-antracita-84388229.html", "brand": "Schneider Electric", "family": "mecanismos", "subcategoria": "Interruptores", "gama": "Miluz", "color": "Antracita", "tipo": "Cruzamiento"},

    # ============== SCHNEIDER — R9 Magnetotérmicos ==============
    {"url": "https://www.leroymerlin.es/productos/magnetotermico-bipolar-10a-r9-schneider-85804237.html",            "brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "R9", "intensidad": "10A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-bipolar-16a-r9-schneider-85804239.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "R9", "intensidad": "16A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-bipolar-20a-r9-schneider-85804242.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "R9", "intensidad": "20A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-bipolar-25a-r9-schneider-85804244.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "R9", "intensidad": "25A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-bipolar-32a-r9-schneider-85804245.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "R9", "intensidad": "32A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-bipolar-schneider-40a-r9-85804248.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "R9", "intensidad": "40A", "modulos": "2"},

    # ============== SCHNEIDER — iK60N Magnetotérmicos ==============
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-schneider-1p-n-2-modulos-10a-mn-85818289.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "iK60N", "intensidad": "10A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-schneider-1p-n-2-modulos-16a-mn-85818290.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "iK60N", "intensidad": "16A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-schneider-1p-n-2-modulos-20a-mn-85818291.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "iK60N", "intensidad": "20A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-schneider-1p-n-2-modulos-25a-mn-85818292.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "iK60N", "intensidad": "25A", "modulos": "2"},

    # ============== SCHNEIDER — R9 Diferenciales ==============
    {"url": "https://www.leroymerlin.es/productos/diferencial-bipolar-40a-r9-schneider-electric-85804249.html",  "brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Diferenciales", "gama": "R9", "intensidad": "40A"},
    {"url": "https://www.leroymerlin.es/productos/diferencial-bipolar-25a-30ma-r9-schneide-87469315.html",       "brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Diferenciales", "gama": "R9", "intensidad": "25A"},
    # iLDK
    {"url": "https://www.leroymerlin.es/productos/diferencial-schneider-2p-40a-30ma-ac-mn-85725841.html",        "brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Diferenciales", "gama": "iLDK", "intensidad": "40A"},

    # ============== SCHNEIDER — iC40F ==============
    {"url": "https://www.leroymerlin.es/productos/interruptor-magneto-termico-1p-n-10a-schneider-electric-91799418.html", "brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "iC40F", "intensidad": "10A", "modulos": "2"},

    # ============== SCHNEIDER — iDPN ==============
    {"url": "https://www.leroymerlin.es/productos/interruptor-magneto-termico-schneider-electric-1p-n-dpn-16a-15395562.html",                "brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "iDPN", "intensidad": "16A", "modulos": "1"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-schneider-electric-1p-n-dpn-20a-15395576.html",                "brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "iDPN", "intensidad": "20A", "modulos": "1"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-schneider-electric-1p-n-dpn-25a-15395583.html",                "brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "iDPN", "intensidad": "25A", "modulos": "1"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-schneider-de-32a-con-1-modulos-19439966.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "iDPN", "intensidad": "32A", "modulos": "1"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-schneider-de-con-1-modulos-19440001.html",   "brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "iDPN", "intensidad": "40A", "modulos": "1"},

    # ============== SCHNEIDER — SPU Sobretensiones ==============
    {"url": "https://www.leroymerlin.es/productos/limitador-sobretensiones-permanentes-y-transitorias-p-n-25a-15395681.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Sobretensiones", "gama": "SPU", "intensidad": "25A"},
    {"url": "https://www.leroymerlin.es/productos/limitador-sobretensiones-permanentes-y-transitorias-f-n-40a-15395695.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Sobretensiones", "gama": "SPU", "intensidad": "40A"},

    # SCHNEIDER — Diferencial Autorrearmable
    {"url": "https://www.leroymerlin.es/productos/diferencial-rearmable-40a-schneider-electric-85715249.html","brand": "Schneider Electric", "family": "proteccion", "subcategoria": "Diferenciales", "gama": "SPU", "intensidad": "40A", "autorrearmable": True},

    # ============== HAGER — Diferenciales ==============
    {"url": "https://www.leroymerlin.es/productos/diferencial-bipolar-hager-40a-13835283.html",         "brand": "Hager", "family": "proteccion", "subcategoria": "Diferenciales", "gama": "Bipolar", "intensidad": "40A"},
    {"url": "https://www.leroymerlin.es/productos/diferencial-bipolar-hager-25a-13835276.html",         "brand": "Hager", "family": "proteccion", "subcategoria": "Diferenciales", "gama": "Bipolar", "intensidad": "25A"},
    {"url": "https://www.leroymerlin.es/productos/diferencial-bipolar-rearmable-hager-40a-15627192.html","brand": "Hager", "family": "proteccion", "subcategoria": "Diferenciales", "gama": "Bipolar", "intensidad": "40A", "autorrearmable": True},

    # ============== HAGER — Magnetotérmicos 2 módulos ==============
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-hager-de-10a-con-2-modulos-19435003.html","brand": "Hager", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Unipolar+Neutro", "intensidad": "10A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-hager-de-16a-con-2-modulos-19435024.html","brand": "Hager", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Unipolar+Neutro", "intensidad": "16A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-hager-de-20a-con-2-modulos-19435031.html","brand": "Hager", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Unipolar+Neutro", "intensidad": "20A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-hager-de-25a-con-2-modulos-19435052.html","brand": "Hager", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Unipolar+Neutro", "intensidad": "25A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-hager-de-32a-con-2-modulos-19435066.html","brand": "Hager", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Unipolar+Neutro", "intensidad": "32A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-hager-de-con-2-modulos-19435094.html",   "brand": "Hager", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Unipolar+Neutro", "intensidad": "40A", "modulos": "2"},

    # ============== HAGER — Magnetotérmicos 1 módulo ==============
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-hager-de-10a-con-1-modulos-13835052.html","brand": "Hager", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Unipolar+Neutro", "intensidad": "10A", "modulos": "1"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-hager-de-16a-con-1-modulos-13835080.html","brand": "Hager", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Unipolar+Neutro", "intensidad": "16A", "modulos": "1"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-hager-de-20a-con-1-modulos-13835122.html","brand": "Hager", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Unipolar+Neutro", "intensidad": "20A", "modulos": "1"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-unipolar-neutro-hager-de-25a-con-1-modulos-13835136.html","brand": "Hager", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Unipolar+Neutro", "intensidad": "25A", "modulos": "1"},

    # ============== HAGER — Sobretensiones ==============
    {"url": "https://www.leroymerlin.es/productos/limitador-sobretensiones-permanentes-transitorias-hager-40a-19466300.html","brand": "Hager", "family": "proteccion", "subcategoria": "Sobretensiones", "gama": "SPN", "intensidad": "40A"},
    {"url": "https://www.leroymerlin.es/productos/limitador-sobretensiones-permanentes-transitorias-hager-25a-19466293.html","brand": "Hager", "family": "proteccion", "subcategoria": "Sobretensiones", "gama": "SPN", "intensidad": "25A"},

    # ============== CHINT — Diferenciales ==============
    {"url": "https://www.leroymerlin.es/productos/diferencial-bipolar-chint-25a-16634590.html",                          "brand": "Chint", "family": "proteccion", "subcategoria": "Diferenciales", "gama": "Bipolar", "intensidad": "25A"},
    {"url": "https://www.leroymerlin.es/productos/diferencial-chint-40a-16634611.html",                                  "brand": "Chint", "family": "proteccion", "subcategoria": "Diferenciales", "gama": "Bipolar", "intensidad": "40A"},
    {"url": "https://www.leroymerlin.es/productos/diferencial-bipolar-chint-25a-de-alta-sensibilidad-16634660.html",     "brand": "Chint", "family": "proteccion", "subcategoria": "Diferenciales", "gama": "Bipolar", "intensidad": "25A", "alta_sensibilidad": True},
    {"url": "https://www.leroymerlin.es/productos/diferencial-bipolar-chint-40a-de-alta-sensibilidad-16634646.html",     "brand": "Chint", "family": "proteccion", "subcategoria": "Diferenciales", "gama": "Bipolar", "intensidad": "40A", "alta_sensibilidad": True},

    # ============== CHINT — Magnetotérmicos 2 módulos ==============
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-chint-bipolar-10a-16634261.html","brand": "Chint", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Bipolar", "intensidad": "10A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-chint-bipolar-16a-16634275.html","brand": "Chint", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Bipolar", "intensidad": "16A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-chint-bipolar-20a-16634282.html","brand": "Chint", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Bipolar", "intensidad": "20A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-chint-bipolar-25a-16634296.html","brand": "Chint", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Bipolar", "intensidad": "25A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-chint-bipolar-32a-16634310.html","brand": "Chint", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Bipolar", "intensidad": "32A", "modulos": "2"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-chint-bipolar-40a-16634331.html","brand": "Chint", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "Bipolar", "intensidad": "40A", "modulos": "2"},

    # ============== CHINT — Magnetotérmicos 1 módulo ==============
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-chint-1p-n-10a-16374624.html","brand": "Chint", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "1P+N", "intensidad": "10A", "modulos": "1"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-chint-1p-n-16a-16374631.html","brand": "Chint", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "1P+N", "intensidad": "16A", "modulos": "1"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-chint-1p-n-20a-16374645.html","brand": "Chint", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "1P+N", "intensidad": "20A", "modulos": "1"},
    {"url": "https://www.leroymerlin.es/productos/interruptor-magnetotermico-chint-1p-n-25a-16374652.html","brand": "Chint", "family": "proteccion", "subcategoria": "Magnetotérmicos", "gama": "1P+N", "intensidad": "25A", "modulos": "1"},
]
