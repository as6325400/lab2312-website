# Lab Portal

Lab 2312 實驗室入口網站 — 類 Cockpit 風格的綜合管理平台。

## 功能

### 一般使用者
- **LDAP / PAM 登入** — 自動嘗試 LDAP，失敗再嘗試 PAM
- **Lab 使用教學** — Markdown 渲染的知識庫文件
- **Web Terminal** — 透過瀏覽器 SSH 連到 Bastion（xterm.js + ssh2）
- **成員名冊** — 查看實驗室活躍成員清單
- **VPN 管理** — 透過 SSO 一鍵跳轉至 WireGuard Portal
- **變更密碼** — 支援 FreeIPA 與 PAM 密碼變更
- **監控頁面** — 預留頁面（Coming Soon）

### 管理員
- **邀請管理** — 產生一次性註冊連結（含到期時間、使用次數限制）
- **註冊審核** — 審核註冊申請，通過後自動建立 FreeIPA 帳號並寄送通知信
- **文件編輯** — Markdown 編輯器 + 圖片拖曳上傳，支援版本歷史
- **Proxy 管理** — 透過 Web UI 管理 Caddy 反向代理規則，支援即時 reload
- **使用者管理** — 角色切換、停用帳號，變更同步至 FreeIPA
- **信件模板** — 自訂審核通過通知信模板，支援測試寄送
- **網站品牌** — 自訂網站名稱與 Logo
- **稽核紀錄** — 所有操作的完整 audit log

---

## 技術架構

| 層級 | 技術 |
|------|------|
| 前端 | Vue 3 + Vite + TypeScript + UnoCSS |
| 後端 | Node.js + Express 5 + TypeScript |
| 狀態管理 | Pinia |
| 路由 | Vue Router |
| HTTP Client | Axios |
| 資料庫 | SQLite（better-sqlite3） |
| 認證 | LDAP（ldapjs）+ PAM（unix_chkpwd） |
| 身分管理 | FreeIPA JSON-RPC API |
| SSO | HMAC-SHA256 signed token |
| Terminal | xterm.js + WebSocket + ssh2 |
| 反向代理 | Caddy（自動 HTTPS） |
| 容器化 | Docker Compose |
| 郵件 | Nodemailer（SMTP） |

---

## 專案結構

```
lab2312-website/
├── .env                        # Docker Compose 環境變數（domain、port、VPN）
├── .env.example
├── docker-compose.yml
├── docker/
│   ├── Dockerfile.backend      # Node.js backend image（含 SSSD/PAM）
│   ├── Dockerfile.frontend     # Vite build + Caddy image
│   ├── Caddyfile               # Caddyfile 範本
│   └── caddy-conf/
│       └── Caddyfile           # 實際運行的 Caddyfile（volume mount）
├── backend/
│   ├── .env                    # 後端環境變數（LDAP、SMTP、SSO...）
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── app.ts              # Express 主程式
│       ├── types.d.ts          # TypeScript 型別宣告
│       ├── db/
│       │   └── schema.ts       # SQLite schema + seed data
│       ├── middlewares/
│       │   └── auth.ts         # requireAuth / requireAdmin middleware
│       ├── routes/
│       │   ├── auth.ts         # 登入 / 登出 / /me / 變更密碼
│       │   ├── register.ts     # 註冊申請 + 管理員審核
│       │   ├── invites.ts      # 邀請連結 CRUD
│       │   ├── docs.ts         # 文件 CRUD（版本化）
│       │   ├── uploads.ts      # 圖片上傳（multer）
│       │   ├── users.ts        # 使用者管理（同步 FreeIPA）
│       │   ├── members.ts      # 成員名冊（公開給所有登入者）
│       │   ├── audit.ts        # 稽核紀錄
│       │   ├── sso.ts          # SSO token 產生（HMAC-SHA256）
│       │   ├── caddy.ts        # Caddy proxy 規則管理 + Caddyfile CRUD
│       │   ├── settings.ts     # 系統設定 + 品牌 + 測試寄信
│       │   └── terminal.ts     # WebSocket SSH Terminal
│       └── utils/
│           ├── freeipa.ts      # FreeIPA JSON-RPC API client
│           └── mailer.ts       # Email 發送（模板渲染）
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── uno.config.ts
    └── src/
        ├── main.ts
        ├── App.vue
        ├── style.css
        ├── router/index.ts     # 路由（含 auth guard）
        ├── stores/
        │   ├── auth.ts         # 認證狀態（Pinia）
        │   └── branding.ts     # 品牌設定
        ├── composables/
        │   └── useApi.ts       # Axios instance（baseURL: /api）
        ├── components/
        │   ├── AppLayout.vue   # 主 layout（sidebar + content）
        │   └── SideBar.vue     # 側邊欄導覽（含 VPN SSO 按鈕）
        └── pages/
            ├── LoginPage.vue
            ├── RegisterPage.vue
            ├── DocsPage.vue
            ├── TerminalPage.vue
            ├── MonitoringPage.vue
            ├── MembersPage.vue
            ├── ChangePasswordPage.vue
            └── admin/
                ├── InvitesPage.vue
                ├── RequestsPage.vue
                ├── DocsEditPage.vue
                ├── CaddyPage.vue
                ├── UsersPage.vue
                ├── EmailTemplatePage.vue
                ├── BrandingPage.vue
                └── AuditPage.vue
```

