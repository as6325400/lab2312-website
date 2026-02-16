import nodemailer from 'nodemailer';
import { getDb } from '../db/schema';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      throw new Error('SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)');
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

// 取得 email template 並替換變數
function renderTemplate(
  template: { subject: string; body: string },
  vars: Record<string, string>,
): { subject: string; body: string } {
  const replace = (str: string) =>
    str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  return {
    subject: replace(template.subject),
    body: replace(template.body),
  };
}

export async function sendApproveEmail(opts: {
  to: string;
  name: string;
  username: string;
  password: string;
}): Promise<void> {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'approve_email'").get() as { value: string } | undefined;

  if (!row) throw new Error('Email template not found');

  const template = JSON.parse(row.value) as { subject: string; body: string };
  const siteUrl = process.env.SITE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

  const { subject, body } = renderTemplate(template, {
    name: opts.name,
    username: opts.username,
    password: opts.password,
    url: siteUrl,
  });

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@lab.local';

  const transport = getTransporter();
  await transport.sendMail({
    from,
    to: opts.to,
    subject,
    text: body,
  });
}

export async function sendRegistrationNotifyEmail(opts: {
  name: string;
  email: string;
  username: string;
  studentId: string;
}): Promise<void> {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'registration_notify_email'").get() as { value: string } | undefined;

  if (!row) throw new Error('Registration notification email template not found');

  const template = JSON.parse(row.value) as { subject: string; body: string };
  const siteUrl = process.env.SITE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

  const { subject, body } = renderTemplate(template, {
    name: opts.name,
    email: opts.email,
    username: opts.username,
    studentId: opts.studentId || '(未填)',
    url: siteUrl,
  });

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@lab.local';

  const transport = getTransporter();
  await transport.sendMail({
    from,
    to: from,
    subject,
    text: body,
  });
}
