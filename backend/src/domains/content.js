const { getDb } = require('../db');
const { readJson } = require('../http');
const { ok, created, noContent, fail } = require('../response');
const { requireAuth } = require('../middleware/auth');

function registerContentRoutes(router) {
  // --- Tutorials ---
  router.get('/api/content/tutorials', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM tutorials ORDER BY title').all();
    return ok(res, rows.map((row) => ({
      ...row,
      hasVideo: Boolean(row.has_video),
      relatedProductSkus: JSON.parse(row.related_product_skus || '[]')
    })));
  });

  router.get('/api/content/tutorials/:slug', (_req, res, { params }) => {
    const row = getDb().prepare('SELECT * FROM tutorials WHERE slug = ?').get(params.slug);
    if (!row) return fail(res, 404, 'TUTORIAL_NOT_FOUND', 'Tutorial no encontrado.');

    const skus = JSON.parse(row.related_product_skus || '[]');
    const kit = [];
    if (skus.length > 0) {
      const placeholders = skus.map(() => '?').join(',');
      const products = getDb().prepare(`
        SELECT p.*, b.name AS brand_name
        FROM products p
        LEFT JOIN brands b ON b.id = p.brand_id
        WHERE p.sku IN (${placeholders})
      `).all(...skus);
      skus.forEach(sku => {
        const prod = products.find(p => p.sku === sku);
        if (prod) {
          kit.push({
            sku: prod.sku,
            name: prod.name,
            price: prod.price,
            stock: prod.stock,
            image: prod.image,
            brand: prod.brand_name
          });
        }
      });
    }

    return ok(res, {
      ...row,
      hasVideo: Boolean(row.has_video),
      relatedProductSkus: skus,
      content: JSON.parse(row.content_json || '{}'),
      kit
    });
  });

  // --- Tips (Consejos) ---
  router.get('/api/content/tips', (_req, res) => {
    const tips = getDb().prepare('SELECT * FROM tips ORDER BY number').all();
    return ok(res, {
      tips: tips.map(t => ({
        ...t,
        dark: Boolean(t.dark)
      })),
      total: tips.length
    });
  });

  // --- FAQs / Help Center ---
  router.get('/api/public/faqs', (_req, res) => {
    const categories = getDb().prepare('SELECT * FROM help_categories ORDER BY sort_order').all();
    const articles = getDb().prepare('SELECT * FROM help_articles ORDER BY sort_order').all();
    
    const data = categories.map(cat => {
      const catArticles = articles.filter(art => art.category_id === cat.id).map(art => ({
        id: art.id,
        slug: art.slug,
        question: art.question,
        answerHtml: art.answer_html,
        keywords: art.keywords,
        featured: Boolean(art.featured)
      }));
      return {
        id: cat.id,
        slug: cat.slug,
        name: cat.name,
        shortLabel: cat.short_label,
        description: cat.description,
        iconSvg: cat.icon_svg,
        accent: cat.accent,
        articleCount: catArticles.length,
        articles: catArticles
      };
    });
    return ok(res, data);
  });

  router.get('/api/public/faqs/categories', (_req, res) => {
    const categories = getDb().prepare('SELECT * FROM help_categories ORDER BY sort_order').all();
    const counts = getDb().prepare('SELECT category_id, COUNT(*) AS count FROM help_articles GROUP BY category_id').all();
    const data = categories.map(cat => {
      const countRow = counts.find(c => c.category_id === cat.id);
      return {
        id: cat.id,
        slug: cat.slug,
        name: cat.name,
        shortLabel: cat.short_label,
        description: cat.description,
        iconSvg: cat.icon_svg,
        accent: cat.accent,
        articleCount: countRow ? countRow.count : 0
      };
    });
    return ok(res, data);
  });

  router.get('/api/public/faqs/categories/:slug', (_req, res, { params }) => {
    const cat = getDb().prepare('SELECT * FROM help_categories WHERE slug = ?').get(params.slug);
    if (!cat) return fail(res, 404, 'CATEGORY_NOT_FOUND', 'Categoría no encontrada.');
    const articles = getDb().prepare('SELECT * FROM help_articles WHERE category_id = ? ORDER BY sort_order').all(cat.id);
    const data = {
      id: cat.id,
      slug: cat.slug,
      name: cat.name,
      shortLabel: cat.short_label,
      description: cat.description,
      iconSvg: cat.icon_svg,
      accent: cat.accent,
      articleCount: articles.length,
      articles: articles.map(art => ({
        id: art.id,
        slug: art.slug,
        question: art.question,
        answerHtml: art.answer_html,
        keywords: art.keywords,
        featured: Boolean(art.featured)
      }))
    };
    return ok(res, data);
  });

  router.get('/api/public/faqs/search', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const q = (url.searchParams.get('q') || '').trim();
    const categorySlug = url.searchParams.get('category');
    
    if (!q) {
      return ok(res, { query: q, tokens: [], total: 0, results: [] });
    }
    
    const tokens = q.split(/\s+/).filter(t => t.length > 0);
    const where = [];
    const params = [];
    
    tokens.forEach(t => {
      where.push('(art.question LIKE ? OR art.answer_html LIKE ? OR art.keywords LIKE ?)');
      const match = `%${t}%`;
      params.push(match, match, match);
    });
    
    if (categorySlug) {
      where.push('cat.slug = ?');
      params.push(categorySlug);
    }
    
    const sql = `
      SELECT art.*, cat.name AS category_name, cat.slug AS category_slug
      FROM help_articles art
      JOIN help_categories cat ON cat.id = art.category_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY art.sort_order
    `;
    
    const rows = getDb().prepare(sql).all(...params);
    const results = rows.map(r => ({
      id: r.id,
      slug: r.slug,
      question: r.question,
      answerHtml: r.answer_html,
      categoryName: r.category_name,
      categorySlug: r.category_slug
    }));
    
    return ok(res, {
      query: q,
      tokens,
      total: results.length,
      results
    });
  });

  // --- Saved Tutorials (User-specific) ---
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
    return ok(res, rows.map((row) => ({ ...row, relatedProductSkus: JSON.parse(row.related_product_skus || '[]') })));
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
