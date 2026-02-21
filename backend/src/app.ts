import express from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

import BetterSqlite3SessionStore from 'better-sqlite3-session-store';
import { getDb } from './db/schema';

import authRoutes from './routes/auth';
import inviteRoutes from './routes/invites';
import registerRoutes from './routes/register';
import docsRoutes from './routes/docs';
import uploadsRoutes from './routes/uploads';
import auditRoutes from './routes/audit';
import usersRoutes from './routes/users';
import membersRoutes from './routes/members';
import ssoRoutes from './routes/sso';
import caddyRoutes from './routes/caddy';
import settingsRoutes, { brandingRouter } from './routes/settings';
import monitoringRoutes from './routes/monitoring';
import announceRoutes from './routes/announce';
import { setupTerminalWs } from './routes/terminal';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Trust reverse proxy (Caddy) — required for secure cookies behind proxy
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session — SQLite store, survives server restarts
const SqliteStore = BetterSqlite3SessionStore(session);
const sessionParser = session({
  store: new SqliteStore({ client: getDb(), expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 20 * 60 * 1000, // 20 minutes
  },
});
app.use(sessionParser);

// Dynamic session timeout: override maxAge from DB setting on each request
import { getNumericSetting } from './utils/settings';
app.use((req, _res, next) => {
  if (req.session && req.session.cookie) {
    const timeoutMinutes = getNumericSetting('session_timeout_minutes', 20);
    req.session.cookie.maxAge = timeoutMinutes * 60 * 1000;
  }
  next();
});

// Rate limiting
import rateLimit from 'express-rate-limit';
const isPrivateIp = (ip: string) => {
  const v4 = ip.replace('::ffff:', '');
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(v4);
};
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { error: 'Too many login attempts, please try again later' },
  skip: (req) => isPrivateIp(req.ip || ''),
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many registration attempts, please try again later' },
});

// Serve uploaded files
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads')));

// API Routes
app.post('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/register', registerLimiter, registerRoutes);  // POST /api/register + GET /api/register/validate
app.use('/api/admin/invites', inviteRoutes);
app.use('/api/admin/requests', registerRoutes);
app.use('/api/docs', docsRoutes);
app.use('/api/admin/docs', docsRoutes);
app.use('/api/admin/uploads', uploadsRoutes);
app.use('/api/admin/audit', auditRoutes);
app.use('/api/admin/users', usersRoutes);
app.use('/api/admin/caddy', caddyRoutes);
app.use('/api/admin/settings', settingsRoutes);
app.use('/api/branding', brandingRouter);
app.use('/api/members', membersRoutes);
app.use('/api/sso', ssoRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/admin/announce', announceRoutes);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket for terminal
setupTerminalWs(server, sessionParser);

server.listen(PORT, () => {
  console.log(`Lab Portal backend running on http://localhost:${PORT}`);
});

export default app;
