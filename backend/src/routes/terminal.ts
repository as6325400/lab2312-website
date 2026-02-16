import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Client as SSHClient } from 'ssh2';
import { IncomingMessage } from 'http';
import { getDb } from '../db/schema';
import { getNumericSetting } from '../utils/settings';
import fs from 'fs';

interface TerminalSession {
  ssh: SSHClient;
  ws: WebSocket;
  userId: number;
  startedAt: Date;
  idleTimer: NodeJS.Timeout | null;
}

const activeSessions = new Map<WebSocket, TerminalSession>();
const userSessionCount = new Map<number, number>();

export function setupTerminalWs(server: HttpServer, sessionParser: any) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    if (url.pathname !== '/ws/terminal') {
      socket.destroy();
      return;
    }

    sessionParser(req as any, {} as any, () => {
      const session = (req as any).session;
      if (!session?.userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const session = (req as any).session;
    const userId = session.userId;
    const username = session.username;

    // Check session limit
    const count = userSessionCount.get(userId) || 0;
    const maxSessions = getNumericSetting('terminal_max_sessions', 2);
    if (count >= maxSessions) {
      ws.send(JSON.stringify({ type: 'error', message: 'Maximum terminal sessions reached' }));
      ws.close();
      return;
    }

    const bastionHost = process.env.BASTION_HOST || '127.0.0.1';
    const bastionPort = parseInt(process.env.BASTION_PORT || '22', 10);
    const keyPath = process.env.BASTION_PRIVATE_KEY_PATH;

    // 用登入的使用者帳號作為 SSH username
    const sshUsername = username;

    const ssh = new SSHClient();
    let idleTimer: NodeJS.Timeout | null = null;

    const idleTimeoutMs = getNumericSetting('terminal_idle_timeout_minutes', 30) * 60 * 1000;
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        ws.send('\r\n[Session timed out due to inactivity]\r\n');
        ws.close();
      }, idleTimeoutMs);
    };

    const sshConfig: any = {
      host: bastionHost,
      port: bastionPort,
      username: sshUsername,
    };

    if (keyPath && fs.existsSync(keyPath)) {
      try {
        sshConfig.privateKey = fs.readFileSync(keyPath);
      } catch (err: any) {
        console.error(`Cannot read bastion key ${keyPath}: ${err.message}`);
        ws.send(JSON.stringify({ type: 'error', message: `Cannot read SSH key: ${err.message}` }));
        ws.close();
        return;
      }
    } else {
      // For development, try agent
      sshConfig.agent = process.env.SSH_AUTH_SOCK;
    }

    ssh.on('ready', () => {
      // Audit
      const db = getDb();
      db.prepare(
        'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
      ).run(userId, 'terminal_open', JSON.stringify({ bastionHost }), (req as any).socket?.remoteAddress);

      userSessionCount.set(userId, (userSessionCount.get(userId) || 0) + 1);

      ssh.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to open shell' }));
          ws.close();
          return;
        }

        activeSessions.set(ws, { ssh, ws, userId, startedAt: new Date(), idleTimer });
        resetIdleTimer();

        stream.on('data', (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        stream.on('close', () => {
          ws.close();
        });

        ws.on('message', (data: any) => {
          resetIdleTimer();
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'resize' && msg.cols && msg.rows) {
              stream.setWindow(msg.rows, msg.cols, 0, 0);
              return;
            }
          } catch {
            // Not JSON, treat as terminal input
          }
          stream.write(data);
        });

        ws.on('close', () => {
          if (idleTimer) clearTimeout(idleTimer);
          stream.end();
          ssh.end();
          activeSessions.delete(ws);
          userSessionCount.set(userId, Math.max(0, (userSessionCount.get(userId) || 1) - 1));

          // Audit
          db.prepare(
            'INSERT INTO audit_logs (actor_user_id, action, detail_json, ip) VALUES (?, ?, ?, ?)'
          ).run(userId, 'terminal_close', null, (req as any).socket?.remoteAddress);
        });
      });
    });

    ssh.on('error', (err) => {
      console.error('SSH error:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: 'SSH connection failed: ' + err.message }));
      ws.close();
    });

    ssh.connect(sshConfig);
  });
}
