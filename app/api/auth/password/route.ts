export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest, verifyPassword, hashPassword } from '@/lib/auth';

export async function PATCH(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { current_password, new_password } = await req.json();
  if (!current_password || !new_password)
    return NextResponse.json({ error: 'Both fields required' }, { status: 400 });
  if (new_password.length < 6)
    return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(auth.userId) as { password_hash: string } | undefined;
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (!verifyPassword(current_password, user.password_hash))
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(new_password), auth.userId);
  return NextResponse.json({ success: true });
}
