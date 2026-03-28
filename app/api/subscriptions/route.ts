export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

// GET /api/subscriptions?performer_id=xxx
// Returns subscription status + bank details for payment
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const performerId = request.nextUrl.searchParams.get('performer_id');
  if (!performerId) return NextResponse.json({ error: 'performer_id required' }, { status: 400 });

  const performer = db.prepare('SELECT subscription_price, display_name FROM performers WHERE id = ?').get(performerId) as any;
  if (!performer) return NextResponse.json({ error: 'Performer not found' }, { status: 404 });

  let subscribed = false;
  if (auth) {
    const sub = db.prepare(`
      SELECT id FROM subscriptions
      WHERE user_id = ? AND performer_id = ? AND expires_at > datetime('now') AND status = 'active'
    `).get(auth.userId, performerId);
    subscribed = !!sub;
  }

  // Get bank details from settings
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  rows.forEach(r => { settings[r.key] = r.value; });

  return NextResponse.json({
    subscribed,
    price: performer.subscription_price || 0,
    performerName: performer.display_name,
    bankDetails: {
      bankName: settings.bank_name || '',
      accountName: settings.bank_account_name || '',
      accountNumber: settings.bank_account_number || '',
      iban: settings.bank_iban || '',
      swift: settings.bank_swift || '',
      instructions: settings.bank_instructions || 'Transfer the exact amount and use your reference code as the payment description.',
    },
  });
}

// POST /api/subscriptions — self-confirm bank transfer, activate subscription
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.role !== 'customer') return NextResponse.json({ error: 'Only customers can subscribe' }, { status: 403 });

  const { performer_id, reference } = await request.json();
  if (!performer_id) return NextResponse.json({ error: 'performer_id required' }, { status: 400 });
  if (!reference?.trim()) return NextResponse.json({ error: 'Payment reference is required' }, { status: 400 });

  const performer = db.prepare('SELECT * FROM performers WHERE id = ?').get(performer_id) as any;
  if (!performer) return NextResponse.json({ error: 'Performer not found' }, { status: 404 });

  const price = performer.subscription_price || 0;
  if (price <= 0) return NextResponse.json({ error: 'This performer has not enabled subscriptions' }, { status: 400 });

  // Check existing subscription
  const existing = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND performer_id = ?').get(auth.userId, performer_id) as any;

  if (existing) {
    // Extend from whichever is later: now or current expiry
    db.prepare(`
      UPDATE subscriptions
      SET expires_at = datetime(MAX(expires_at, datetime('now')), '+30 days'),
          status = 'active',
          reference = ?,
          amount_usd = ?
      WHERE user_id = ? AND performer_id = ?
    `).run(reference.trim(), price, auth.userId, performer_id);
  } else {
    db.prepare(`
      INSERT INTO subscriptions (id, user_id, performer_id, amount_usd, reference, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+30 days'))
    `).run(crypto.randomUUID(), auth.userId, performer_id, price, reference.trim());
  }

  return NextResponse.json({ success: true });
}
