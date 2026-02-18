import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// GET /api/members - List active LDAP members (visible to all authenticated users)
router.get('/', requireAuth, (_req: Request, res: Response) => {
  const db = getDb();
  const members = db.prepare(`
    SELECT u.username, u.display_name, u.email, COALESCE(r.student_id, '') AS student_id
    FROM users u
    LEFT JOIN registration_requests r
      ON r.desired_username = u.username AND r.status = 'approved'
    WHERE u.source = 'ldap' AND u.is_active = 1 AND u.is_hidden = 0
    ORDER BY u.username ASC
  `).all();
  return res.json(members);
});

export default router;