---

## 快速開始

### 前置需求

- Docker + Docker Compose
- 域名 DNS A record 指向主機 IP
- SSH private key（供 Web Terminal 連線用）
- FreeIPA server（帳號管理）
- SMTP server（通知信，可選）

### 1. 設定環境變數

```bash
cp .env.example .env
cp backend/.env.example backend/.env
# 編輯兩個 .env 填入實際值
```

#### 根目錄 `.env`（Docker Compose 使用）

| 變數 | 說明 | 範例 |
|------|------|------|
| `DASHBOARD_DOMAIN` | 網站域名 | `dashboard.example.com` |
| `HTTP_PORT` | HTTP port | `80` |
| `HTTPS_PORT` | HTTPS port | `443` |
| `VPN_URL` | VPN Portal URL（SSO 跳轉用） | `https://vpn.example.com` |
| `BASTION_KEY_PATH` | Host 上的 SSH private key 路徑 | `/etc/lab-portal/bastion_key` |

#### `backend/.env`

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `PORT` | 後端 HTTP port | `3001` |
| `SESSION_SECRET` | Session 加密金鑰 | — |
| `LDAP_URL` | LDAP server URL | — |
| `IPA_HOST` | FreeIPA server hostname | — |
| `LDAP_BASE_DN` | LDAP Base DN | — |
| `LDAP_BIND_DN` | LDAP 服務帳號 DN | — |
| `LDAP_BIND_PASSWORD` | LDAP 服務帳號密碼 | — |
| `SSO_SECRET` | SSO token HMAC 簽章金鑰 | — |
| `PAM_SERVICE` | PAM 服務名稱 | `login` |
| `BASTION_HOST` | SSH Bastion host | `127.0.0.1` |
| `BASTION_PORT` | SSH Bastion port | `22` |
| `BASTION_PRIVATE_KEY_PATH` | SSH private key 路徑 | — |
| `UPLOAD_DIR` | 上傳檔案目錄 | `./uploads` |
| `UPLOAD_MAX_SIZE` | 上傳檔案大小限制（bytes） | `10485760` |
| `FRONTEND_URL` | 前端 URL（CORS 用） | `http://localhost:5173` |
| `SITE_URL` | 網站 URL（信件內容用） | `http://localhost:5173` |
| `SMTP_HOST` | SMTP server | — |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP 帳號 | — |
| `SMTP_PASS` | SMTP 密碼 | — |
| `SMTP_FROM` | 寄件人地址 | — |

> Docker Compose 會用 `docker-compose.yml` 中定義的 environment 覆蓋部分值（如 `PORT=3000`、`FRONTEND_URL=https://${DASHBOARD_DOMAIN}` 等）。

