import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock getDb before importing the middleware
vi.mock('../db/schema', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(),
    })),
  })),
}));

import { requireAuth, requireAdmin, requireNodeToken } from '../middlewares/auth';
import { getDb } from '../db/schema';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    session: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireAuth', () => {
  it('returns 401 when no session userId', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when session has userId', () => {
    const req = mockReq({ session: { userId: 1 } } as any);
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  it('returns 401 when no session userId', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when role is not admin', () => {
    const req = mockReq({ session: { userId: 1, role: 'user' } } as any);
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when role is admin', () => {
    const req = mockReq({ session: { userId: 1, role: 'admin' } } as any);
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('requireNodeToken', () => {
  it('returns 401 when no Authorization header', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    requireNodeToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when Authorization is not Bearer format', () => {
    const req = mockReq({ headers: { authorization: 'Basic abc' } } as any);
    const res = mockRes();
    const next = vi.fn();
    requireNodeToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when token not found in DB', () => {
    const mockGet = vi.fn().mockReturnValue(undefined);
    (getDb as any).mockReturnValue({
      prepare: vi.fn(() => ({ get: mockGet })),
    });

    const req = mockReq({ headers: { authorization: 'Bearer invalid-token' } } as any);
    const res = mockRes();
    const next = vi.fn();
    requireNodeToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.nodeId and calls next() with valid token', () => {
    const mockGet = vi.fn().mockReturnValue({ id: 42, hostname: 'gpu-node-1' });
    (getDb as any).mockReturnValue({
      prepare: vi.fn(() => ({ get: mockGet })),
    });

    const req = mockReq({ headers: { authorization: 'Bearer valid-token-123' } } as any);
    const res = mockRes();
    const next = vi.fn();
    requireNodeToken(req, res, next);
    expect(req.nodeId).toBe(42);
    expect(req.nodeHostname).toBe('gpu-node-1');
    expect(next).toHaveBeenCalled();
  });
});
