export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payouts = db.prepare(`
    SELECT p.*, u.username as performer_username
    FROM payout_requests p
    JOIN users u ON u.id = p.performer_id
    ORDER BY p.created_at DESC
  `).all();

  return NextResponse.json({ payouts });
}

export async function PATCH(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { payoutId, action, note } = await req.json();
  if (!payoutId || !action) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const payout = db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(payoutId) as {
    id: string; performer_id: string; amount_tokens: number; status: string;
  } | undefined;

  if (!payout) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (payout.status !== 'pending') return NextResponse.json({ error: 'Already processed' }, { status: 400 });

  if (action === 'paid') {
    db.prepare(`
      UPDATE payout_requests SET status = 'paid', note = ?, paid_at = datetime('now') WHERE id = ?
    `).run(note || '', payoutId);

    // Deduct tokens from performer's balance that were held for payout
    db.prepare('UPDATE tokens SET balance = balance - ? WHERE user_id = ?')
      .run(payout.amount_tokens, payout.performer_id);

    db.prepare(
      'INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(), payout.performer_id,
      -payout.amount_tokens, 'payout', `Payout processed${note ? ': ' + note : ''}`
    );
  } else if (action === 'reject') {
    db.prepare(`UPDATE payout_requests SET status = 'rejected', note = ? WHERE id = ?`).run(note || '', payoutId);
  }

  return NextResponse.json({ success: true });
}
