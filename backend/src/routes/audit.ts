import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { requireAdmin } from '../middlewares/auth';

const router = Router();

// GET /api/admin/audit
router.get('/', requireAdmin, (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;

  const db = getDb();
  const logs = db.prepare(
    `SELECT al.*, u.username as actor_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     ORDER BY al.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(limit, offset);

  const total = (db.prepare('SELECT COUNT(*) as cnt FROM audit_logs').get() as any).cnt;

  return res.json({ logs, total, limit, offset });
});

export default router;
