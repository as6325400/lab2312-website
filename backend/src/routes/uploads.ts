import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/schema';
import { requireAdmin } from '../middlewares/auth';

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads');
const MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE || '10485760', 10);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      cb(new Error('Only image files (png, jpg, webp, gif) are allowed'));
      return;
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
      cb(new Error('Invalid file extension'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

// POST /api/admin/uploads
router.post('/', requireAdmin, (req: Request, res: Response) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const db = getDb();
    const url = `/uploads/${req.file.filename}`;

    db.prepare(
      'INSERT INTO uploads (path, url, mime, size, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(req.file.path, url, req.file.mimetype, req.file.size, req.session.userId);

    return res.json({
      url,
      filename: req.file.filename,
      size: req.file.size,
    });
  });
});

export default router;
