import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, generateToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, email, password, role } = await req.json();

    if (!username || !email || !password || !role) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    }
    if (!['customer', 'performer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) {
      return NextResponse.json({ error: 'Email or username already taken' }, { status: 409 });
    }

    const userId = crypto.randomUUID();
    const hash = hashPassword(password);

    db.prepare(
      'INSERT INTO users (id, username, email, password_hash, role, age_verified) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, username, email, hash, role, 1);

    // Create token balance
    db.prepare('INSERT INTO tokens (id, user_id, balance) VALUES (?, ?, ?)').run(
      crypto.randomUUID(), userId, 0
    );

    // If performer, create performer profile
    if (role === 'performer') {
      db.prepare(
        'INSERT INTO performers (id, user_id, display_name, bio, rate_per_minute, avatar_color) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), userId, username, '', 10, '#ec4899');
    }

    const token = generateToken(userId, role);

    const res = NextResponse.json({ success: true, role });
    res.cookies.set('auth_token', token, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return res;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
