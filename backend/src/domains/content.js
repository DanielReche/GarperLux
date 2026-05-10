const { getDb } = require('../db');
const { readJson } = require('../http');
const { ok, created, noContent, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');
const { productDto, productSelect } = require('./catalog');

function tryParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function tutorialDto(row) {
  return {
    ...row,
    relatedProductSkus: tryParse(row.related_product_skus, []),
    content: tryParse(row.content_json, {}),
    hasVideo: Boolean(row.has_video),
  };
}

function helpCategoryDto(row, articleCount = 0) {
  return {
    slug: row.slug,
    name: row.name,
    shortLabel: row.short_label,
    description: row.description,
    iconSvg: row.icon_svg,
    accent: row.accent,
    sortOrder: row.sort_order,
    articleCount,
  };
}

function helpArticleDto(row) {
  return {
    slug: row.slug,
    categorySlug: row.category_slug,
    question: row.question,
    answerHtml: row.answer_html,
    keywords: row.keywords,
    sortOrder: row.sort_order,
    featured: Boolean(row.featured),
  };
}

// Normaliza para búsqueda: minúsculas, sin acentos, sin signos.
function normalizeForSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokeniza una query: separa por espacios, descarta tokens cortos.
function tokenize(query) {
  return normalizeForSearch(query)
    .split(' ')
    .filter((tok) => tok.length >= 2);
}

// Stem español muy ligero: quita sufijos comunes para que "devolver" empareje
// "devolución" y "devuelvo". No usamos un stemmer completo porque la cantidad
// de FAQs es pequeña — un stem corto cubre los falsos negativos típicos.
function stem(token) {
  if (token.length <= 4) return token;
  const suffixes = ['amientos', 'imientos', 'amiento', 'imiento', 'ciones', 'cion', 'mente',
                    'aciones', 'iciones', 'ados', 'idos', 'adas', 'idas', 'aban', 'iendo',
                    'ando', 'arse', 'erse', 'irse', 'ería', 'eria', 'osos', 'osas', 'oso', 'osa',
                    'ar', 'er', 'ir', 'an', 'en', 'as', 'es', 'os', 'a', 'e', 'o', 's'];
  for (const suf of suffixes) {
    if (token.endsWith(suf) && token.length - suf.length >= 4) {
      return token.slice(0, -suf.length);
    }
  }
  return token;
}

// Calcula un score simple por artículo. La pregunta pesa más que la respuesta;
// las keywords pesan medio. Pedimos que TODOS los tokens aparezcan en algún
// campo (vía stem) para que "no entrega" no devuelva "no devolución".
function scoreArticle(article, tokens) {
  const haystacks = {
    question: normalizeForSearch(article.question),
    keywords: normalizeForSearch(article.keywords),
    answer: normalizeForSearch(article.answer_html.replace(/<[^>]+>/g, ' ')),
  };
  const weights = { question: 50, keywords: 25, answer: 10 };
  let score = 0;
  let matched = 0;
  for (const tok of tokens) {
    const stemTok = stem(tok);
    let tokenMatched = false;
    for (const [field, text] of Object.entries(haystacks)) {
      // Match completo (más fuerte) o por stem (más débil).
      let hit = false;
      let weightFactor = 1;
      if (text.includes(tok)) {
        hit = true;
        const boundary = new RegExp(`(^|\\s)${tok.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`).test(text);
        weightFactor = boundary ? 1 : 0.5;
      } else if (stemTok !== tok && text.includes(stemTok)) {
        hit = true;
        weightFactor = 0.6; // match por raíz: penalizado
      }
      if (!hit) continue;
      tokenMatched = true;
      score += weights[field] * weightFactor;
    }
    if (tokenMatched) matched++;
  }
  if (matched < tokens.length) {
    const ratio = matched / tokens.length;
    if (ratio < 0.5) return 0;
    score *= ratio;
  }
  // Bonus si la query exacta aparece en la pregunta (frase entera).
  const fullQuery = tokens.join(' ');
  if (haystacks.question.includes(fullQuery)) score += 200;
  return score;
}

function registerContentRoutes(router) {
  // FAQ / Centro de ayuda — endpoints públicos.
  router.get('/api/public/faqs', (_req, res) => {
    const db = getDb();
    const categories = db.prepare('SELECT * FROM help_categories ORDER BY sort_order, id').all();
    const articles = db.prepare(`
      SELECT help_articles.*, help_categories.slug AS category_slug
      FROM help_articles
      JOIN help_categories ON help_categories.id = help_articles.category_id
      ORDER BY help_articles.sort_order, help_articles.id
    `).all();
    const byCategoryId = new Map();
    for (const a of articles) {
      if (!byCategoryId.has(a.category_id)) byCategoryId.set(a.category_id, []);
      byCategoryId.get(a.category_id).push(helpArticleDto(a));
    }
    const result = categories.map((c) => ({
      ...helpCategoryDto(c, (byCategoryId.get(c.id) || []).length),
      articles: byCategoryId.get(c.id) || [],
    }));
    return ok(res, result);
  });

  router.get('/api/public/faqs/categories', (_req, res) => {
    const rows = getDb().prepare(`
      SELECT help_categories.*, (
        SELECT COUNT(*) FROM help_articles WHERE help_articles.category_id = help_categories.id
      ) AS article_count
      FROM help_categories
      ORDER BY sort_order, id
    `).all();
    return ok(res, rows.map((row) => helpCategoryDto(row, Number(row.article_count) || 0)));
  });

  router.get('/api/public/faqs/categories/:slug', (_req, res, { params }) => {
    const db = getDb();
    const category = db.prepare('SELECT * FROM help_categories WHERE slug = ?').get(params.slug);
    if (!category) return fail(res, 404, 'CATEGORY_NOT_FOUND', 'Categoría de ayuda no encontrada.');
    const articles = db.prepare(`
      SELECT help_articles.*, ? AS category_slug
      FROM help_articles
      WHERE category_id = ?
      ORDER BY sort_order, id
    `).all(category.slug, category.id);
    return ok(res, {
      ...helpCategoryDto(category, articles.length),
      articles: articles.map(helpArticleDto),
    });
  });

  router.get('/api/public/faqs/search', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const raw = (url.searchParams.get('q') || '').trim();
    const categoryFilter = (url.searchParams.get('category') || '').trim();
    const tokens = tokenize(raw);
    if (!tokens.length) {
      return ok(res, { query: raw, normalized: '', tokens: [], total: 0, results: [] });
    }
    const db = getDb();
    let articleRows;
    if (categoryFilter) {
      articleRows = db.prepare(`
        SELECT help_articles.*, help_categories.slug AS category_slug, help_categories.name AS category_name
        FROM help_articles
        JOIN help_categories ON help_categories.id = help_articles.category_id
        WHERE help_categories.slug = ?
        ORDER BY help_articles.sort_order, help_articles.id
      `).all(categoryFilter);
    } else {
      articleRows = db.prepare(`
        SELECT help_articles.*, help_categories.slug AS category_slug, help_categories.name AS category_name
        FROM help_articles
        JOIN help_categories ON help_categories.id = help_articles.category_id
        ORDER BY help_articles.sort_order, help_articles.id
      `).all();
    }
    const scored = articleRows
      .map((row) => ({ row, score: scoreArticle(row, tokens) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    const results = scored.map(({ row, score }) => ({
      ...helpArticleDto(row),
      categoryName: row.category_name,
      score: Math.round(score * 10) / 10,
    }));
    return ok(res, {
      query: raw,
      normalized: normalizeForSearch(raw),
      tokens,
      total: results.length,
      results,
    });
  });

  router.get('/api/content/tutorials', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM tutorials ORDER BY published_at DESC, title').all();
    return ok(res, rows.map(tutorialDto));
  });

  router.get('/api/content/tips', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM tips ORDER BY number ASC').all();
    const tips = rows.map((row) => ({
      number: row.number,
      category: row.category,
      body: row.body,
      author: row.author,
      authorInitials: row.author_initials,
      publishedAt: row.published_at,
      dark: Boolean(row.dark),
    }));
    // Conteos por categoría para alimentar los chips de filtro sin doble vuelta.
    const byCategory = {};
    for (const t of tips) byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    return ok(res, { total: tips.length, byCategory, tips });
  });

  router.get('/api/content/tutorials/:slug', (_req, res, { params }) => {
    const row = getDb().prepare('SELECT * FROM tutorials WHERE slug = ?').get(params.slug);
    if (!row) return fail(res, 404, 'TUTORIAL_NOT_FOUND', 'Tutorial no encontrado.');
    const dto = tutorialDto(row);
    // Resolvemos el kit del tutorial (productos referenciados por SKU). Lo hacemos
    // en backend para que la página no tenga que hacer fetch de cada producto suelto.
    let kit = [];
    if (dto.relatedProductSkus.length) {
      const skuPlaceholders = dto.relatedProductSkus.map(() => '?').join(',');
      kit = getDb()
        .prepare(`${productSelect()} WHERE products.sku IN (${skuPlaceholders})`)
        .all(...dto.relatedProductSkus)
        .map(productDto);
      // Reordena según el orden definido en related_product_skus para que el primero
      // que ve el usuario sea el "principal" del tutorial.
      const order = new Map(dto.relatedProductSkus.map((sku, i) => [sku, i]));
      kit.sort((a, b) => (order.get(a.sku) ?? 99) - (order.get(b.sku) ?? 99));
    }
    return ok(res, { ...dto, kit });
  });

  router.get('/api/account/saved-tutorials', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const rows = getDb().prepare(`
      SELECT tutorials.*, saved_tutorials.progress, saved_tutorials.notes, saved_tutorials.saved_at
      FROM saved_tutorials
      JOIN tutorials ON tutorials.id = saved_tutorials.tutorial_id
      WHERE saved_tutorials.user_id = ?
      ORDER BY saved_tutorials.saved_at DESC
    `).all(user.id);
    return ok(res, rows.map(tutorialDto));
  });

  router.post('/api/account/saved-tutorials/:slug', async (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const tutorial = getDb().prepare('SELECT id FROM tutorials WHERE slug = ?').get(params.slug);
    if (!tutorial) return fail(res, 404, 'TUTORIAL_NOT_FOUND', 'Tutorial no encontrado.');
    const payload = await readJson(req).catch(() => ({}));
    getDb().prepare(`
      INSERT INTO saved_tutorials (user_id, tutorial_id, progress, notes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, tutorial_id) DO UPDATE SET
        progress = excluded.progress,
        notes = excluded.notes,
        saved_at = CURRENT_TIMESTAMP
    `).run(user.id, tutorial.id, payload.progress || 0, payload.notes || null);
    return created(res, { slug: params.slug, progress: payload.progress || 0 });
  });

  router.delete('/api/account/saved-tutorials/:slug', (req, res, { params }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    getDb().prepare(`
      DELETE FROM saved_tutorials
      WHERE user_id = ? AND tutorial_id IN (SELECT id FROM tutorials WHERE slug = ?)
    `).run(user.id, params.slug);
    return noContent(res);
  });
}

module.exports = { registerContentRoutes };
