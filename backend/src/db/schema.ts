import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../data.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      source TEXT NOT NULL DEFAULT 'local' CHECK(source IN ('ldap','pam','local')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS registration_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id INTEGER NOT NULL REFERENCES invites(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      desired_username TEXT NOT NULL,
      student_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      admin_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      reviewed_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      current_version_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS doc_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL REFERENCES docs(id),
      content_markdown TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      url TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      detail_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ip TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS proxy_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL UNIQUE,
      target TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default admin if no users exist
  const count = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (count.cnt === 0) {
    db.prepare(
      `INSERT INTO users (username, display_name, email, role, source) VALUES (?, ?, ?, ?, ?)`
    ).run('admin', 'Administrator', 'admin@lab.local', 'admin', 'local');
  }

  // Seed default email template
  const emailTpl = db.prepare("SELECT key FROM settings WHERE key = 'approve_email'").get();
  if (!emailTpl) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      'approve_email',
      JSON.stringify({
        subject: 'Lab 帳號已建立 - {{username}}',
        body: `{{name}} 您好，

您的 Lab 帳號已經建立成功！

登入資訊：
- 網站：{{url}}
- 帳號：{{username}}
- 密碼：{{password}}

⚠️ 請第一次登入後立即更改密碼。

Lab 管理員`,
      }),
    );
  }

  // Seed default lab-guide doc if not exists
  const doc = db.prepare('SELECT id FROM docs WHERE slug = ?').get('lab-guide');
  if (!doc) {
    const result = db.prepare(
      `INSERT INTO docs (slug, title) VALUES (?, ?)`
    ).run('lab-guide', 'Lab 使用教學');
    const docId = result.lastInsertRowid;
    const ver = db.prepare(
      `INSERT INTO doc_versions (doc_id, content_markdown, created_by) VALUES (?, ?, ?)`
    ).run(docId, '# Welcome to Lab\n\nThis is the lab guide. An admin can edit this page.', 1);
    db.prepare('UPDATE docs SET current_version_id = ? WHERE id = ?').run(ver.lastInsertRowid, docId);
  }
}
