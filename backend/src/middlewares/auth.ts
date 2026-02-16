import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    username?: string;
    role?: string;
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
