import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/schema';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    username?: string;
    role?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      nodeId?: number;
      nodeHostname?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requireNodeToken(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  const db = getDb();
  const row = db.prepare(
    'SELECT id, hostname FROM monitor_nodes WHERE token = ? AND is_active = 1'
  ).get(token) as { id: number; hostname: string } | undefined;

  if (!row) {
    return res.status(401).json({ error: 'Invalid or inactive node token' });
  }
  req.nodeId = row.id;
  req.nodeHostname = row.hostname;
  next();
}
