import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import type { AuthPayload } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function getAuthFromRequest(request: Request): AuthPayload | null {
  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return verifyToken(token);
  }
  // Check cookie
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach(c => {
      const eqIdx = c.trim().indexOf('=');
      if (eqIdx < 0) return;
      const k = c.trim().substring(0, eqIdx);
      const v = c.trim().substring(eqIdx + 1);
      if (k && v) cookies[k] = v;
    });
    if (cookies['auth_token']) {
      return verifyToken(cookies['auth_token']);
    }
  }
  return null;
}
