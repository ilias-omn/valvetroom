import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

const PACKAGES: Record<string, { tokens: number; price: number }> = {
  starter: { tokens: 100, price: 10 },
  popular: { tokens: 250, price: 20 },
  premium: { tokens: 600, price: 40 },
};

// GET: return bank details for payment
export async function GET(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  rows.forEach(r => { settings[r.key] = r.value; });

  return NextResponse.json({
    bankName: settings.bank_name || '',
    accountName: settings.bank_account_name || '',
    accountNumber: settings.bank_account_number || '',
    iban: settings.bank_iban || '',
    swift: settings.bank_swift || '',
    instructions: settings.bank_instructions || 'Transfer the exact amount and use your reference code as the payment description.',
  });
}

// POST: credit tokens immediately (customer self-confirms transfer)
export async function POST(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { package: pkg, reference } = await req.json();
  const selected = PACKAGES[pkg];
  if (!selected) return NextResponse.json({ error: 'Invalid package' }, { status: 400 });

  const existing = db.prepare('SELECT balance FROM tokens WHERE user_id = ?').get(auth.userId);
  if (existing) {
    db.prepare('UPDATE tokens SET balance = balance + ? WHERE user_id = ?').run(selected.tokens, auth.userId);
  } else {
    db.prepare('INSERT INTO tokens (id, user_id, balance) VALUES (?, ?, ?)').run(
      crypto.randomUUID(), auth.userId, selected.tokens
    );
  }

  db.prepare(
    'INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)'
  ).run(
    crypto.randomUUID(),
    auth.userId,
    selected.tokens,
    'purchase',
    `Bank transfer — ${selected.tokens} tokens ($${selected.price}) — ref: ${reference}`
  );

  const { balance } = db.prepare('SELECT balance FROM tokens WHERE user_id = ?').get(auth.userId) as { balance: number };
  return NextResponse.json({ success: true, balance, added: selected.tokens });
}
