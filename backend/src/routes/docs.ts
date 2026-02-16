import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { requireAuth, requireAdmin } from '../middlewares/auth';

const router = Router();

// GET /api/docs/public/:slug - Public doc view (no auth, whitelist only)
const PUBLIC_SLUGS: string[] = ['about'];

router.get('/public/:slug', (req: Request, res: Response) => {
  const slug = req.params.slug as string;

  if (!PUBLIC_SLUGS.includes(slug)) {
    return res.status(403).json({ error: 'This document is not publicly accessible' });
  }

  const db = getDb();
  const doc = db.prepare(
    `SELECT d.id, d.slug, d.title, dv.content_markdown, dv.created_at as updated_at
     FROM docs d
     LEFT JOIN doc_versions dv ON dv.id = d.current_version_id
     WHERE d.slug = ?`
  ).get(slug) as any;

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  return res.json(doc);
});

// GET /api/docs/:slug - Public doc view (requires auth)
router.get('/:slug', requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const doc = db.prepare(
    `SELECT d.id, d.slug, d.title, dv.content_markdown, dv.created_at as updated_at
     FROM docs d
     LEFT JOIN doc_versions dv ON dv.id = d.current_version_id
     WHERE d.slug = ?`
  ).get(req.params.slug) as any;

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  return res.json(doc);
});

// POST /api/admin/docs/:slug - Update doc (admin)
router.post('/:slug', requireAdmin, (req: Request, res: Response) => {
  const { contentMarkdown, title } = req.body;
  const db = getDb();

  let doc = db.prepare('SELECT * FROM docs WHERE slug = ?').get(req.params.slug) as any;
  if (!doc) {
    // Create new doc
    const result = db.prepare('INSERT INTO docs (slug, title) VALUES (?, ?)').run(
      req.params.slug,
      title || req.params.slug
    );
    doc = { id: result.lastInsertRowid };
  }

  if (title) {
    db.prepare('UPDATE docs SET title = ? WHERE id = ?').run(title, doc.id);
  }

  // Create new version
  const ver = db.prepare(
    'INSERT INTO doc_versions (doc_id, content_markdown, created_by) VALUES (?, ?, ?)'
  ).run(doc.id, contentMarkdown || '', req.session.userId);

  // Update current version pointer
  db.prepare('UPDATE docs SET current_version_id = ? WHERE id = ?').run(ver.lastInsertRowid, doc.id);

  // Audit
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, 'update_doc', JSON.stringify({ slug: req.params.slug }), req.ip);

  return res.json({ ok: true, versionId: ver.lastInsertRowid });
});

// GET /api/admin/docs/:slug/versions - List versions (admin)
router.get('/:slug/versions', requireAdmin, (req: Request, res: Response) => {
  const db = getDb();
  const doc = db.prepare('SELECT id FROM docs WHERE slug = ?').get(req.params.slug) as any;
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const versions = db.prepare(
    `SELECT dv.id, dv.created_at, u.username as author
     FROM doc_versions dv
     LEFT JOIN users u ON u.id = dv.created_by
     WHERE dv.doc_id = ?
     ORDER BY dv.created_at DESC
     LIMIT 50`
  ).all(doc.id);

  return res.json(versions);
});

export default router;
