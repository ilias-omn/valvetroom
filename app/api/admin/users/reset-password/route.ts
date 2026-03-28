export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest, hashPassword } from '@/lib/auth';

export async function PATCH(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'admin')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId, newPassword } = await req.json();
  if (!userId || !newPassword)
    return NextResponse.json({ error: 'userId and newPassword required' }, { status: 400 });
  if (newPassword.length < 6)
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
  return NextResponse.json({ success: true });
}
