import { Router, Request, Response } from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { getDb } from '../db/schema';
import { requireAdmin } from '../middlewares/auth';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

const router = Router();

// POST /api/admin/announce — Send announcement email to selected users
router.post('/', requireAdmin, (req: Request, res: Response) => {
  upload.array('files', 5)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const userIds = JSON.parse(req.body.userIds || '[]') as number[];
    const subject = req.body.subject as string;
    const body = req.body.body as string;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: '請選擇至少一位收件者' });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: '請輸入信件主旨' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ error: '請輸入信件內容' });
    }

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      return res.status(400).json({ error: 'SMTP 尚未設定（請在 .env 設定 SMTP_HOST, SMTP_USER, SMTP_PASS）' });
    }

    const from = process.env.SMTP_FROM || user || 'noreply@lab.local';

    const db = getDb();

    const placeholders = userIds.map(() => '?').join(',');
    const recipients = db.prepare(
      `SELECT id, username, email FROM users WHERE id IN (${placeholders}) AND email != ''`
    ).all(...userIds) as { id: number; username: string; email: string }[];

    if (recipients.length === 0) {
      return res.status(400).json({ error: '選取的使用者中沒有可寄送的 Email' });
    }

    // Build attachments from uploaded files
    const files = (req.files as Express.Multer.File[]) || [];
    const attachments = files.map(f => ({
      filename: f.originalname,
      content: f.buffer,
    }));

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      try {
        await transport.sendMail({
          from,
          to: recipient.email,
          subject: subject.trim(),
          text: body.trim(),
          attachments,
        });
        sent++;
      } catch (err: any) {
        failed++;
        errors.push(`${recipient.username}: ${err.message}`);
      }
    }

    // Audit
    db.prepare(
      'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
    ).run(
      req.session.userId,
      'send_announce',
      JSON.stringify({
        subject: subject.trim(),
        recipientCount: recipients.length,
        sent,
        failed,
        attachmentCount: attachments.length,
      }),
      req.ip,
    );

    if (failed > 0 && sent === 0) {
      return res.status(500).json({ error: '全部寄送失敗', errors });
    }

    return res.json({ ok: true, sent, failed, errors: errors.length > 0 ? errors : undefined });
  });
});

export default router;
