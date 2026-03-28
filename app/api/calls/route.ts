import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { performer_id } = await req.json();
  if (!performer_id) return NextResponse.json({ error: 'performer_id required' }, { status: 400 });

  // Check balance
  const tokenRow = db.prepare('SELECT balance FROM tokens WHERE user_id = ?').get(auth.userId) as { balance: number } | undefined;
  if (!tokenRow || tokenRow.balance < 10) {
    return NextResponse.json({ error: 'Insufficient tokens. Buy more to start a call.' }, { status: 402 });
  }

  // Check performer exists
  const performer = db.prepare('SELECT * FROM performers WHERE user_id = ?').get(performer_id);
  if (!performer) return NextResponse.json({ error: 'Performer not found' }, { status: 404 });

  const callId = crypto.randomUUID();
  db.prepare(
    'INSERT INTO calls (id, customer_id, performer_id, status) VALUES (?, ?, ?, ?)'
  ).run(callId, auth.userId, performer_id, 'pending');

  return NextResponse.json({ callId });
}

export async function GET(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let calls;
  if (auth.role === 'customer') {
    calls = db.prepare(`
      SELECT c.*, u.username as performer_name
      FROM calls c
      JOIN users u ON u.id = c.performer_id
      WHERE c.customer_id = ?
      ORDER BY c.created_at DESC LIMIT 20
    `).all(auth.userId);
  } else {
    calls = db.prepare(`
      SELECT c.*, u.username as customer_name
      FROM calls c
      JOIN users u ON u.id = c.customer_id
      WHERE c.performer_id = ?
      ORDER BY c.created_at DESC LIMIT 20
    `).all(auth.userId);
  }

  return NextResponse.json(calls);
}
