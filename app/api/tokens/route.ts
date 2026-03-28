export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const balance = db.prepare('SELECT balance FROM tokens WHERE user_id = ?').get(auth.userId) as { balance: number } | undefined;
  const transactions = db.prepare(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(auth.userId);

  return NextResponse.json({ balance: balance?.balance ?? 0, transactions });
}
