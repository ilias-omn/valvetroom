export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.age_verified, u.created_at,
           COALESCE(t.balance, 0) as token_balance
    FROM users u
    LEFT JOIN tokens t ON t.user_id = u.id
    ORDER BY u.created_at DESC
  `).all();

  return NextResponse.json(users);
}

export async function DELETE(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  db.prepare('DELETE FROM performers WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM tokens WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ? AND role != ?').run(userId, 'admin');

  return NextResponse.json({ success: true });
}
