import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

// Token to USD rate (matches purchase packages: 100 tokens = $10)
const TOKEN_TO_USD = 0.08; // performer gets 80% of token value (platform keeps 20%)

export async function GET(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'performer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requests = db.prepare(`
    SELECT * FROM payout_requests WHERE performer_id = ? ORDER BY created_at DESC
  `).all(auth.userId) as { status: string }[];

  const pendingExists = requests.some(r => r.status === 'pending');

  return NextResponse.json({ requests, pendingExists });
}

export async function POST(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'performer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bankDetails, amountTokens } = await req.json();
  if (!bankDetails || !amountTokens) {
    return NextResponse.json({ error: 'Bank details and amount required' }, { status: 400 });
  }

  // Check no pending request already
  const existing = db.prepare(
    "SELECT id FROM payout_requests WHERE performer_id = ? AND status = 'pending'"
  ).get(auth.userId);
  if (existing) {
    return NextResponse.json({ error: 'You already have a pending payout request' }, { status: 400 });
  }

  // Check token balance
  const tokenRow = db.prepare('SELECT balance FROM tokens WHERE user_id = ?').get(auth.userId) as { balance: number } | undefined;
  if (!tokenRow || tokenRow.balance < amountTokens) {
    return NextResponse.json({ error: 'Insufficient token balance' }, { status: 400 });
  }
  if (amountTokens < 100) {
    return NextResponse.json({ error: 'Minimum payout is 100 tokens' }, { status: 400 });
  }

  const amountUsd = amountTokens * TOKEN_TO_USD;

  db.prepare(`
    INSERT INTO payout_requests (id, performer_id, amount_tokens, amount_usd, bank_details)
    VALUES (?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), auth.userId, amountTokens, amountUsd, JSON.stringify(bankDetails));

  return NextResponse.json({ success: true, amountUsd });
}
