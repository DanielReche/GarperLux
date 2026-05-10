/* GarperLux — motor de búsqueda interno (cliente).
 *
 * Reglas que aplica:
 *
 *  1. Normaliza el texto: NFD (sin acentos), minúsculas, sin signos.
 *  2. Diccionario de SINÓNIMOS de no-experto -> término técnico, así un
 *     usuario que escribe "rosca gorda" encuentra "casquillo E27".
 *  3. Tokeniza: separa por espacios, guiones, puntos y barras y quita
 *     stopwords. Mantiene también la cadena completa por si la query
 *     coincide tal cual con un nombre o un SKU.
 *  4. Detección de SKU/EAN: secuencias alfanuméricas de >=4 chars con o
 *     sin guiones se tratan como tokens "fuertes" (matching exacto).
 *  5. Campos buscados con peso decreciente:
 *        nombre > sku > marca > categoría > specs > descripción
 *     (productos también se evalúan contra `_documents` y `_source`).
 *  6. Bonificaciones:
 *        - Frase exacta en el nombre: +400
 *        - Token coincide al principio de palabra en el nombre: +60
 *        - Cobertura de tokens: TODOS los tokens han de aparecer en
 *          algún campo del item, si no, score = 0 (impide ruido).
 *        - Producto con stock>0: +5
 *        - Marca oficial: +5
 *  7. Búsqueda multi-tipo: productos, tutoriales, marcas, categorías,
 *     servicios y FAQs (tutoriales y productos vienen del backend; el
 *     resto son catálogos estáticos definidos abajo).
 *  8. Resaltado: marca los tokens encontrados envolviéndolos en <mark>.
 *
 * Uso:
 *   const engine = window.GarperLuxSearch;
 *   await engine.warmUp();          // (opcional) precarga catálogos
 *   const results = await engine.run('rosca gorda 12 watts');
 *   // -> { query, normalized, tokens, total, byType, results: [...] }
 */