### 2. 準備 SSH Key

```bash
sudo mkdir -p /etc/lab-portal
sudo ssh-keygen -t ed25519 -f /etc/lab-portal/bastion_key -N "" -C "lab-portal-service"
sudo chmod 600 /etc/lab-portal/bastion_key
# 將公鑰加入 bastion host 的 authorized_keys
```

### 3. 啟動

```bash
docker compose up -d --build
```

### 4. 驗證

- 開啟 `https://<DASHBOARD_DOMAIN>`
- 透過 LDAP 或 PAM 帳號登入
- LDAP `admins` group 成員或 PAM `sudo` group 使用者自動獲得 admin 權限

### 更新

```bash
git pull
docker compose up -d --build
```

---

## 本機開發

```bash
# 安裝依賴
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 啟動後端（需設定 backend/.env）
cd backend && npm run dev    # port 3001

# 啟動前端（另一個 terminal）
cd frontend && npm run dev   # port 5173
```

前端 dev server 自動 proxy `/api`、`/ws`、`/uploads` 到 `http://localhost:3001`。

---

## Docker 架構

```
┌──────────────────────────────────────┐
│  Caddy (lab-caddy)                   │
│  - 自動 HTTPS (Let's Encrypt)        │
│  - 前端靜態檔 (/srv)                 │
│  - 反向代理 /api/* → backend:3000    │
│  - 反向代理 /ws/*  → backend:3000    │
│  - 動態 proxy rules (DB 管理)         │
│  - Port 80, 443                      │
├──────────────────────────────────────┤
│  Backend (Node.js)                   │
│  - Express API server                │
│  - WebSocket Terminal                │
│  - SQLite DB (/data/portal.db)       │
│  - SSH → Bastion host                │
│  - LDAP/PAM auth                     │
│  - FreeIPA API                       │
│  - Docker socket (管理 Caddy)         │
│  - Port 3000 (internal)             │
└──────────────────────────────────────┘
```

### Volumes

| Host 路徑 | Container 路徑 | 用途 |
|-----------|---------------|------|
| `./volume/db` | `/data` | SQLite 資料庫 |
| `./volume/uploads` | `/data/uploads` | 上傳檔案 |
| `./docker/caddy-conf` | `/etc/caddy` | Caddyfile（backend + caddy 共享） |
| `./volume/caddy-data` | `/data` (caddy) | TLS 憑證 |
| `/var/run/docker.sock` | `/var/run/docker.sock` | Docker API（Caddy 管理用） |

### 域名集中管理

所有域名統一由根目錄 `.env` 的 `DASHBOARD_DOMAIN` 控制：
- `docker-compose.yml` 透過 `${DASHBOARD_DOMAIN}` 引用
- Caddyfile 使用 `{$DASHBOARD_DOMAIN}` 環境變數語法
- Backend 透過 `DASHBOARD_DOMAIN` 環境變數讀取

---

## SSH Terminal 設定

Web Terminal 讓使用者在瀏覽器內直接 SSH 到 bastion host。以登入者的帳號名稱作為 SSH username，透過 service key 認證。

### Bastion Host 設定

在 bastion host 上設定 service key 認證：

```bash
# 複製 public key 到 bastion host
sudo mkdir -p /etc/ssh/service-keys
sudo cp /etc/lab-portal/bastion_key.pub /etc/ssh/service-keys/lab-portal.pub
```

#### FreeIPA / SSSD 環境

FreeIPA 已設定 `AuthorizedKeysCommand`，需用 wrapper script 同時支援 SSSD key 和 service key：

```bash
sudo tee /etc/ssh/service-keys/authorized-keys-wrapper.sh > /dev/null << 'EOF'
#!/bin/bash
/usr/bin/sss_ssh_authorizedkeys "$1" 2>/dev/null
/bin/cat /etc/ssh/service-keys/lab-portal.pub 2>/dev/null
EOF
sudo chmod 755 /etc/ssh/service-keys/authorized-keys-wrapper.sh

# 修改 sshd 設定
sudo sed -i 's|AuthorizedKeysCommand /usr/bin/sss_ssh_authorizedkeys|AuthorizedKeysCommand /etc/ssh/service-keys/authorized-keys-wrapper.sh %u|' /etc/ssh/sshd_config.d/04-ipa.conf
sudo systemctl restart sshd
```

