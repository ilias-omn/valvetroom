export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(params.id);
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

  return NextResponse.json(call);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await req.json();
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(params.id) as {
    id: string; customer_id: string; performer_id: string; status: string;
    start_time: string | null; tokens_charged: number;
  } | undefined;

  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'start') {
    db.prepare("UPDATE calls SET status = 'active', start_time = datetime('now') WHERE id = ?").run(params.id);
    return NextResponse.json({ success: true });
  }

  if (action === 'end') {
    const now = new Date();
    const startTime = call.start_time ? new Date(call.start_time) : now;
    const durationSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);

    // Get performer rate
    const performer = db.prepare('SELECT rate_per_minute FROM performers WHERE user_id = ?').get(call.performer_id) as { rate_per_minute: number } | undefined;
    const ratePerMin = performer?.rate_per_minute ?? 10;
    const tokensCharged = Math.ceil((durationSeconds / 60) * ratePerMin);

    // Deduct tokens from customer
    db.prepare('UPDATE tokens SET balance = MAX(0, balance - ?) WHERE user_id = ?').run(tokensCharged, call.customer_id);

    // 80% to performer
    const performerEarning = Math.floor(tokensCharged * 0.8);
    db.prepare('UPDATE performers SET total_earnings = total_earnings + ? WHERE user_id = ?').run(performerEarning, call.performer_id);
    db.prepare('UPDATE tokens SET balance = balance + ? WHERE user_id = ?').run(performerEarning, call.performer_id);

    // Log transactions
    db.prepare('INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)').run(
      crypto.randomUUID(), call.customer_id, -tokensCharged, 'call_charge',
      `Call charge - ${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`
    );
    db.prepare('INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)').run(
      crypto.randomUUID(), call.performer_id, performerEarning, 'earning',
      `Call earning - ${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`
    );

    db.prepare(`
      UPDATE calls SET status = 'ended', end_time = datetime('now'),
        duration_seconds = ?, tokens_charged = ?
      WHERE id = ?
    `).run(durationSeconds, tokensCharged, params.id);

    return NextResponse.json({ success: true, tokensCharged, durationSeconds });
  }

  if (action === 'reject') {
    db.prepare("UPDATE calls SET status = 'rejected' WHERE id = ?").run(params.id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