(function () {
  'use strict';

  // ------- 1. Normalización -------------------------------------------------

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')   // quita diacríticos
      .replace(/[º°ª·]/g, ' ')           // signos raros
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ------- 2. Diccionario de sinónimos de no-experto ------------------------
  //
  // Cada entrada mapea una palabra/frase coloquial al término técnico.
  // Se aplica DESPUÉS de normalizar y ANTES de tokenizar, para que la frase
  // expandida participe en el matching. Ejemplo: "bombilla rosca gorda" ->
  // "bombilla casquillo e27", que ya encuentra LED-A60-9W-2700K.

  const SYNONYMS = [
    // Casquillos
    [['rosca gorda', 'rosca grande', 'rosca normal'], 'casquillo e27'],
    [['rosca fina', 'rosca pequeña', 'rosca pequena'], 'casquillo e14'],
    [['casquillo gordo'], 'casquillo e27'],
    [['casquillo fino'], 'casquillo e14'],
    [['rosca'], 'casquillo'],

    // Iluminación: temperatura
    [['luz calida', 'luz cálida', 'tono calido', 'amarillenta', 'amarilla', 'amarillento'], '2700k calida'],
    [['luz fria', 'luz fría', 'blanca fria', 'azulada'], '6500k fria'],
    [['luz neutra', 'luz natural'], '4000k neutra'],

    // Iluminación: tipos
    [['fluorescente', 'tubo fluorescente', 'pantalla fluorescente'], 'tubo led'],
    [['halogeno', 'halógeno', 'bombilla halogena'], 'led'],
    [['incandescente'], 'led'],
    [['plafon', 'plafón', 'plafones'], 'plafon led'],
    [['tira led', 'tira de led', 'tira de luces'], 'tira led'],
    [['foco', 'focos'], 'proyector led'],
    [['downlight', 'down light', 'empotrable'], 'downlight led'],

    // Mecanismos
    [['enchufe gordo', 'enchufe normal', 'enchufe europeo'], 'enchufe schuko'],
    [['enchufe pequeno', 'enchufe pequeño', 'enchufe redondo'], 'enchufe bipolar'],
    [['ladron', 'ladrón'], 'regleta'],
    [['regleta enchufes'], 'regleta'],
    [['interruptor doble'], 'doble interruptor'],
    [['interruptor con luz'], 'interruptor luminoso'],
    [['conmutado', 'tres vias', 'tres vías', 'cruzado'], 'conmutador cruzamiento'],
    [['mecanismo'], 'interruptor enchufe'],

    // Síntomas / averías
    [['chisporrotea', 'chispas', 'chispea', 'chispazo', 'chispazos', 'echa chispas'], 'interruptor defectuoso averia'],
    [['no enciende', 'se ha estropeado', 'se rompio', 'se rompió', 'no funciona'], 'averia reparacion'],
    [['salta la luz', 'salta el cuadro', 'salta el plomo', 'saltan los plomos', 'salta el general'], 'diferencial magnetotermico'],
    [['quema fusible', 'fusible quemado'], 'fusible magnetotermico'],
    [['huele a quemado'], 'urgencia averia'],

    // Protección eléctrica
    [['plomos', 'fusibles', 'plomo'], 'magnetotermico fusible'],
    [['automatico', 'automático'], 'magnetotermico'],
    [['diferencial 30 ma', 'diferencial 30ma'], 'diferencial 30ma'],
    [['cuadro electrico', 'cuadro eléctrico', 'cuadro de luz'], 'cuadro electrico'],

    // Porteros / videoporteros
    [['video portero', 'video-portero', 'videoportero'], 'videoportero'],
    [['portero electrico', 'portero eléctrico', 'telefonillo', 'interfono'], 'portero telefonillo'],
    [['abrepuertas', 'abre puertas', 'abre-puertas'], 'abrepuertas'],

    // Domótica
    [['casa inteligente', 'smart home', 'smarthome'], 'domotica'],
    [['enchufe wifi', 'enchufe inteligente'], 'enchufe wifi'],
    [['bombilla inteligente', 'bombilla wifi'], 'bombilla inteligente'],
    [['camara wifi', 'cámara wifi', 'camara seguridad', 'cámara seguridad'], 'camara wifi'],

    // Automatismos
    [['puerta garaje', 'puerta de garaje', 'motor garaje', 'motor de garaje'], 'automatismo motor'],
    [['mando garaje', 'mando de garaje'], 'mando emisor'],
    [['fotocelula', 'fotocélula'], 'fotocelula'],
    [['barrera parking'], 'barrera automatica'],

    // Cableado
    [['cable normal', 'cable de luz'], 'cable libre halogenos'],
    [['cable gordo'], 'cable 6mm 10mm'],
    [['cable manguera', 'manguera'], 'manguera 3x'],

    // Antenas
    [['antena tdt', 'antena tele', 'antena television'], 'antena tdt uhf'],

    // Marcas comunes mal escritas
    [['simon', 'simón'], 'simon simón'],
    [['niessen'], 'niessen'],
    [['bticino', 'bticcino', 'bticnio'], 'bticino'],
    [['leroy merlin'], 'leroy merlin'],
    [['shelly', 'sheli'], 'shelly'],
  ];

  function expandSynonyms(text) {
    let out = ' ' + text + ' ';
    for (const [keys, replacement] of SYNONYMS) {
      for (const k of keys) {
        const pattern = new RegExp(`(?<=\\s)${k.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?=\\s)`, 'g');
        if (pattern.test(out)) {
          out = out.replace(pattern, ` ${replacement} `);
        }
      }
    }
    return out.trim().replace(/\s+/g, ' ');
  }

  // ------- 3. Tokenización --------------------------------------------------

  // Stopwords cortas. Mantengo 'led', '12v', 'ip65' etc fuera porque son
  // tokens útiles del dominio.
  const STOP = new Set([
    'a', 'al', 'algun', 'alguna', 'algunas', 'alguno', 'algunos', 'ante',
    'cada', 'como', 'con', 'cuando', 'cuanto', 'de', 'del', 'donde', 'el',
    'en', 'entre', 'es', 'esa', 'ese', 'eso', 'esta', 'este', 'esto',
    'la', 'las', 'le', 'les', 'lo', 'los', 'mas', 'me', 'mi', 'no', 'o',
    'para', 'pero', 'por', 'que', 'se', 'si', 'sin', 'sobre', 'su', 'sus',
    'te', 'tu', 'un', 'una', 'unos', 'unas', 'y', 'ya',
  ]);

  function tokenize(text) {
    // Mantiene secuencias alfanuméricas y trozos de SKU como un solo token.
    // Tras NFD y sin signos extraños ya viene limpio.
    const raw = text
      .replace(/[^a-z0-9\-_./]+/g, ' ')
      .split(/[\s.\/]+/)
      .map((t) => t.replace(/^[-_]+|[-_]+$/g, ''))
      .filter(Boolean);
    const seen = new Set();
    const tokens = [];
    for (const t of raw) {
      if (STOP.has(t)) continue;
      if (t.length < 2) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      tokens.push(t);
      // Si es un SKU con guiones, también añade los componentes y la cadena
      // completa para emparejar tanto "27101-31" como "27101" o "31".
      if (/[-_]/.test(t)) {
        for (const part of t.split(/[-_]+/)) {
          if (part.length >= 3 && !seen.has(part)) {
            seen.add(part);
            tokens.push(part);
          }
        }
      }
    }
    return tokens;
  }

  // ------- 4. Catálogo estático: servicios, FAQs, páginas internas ---------

  const STATIC_INDEX = {
    services: [
      {
        title: 'Cambio o reparación urgente de interruptor o enchufe',
        excerpt: 'Si chisporrotea o calienta, vamos en menos de 4 h. Diagnóstico in situ y presupuesto cerrado.',
        href: '/pages/servicios/servicio.html?slug=averia-mecanismo',
        keywords: 'averia urgente interruptor enchufe chispas chisporrotea calor mecanismo',
        badges: ['Avería', 'Eléctrica'],
      },
      {
        title: 'Renovación completa de mecanismos en vivienda',
        excerpt: 'Cambio de gama antigua a actual con marcos coordinados. Presupuesto a medida.',
        href: '/pages/servicios/servicio.html?slug=renovacion-mecanismos',
        keywords: 'renovacion mecanismos cambio gama simon antigua marcos vivienda',
        badges: ['Instalación', 'Eléctrica'],
      },
      {
        title: 'Instalación de cargador para coche eléctrico',
        excerpt: 'Punto de recarga 7,4 kW o 22 kW con su línea independiente y certificado.',
        href: '/pages/servicios/servicio.html?slug=carga-vehiculo-electrico',
        keywords: 'cargador vehiculo electrico coche enchufe carga ev wallbox 22kw 7kw boletin',
        badges: ['Vehículo eléctrico'],
      },
      {
        title: 'Solicitar técnico — visita y diagnóstico',
        excerpt: 'Te asignamos un instalador autorizado de tu zona. Disponible para particulares y comunidades.',
        href: '/pages/servicios/solicitar-tecnico.html',
        keywords: 'solicitar tecnico instalador autorizado visita diagnostico ayuda',
        badges: ['Asistencia'],
      },
      {
        title: 'Mantenimiento eléctrico para comunidades y empresas',
        excerpt: 'Contratos anuales con visitas trimestrales y atención de incidencias.',
        href: '/pages/servicios/servicio.html?slug=mantenimiento-comunidades',
        keywords: 'mantenimiento comunidad empresa contrato anual visita incidencia preventivo',
        badges: ['Mantenimiento'],
      },
    ],

    faqs: [
      {
        title: '¿Vale un mecanismo Simón 27 con un marco de Niessen?',
        excerpt: 'Aunque el mecanismo encaja en cualquier caja universal de 60 mm, los marcos no son intercambiables.',
        href: '/pages/sistema/faqs.html#productos',
        keywords: 'simon niessen mecanismo marco compatible interruptor 27',
      },
      {
        title: '¿Cómo identifico la gama de mi interruptor actual?',
        excerpt: 'Mira la cara interna del marco. La gama suele estar grabada (Simón 27, 75, 82…).',
        href: '/pages/sistema/faqs.html#productos',
        keywords: 'gama interruptor marco identificar simon 27 75 82 reposicion',
      },
      {
        title: '¿Qué bombilla LED equivale a una halógena de 60W?',
        excerpt: 'Aproximadamente una LED de 9W es equivalente. Mira los lúmenes (810 lm) más que los vatios.',
        href: '/pages/sistema/faqs.html#iluminacion',
        keywords: 'bombilla led halogena equivalente vatios lumenes 60w 9w',
      },
      {
        title: '¿Puedo cambiar yo un magnetotérmico del cuadro?',
        excerpt: 'Solo si conoces el procedimiento de corte y verificación de ausencia de tensión. En instalaciones bajo BT solo está autorizado el titular o un instalador autorizado.',
        href: '/pages/sistema/faqs.html#proteccion',
        keywords: 'magnetotermico cuadro cambio diferencial proteccion baja tension instalador',
      },
      {
        title: '¿Cuál es la diferencia entre un magnetotérmico y un diferencial?',
        excerpt: 'El magnetotérmico te protege de cortocircuitos. El diferencial te protege a ti de calambres.',
        href: '/pages/sistema/faqs.html#proteccion',
        keywords: 'magnetotermico diferencial diferencia cortocircuito calambre proteccion',
      },
      {
        title: '¿Cómo programo un mando de garaje?',
        excerpt: 'Pulsa el botón de aprendizaje del receptor y, en 10 s, el botón del mando que quieras grabar.',
        href: '/pages/sistema/faqs.html#automatismos',
        keywords: 'mando garaje programar aprendizaje receptor automatismo emisor',
      },
    ],

    pages: [
      { title: 'Tienda — catálogo completo', href: '/pages/tienda/tienda.html', keywords: 'tienda catalogo todo material electrico' },
      { title: 'Aprender — Hazlo tú mismo', href: '/pages/aprender/hazlo-tu-mismo.html', keywords: 'aprender tutoriales hazlo tu mismo manuales diy' },
      { title: 'Servicios — pide ayuda', href: '/pages/servicios/servicios.html', keywords: 'servicios ayuda tecnico instalador' },
      { title: 'Solicitar técnico', href: '/pages/servicios/solicitar-tecnico.html', keywords: 'solicitar tecnico ayuda urgencia averia' },
      { title: 'Quiénes somos', href: '/pages/empresa/quienes-somos.html', keywords: 'empresa garperlux quienes somos jaen' },
      { title: 'Contacto', href: '/pages/empresa/contacto.html', keywords: 'contacto telefono direccion email' },
      { title: 'Mi cuenta', href: '/pages/cuenta/mi-cuenta.html', keywords: 'cuenta usuario perfil pedidos' },
    ],
  };

  // ------- 5. Pesos por campo -----------------------------------------------

  const FIELD_WEIGHTS = {
    name: 50,
    sku: 80,
    brand: 40,
    category: 30,
    spec: 20,
    description: 10,
    keywords: 25,
  };

  // ------- 6. Función de scoring por item -----------------------------------

  function scoreItem({ tokens, normalizedQuery, fields }) {
    let score = 0;
    const matchedTokens = new Set();
    let allFieldsText = '';
    const fieldNorms = {};

    for (const [name, raw] of Object.entries(fields)) {
      if (!raw) continue;
      const text = normalize(raw);
      fieldNorms[name] = text;
      allFieldsText += ' ' + text;
      const weight = FIELD_WEIGHTS[name] || 10;
      for (const tok of tokens) {
        if (!text.includes(tok)) continue;
        // Bonus si el token aparece en el inicio de palabra.
        const pattern = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`);
        const wordBoundary = pattern.test(text);
        score += weight * (wordBoundary ? 1 : 0.5);
        matchedTokens.add(tok);
      }
    }

    // Cobertura: si NO aparecen todos los tokens en algún campo, score = 0
    // para evitar resultados que solo emparejan 1 de 5 palabras.
    if (matchedTokens.size < tokens.length) {
      // Caso especial: si solo hay 1 token, basta con que se encuentre.
      // Con varios, exigimos que al menos el 60% aparezcan.
      const ratio = matchedTokens.size / tokens.length;
      if (ratio < 0.6) return 0;
      score *= ratio; // penaliza proporcional
    }

    // Frase exacta en el nombre
    if (fieldNorms.name && normalizedQuery && fieldNorms.name.includes(normalizedQuery)) {
      score += 400;
    }
    // Nombre empieza con el primer token
    if (fieldNorms.name && tokens[0] && fieldNorms.name.startsWith(tokens[0])) {
      score += 60;
    }

    return score;
  }

  // ------- 7. Resaltado de términos -----------------------------------------

  function highlight(text, tokens) {
    if (!text) return '';
    const safe = String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    if (!tokens.length) return safe;
    // Normaliza el texto y rastrea offsets para resaltar correctamente.
    const norm = normalize(text);
    const ranges = [];
    for (const tok of tokens) {
      let from = 0;
      while (true) {
        const idx = norm.indexOf(tok, from);
        if (idx === -1) break;
        ranges.push([idx, idx + tok.length]);
        from = idx + tok.length;
      }
    }
    if (!ranges.length) return safe;
    // Dado que normalize quita acentos pero mantiene longitudes, los offsets
    // sobre `text` original son coincidentes. Mezclamos por orden.
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [s, e] of ranges) {
      if (merged.length && s <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
      } else {
        merged.push([s, e]);
      }
    }
    let out = '';
    let cursor = 0;
    for (const [s, e] of merged) {
      out += safe.slice(cursor, s);
      out += `<mark>${safe.slice(s, e)}</mark>`;
      cursor = e;
    }
    out += safe.slice(cursor);
    return out;
  }

  // ------- 8. Carga de datos del backend ------------------------------------

  let _cache = null;

  async function loadCorpus() {
    if (_cache) return _cache;
    const api = window.GarperLuxApi;
    const [products, brands, categories, tutorialsRes] = await Promise.all([
      api.products({}).catch(() => []),
      api.brands().catch(() => []),
      fetch('/api/catalog/categories').then(r => r.json()).then(r => r.data).catch(() => []),
      fetch('/api/content/tutorials').then(r => r.json()).then(r => r.data).catch(() => []),
    ]);

    const tutorials = (tutorialsRes || []).map((t) => ({
      ...t,
      _index: {
        title: t.title || '',
        keywords: `${t.difficulty || ''} ${t.reviewer || ''}`,
        spec: t.related_product_skus || '',
      },
    }));

    _cache = { products, brands, categories, tutorials };
    return _cache;
  }

  function clearCache() { _cache = null; }

  // ------- 9. Búsqueda principal --------------------------------------------

  async function run(rawQuery, { typesEnabled = null } = {}) {
    const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const normalized = normalize(rawQuery);
    if (!normalized) {
      return { query: rawQuery, normalized: '', tokens: [], total: 0, byType: {}, results: [], elapsed_ms: 0 };
    }
    const expanded = expandSynonyms(normalized);
    const tokens = tokenize(expanded);
    const corpus = await loadCorpus();

    const results = [];

    // Productos
    if (!typesEnabled || typesEnabled.includes('product')) {
      for (const p of corpus.products) {
        const specs = p.specs || {};
        const specsText = Object.entries(specs)
          .filter(([k]) => !k.startsWith('_'))
          .map(([k, v]) => `${k} ${v}`).join(' ');
        const fields = {
          name: p.name || '',
          sku: p.sku || '',
          brand: p.brand?.name || '',
          category: p.category?.name || '',
          spec: specsText,
          description: p.description || '',
        };
        const sc = scoreItem({ tokens, normalizedQuery: expanded, fields });
        if (sc <= 0) continue;
        let bonus = 0;
        if (Number(p.stock) > 0) bonus += 5;
        if (p.brand?.isOfficial) bonus += 5;
        results.push({
          type: 'product',
          score: sc + bonus,
          item: p,
          matchedFields: Object.keys(fields).filter(k => fields[k] && tokens.some(t => normalize(fields[k]).includes(t))),
        });
      }
    }

    // Tutoriales — desde 2026-05-10 el corpus trae excerpt, category, content y
    // relatedProductSkus parseado. Indexamos también la categoría y el cuerpo de
    // intro para que "rosca gorda" (vía sinónimo a casquillo e27) encuentre los
    // tutoriales de iluminación, no solo los productos.
    if (!typesEnabled || typesEnabled.includes('tutorial')) {
      for (const t of corpus.tutorials) {
        const skuList = Array.isArray(t.relatedProductSkus) ? t.relatedProductSkus.join(' ')
                      : Array.isArray(t.related_product_skus) ? t.related_product_skus.join(' ')
                      : (typeof t.related_product_skus === 'string' ? t.related_product_skus : '');
        const introBody = t.content?.intro_paragraphs?.join(' ') || '';
        const heroSub = t.content?.hero_subtitle || '';
        // Incluye títulos y cuerpos de los pasos para que palabras técnicas como
        // "E27", "Schuko", "Wago", "halógena" que solo aparecen en el procedimiento
        // sean encontrables. Los pesos son menores (campo `spec`) para no
        // ahogar el ranking de matches por título.
        const stepText = (t.content?.steps || []).map(s => `${s.title || ''} ${s.body || ''}`).join(' ');
        const whyText = `${t.content?.why_section?.title || ''} ${t.content?.why_section?.body || ''} ${(t.content?.why_section?.bullets || []).join(' ')}`;
        const fields = {
          name: t.title || '',
          category: t.category || '',
          keywords: `${t.difficulty || ''} ${t.reviewer || ''} ${t.location || ''} ${skuList}`,
          description: t.excerpt || '',
          spec: `${heroSub} ${introBody} ${whyText} ${stepText}`.trim(),
        };
        const sc = scoreItem({ tokens, normalizedQuery: expanded, fields });
        if (sc <= 0) continue;
        results.push({ type: 'tutorial', score: sc, item: t });
      }
    }

    // Marcas
    if (!typesEnabled || typesEnabled.includes('brand')) {
      for (const b of corpus.brands) {
        const fields = {
          name: b.name || '',
          keywords: `${b.country || ''} ${(b.categories || []).join(' ')} ${b.description || ''}`,
        };
        const sc = scoreItem({ tokens, normalizedQuery: expanded, fields });
        if (sc <= 0) continue;
        results.push({ type: 'brand', score: sc + (b.isOfficial ? 5 : 0), item: b });
      }
    }

    // Categorías
    if (!typesEnabled || typesEnabled.includes('category')) {
      for (const c of corpus.categories) {
        const fields = {
          name: c.name || '',
          keywords: c.description || '',
        };
        const sc = scoreItem({ tokens, normalizedQuery: expanded, fields });
        if (sc <= 0) continue;
        results.push({ type: 'category', score: sc, item: c });
      }
    }

    // Servicios estáticos
    if (!typesEnabled || typesEnabled.includes('service')) {
      for (const s of STATIC_INDEX.services) {
        const fields = {
          name: s.title,
          keywords: `${s.keywords} ${(s.badges || []).join(' ')}`,
          description: s.excerpt,
        };
        const sc = scoreItem({ tokens, normalizedQuery: expanded, fields });
        if (sc <= 0) continue;
        results.push({ type: 'service', score: sc, item: s });
      }
    }

    // FAQs estáticas
    if (!typesEnabled || typesEnabled.includes('faq')) {
      for (const f of STATIC_INDEX.faqs) {
        const fields = {
          name: f.title,
          keywords: f.keywords,
          description: f.excerpt,
        };
        const sc = scoreItem({ tokens, normalizedQuery: expanded, fields });
        if (sc <= 0) continue;
        results.push({ type: 'faq', score: sc, item: f });
      }
    }

    // Páginas internas
    if (!typesEnabled || typesEnabled.includes('page')) {
      for (const pg of STATIC_INDEX.pages) {
        const fields = { name: pg.title, keywords: pg.keywords };
        const sc = scoreItem({ tokens, normalizedQuery: expanded, fields });
        if (sc <= 0) continue;
        results.push({ type: 'page', score: sc, item: pg });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const byType = {};
    for (const r of results) byType[r.type] = (byType[r.type] || 0) + 1;
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    return {
      query: rawQuery,
      normalized,
      expanded,
      tokens,
      total: results.length,
      byType,
      results,
      elapsed_ms: Math.round(elapsed * 100) / 100,
    };
  }

  window.GarperLuxSearch = {
    normalize,
    tokenize,
    expandSynonyms,
    highlight,
    run,
    warmUp: loadCorpus,
    clearCache,
    STATIC_INDEX,
  };
})();