#### 無 FreeIPA 環境

```sshd_config
AuthorizedKeysCommand /bin/cat /etc/ssh/service-keys/lab-portal.pub
AuthorizedKeysCommandUser nobody
```

### 安全限制

- 每個使用者最多同時 2 個 terminal session
- 閒置 30 分鐘自動斷線
- 開關 terminal 皆記錄於稽核日誌

---

## SSO 機制

用於跳轉至外部服務（如 WireGuard Portal），無需重新登入。

### 流程

1. 使用者點擊側邊欄「VPN 管理」
2. 前端呼叫 `POST /api/sso/token`
3. 後端查詢使用者的 LDAP groups，產生 JSON payload：
   ```json
   { "username": "user1", "groups": ["lab", "vpn"], "is_admin": false, "exp": 1708000000000 }
   ```
4. 用 `HMAC-SHA256(SSO_SECRET, payload)` 簽章
5. Token 格式：`base64url(payload).hex(signature)`，有效期 30 秒
6. 前端開新分頁：`{VPN_URL}/api/sso/callback?token=...`
7. 外部服務用相同 `SSO_SECRET` 驗證簽章，完成登入

### 安全性

- Token 只能使用一次，30 秒後過期
- HMAC 簽章防止竄改（無法偽造 `is_admin` 或 `groups`）
- 需要雙方共享 `SSO_SECRET`

---

## 使用者角色

| 角色 | 權限 |
|------|------|
| Guest（未登入） | 只能透過邀請連結填寫註冊表單 |
| User | Lab 教學、Web Terminal、成員名冊、VPN 管理、監控頁、變更密碼 |
| Admin | 以上全部 + 邀請管理、註冊審核、文件編輯、Proxy 管理、使用者管理、信件模板、網站品牌、稽核紀錄 |

### 角色判定

- **LDAP 使用者**：若屬於 `admins` group → admin
- **PAM 使用者**：若屬於 `sudo` 或 `root` group → admin
- 每次登入自動同步角色

---

## 邀請註冊流程

1. Admin 建立邀請連結（設定到期時間、最多使用次數）
2. 將連結 `https://<domain>/register?token=...` 發送給受邀者
3. Guest 開啟連結，填寫姓名、email、帳號、學號
4. Admin 在「註冊審核」頁面審核
5. 通過 → 自動建立 FreeIPA 帳號（含 Kerberos principal）+ 寄送通知信（含隨機密碼）
6. 拒絕 → 記錄拒絕原因

---

## 信件通知

審核通過使用者時自動寄出通知信，包含帳號密碼和網站連結。

在管理介面「信件模板」頁面可自訂信件內容。可用變數：

| 變數 | 說明 |
|------|------|
| `{{name}}` | 使用者姓名 |
| `{{username}}` | 帳號 |
| `{{password}}` | 密碼 |
| `{{url}}` | 網站網址 |

> 如果沒有設定 SMTP，審核通過仍正常執行，但不會寄信。

---

## API 端點

### 公開

| Method | Path | 說明 |
|--------|------|------|
| POST | `/api/auth/login` | 登入（LDAP → PAM fallback） |
| GET | `/api/auth/me` | 查詢登入狀態 |
| GET | `/api/register/validate` | 驗證邀請 token |
| POST | `/api/register` | 提交註冊申請 |
| GET | `/api/branding` | 取得網站品牌設定 |
| GET | `/api/health` | Health check |

### 使用者（需登入）

| Method | Path | 說明 |
|--------|------|------|
| POST | `/api/auth/logout` | 登出 |
| POST | `/api/auth/change-password` | 變更密碼 |
| GET | `/api/docs/:slug` | 閱讀文件 |
| GET | `/api/members` | 成員名冊 |
| POST | `/api/sso/token` | 產生 SSO token |
| WS | `/ws/terminal` | Web Terminal |

### 管理員

| Method | Path | 說明 |
|--------|------|------|
| POST | `/api/admin/invites` | 建立邀請 |
| GET | `/api/admin/invites` | 列出有效邀請 |
| DELETE | `/api/admin/invites/:id` | 停用邀請 |
| GET | `/api/admin/requests` | 列出註冊申請 |
| POST | `/api/admin/requests/:id/approve` | 核准（建立 FreeIPA 帳號 + 寄信） |
| POST | `/api/admin/requests/:id/reject` | 拒絕 |
| POST | `/api/admin/docs/:slug` | 更新文件 |
| GET | `/api/admin/docs/:slug/versions` | 文件版本歷史 |
| POST | `/api/admin/uploads` | 上傳圖片 |
| GET | `/api/admin/users` | 列出使用者 |
| PATCH | `/api/admin/users/:id` | 更新使用者（同步 FreeIPA） |
| GET | `/api/admin/audit` | 稽核紀錄（分頁） |
| GET/PUT | `/api/admin/settings/:key` | 系統設定 |
| POST | `/api/admin/settings/test-email` | 測試寄信 |
| GET/POST/PUT/DELETE | `/api/admin/caddy/rules` | Proxy 規則 CRUD |
| GET/PUT | `/api/admin/caddy/config` | Raw Caddyfile 編輯 |
| POST | `/api/admin/caddy/validate` | 驗證 Caddy 設定 |
| POST | `/api/admin/caddy/reload` | 重載 Caddy |
| POST | `/api/admin/caddy/fmt` | 格式化 Caddyfile |

---

## 資料庫（SQLite）

資料庫檔案位於 `volume/db/portal.db`（Docker）或 `backend/data.db`（本機開發），首次啟動自動建立。

| 資料表 | 說明 |
|--------|------|
| `users` | 使用者帳號（username, role, source, is_active） |
| `invites` | 註冊邀請連結（token, expires_at, max_uses） |
| `registration_requests` | 註冊申請（name, email, desired_username, student_id, status） |
| `docs` | 文件（slug, title, current_version_id） |
| `doc_versions` | 文件版本歷史（content_markdown） |
| `uploads` | 上傳檔案紀錄（path, url, mime, size） |
| `audit_logs` | 稽核紀錄（actor, action, detail_json, ip） |
| `settings` | 系統設定（key-value，品牌、信件模板等） |
| `proxy_rules` | Caddy proxy 規則（domain, target, is_enabled） |

---

## 安全機制

- **HTTPS**：Caddy 自動申請 Let's Encrypt 憑證
- **Security Headers**：Helmet（CSP、X-Frame-Options、X-Content-Type-Options、X-XSS-Protection）
- **Session**：httpOnly + sameSite=lax + secure，SQLite 持久化，20 分鐘有效期
- **Rate Limiting**：登入 10 次/15 分鐘、註冊 5 次/1 小時（內網 IP 豁免）
- **密碼不落地**：LDAP/PAM 只做即時驗證，不儲存密碼
- **上傳限制**：僅允許 png/jpg/webp/gif，檔名改為 UUID，10MB 上限
- **Terminal**：session 驗證、每人最多 2 連線、30 分鐘閒置斷線
- **SSO**：HMAC-SHA256 簽章防竄改，30 秒過期
- **稽核紀錄**：所有關鍵操作（登入、登出、審核、設定變更、Terminal 開關等）

---

## 常用指令

```bash
# 開發
cd backend && npm run dev      # 後端開發模式（自動重載）
cd frontend && npm run dev     # 前端開發模式（HMR）

# 建置
cd frontend && npm run build   # 前端打包至 dist/
cd backend && npm run build    # 後端編譯至 dist/

# Docker
docker compose up -d --build   # 建置並背景啟動
docker compose logs -f         # 查看日誌
docker compose down            # 停止
docker compose up -d --build caddy  # 只重建前端/Caddy
```
