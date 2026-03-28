export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { getAdminAuth } from '@/lib/firebase-admin';

// POST /api/auth/firebase
// Accepts a Firebase ID token, verifies it, creates/finds the user in DB, issues local JWT
export async function POST(req: NextRequest) {
  try {
    const { idToken, role, username } = await req.json();
    if (!idToken) return NextResponse.json({ error: 'ID token required' }, { status: 400 });

    // Verify Firebase token
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    const firebaseUid = decoded.uid;
    const email = decoded.email || `${firebaseUid}@firebase.user`;
    const displayName = decoded.name || username || email.split('@')[0];

    // Find existing user by firebase_uid or email
    let user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(firebaseUid) as any;

    if (!user) {
      // Try by email
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
      if (user) {
        // Link firebase_uid to existing account
        db.prepare('UPDATE users SET firebase_uid = ? WHERE id = ?').run(firebaseUid, user.id);
      }
    }

    if (!user) {
      // New user — need a role
      const assignedRole = role || 'customer';
      if (!['customer', 'performer'].includes(assignedRole)) {
        return NextResponse.json({ error: 'Valid role required for new accounts' }, { status: 400 });
      }

      const userId = crypto.randomUUID();
      const safeUsername = displayName.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || `user${userId.slice(0, 6)}`;

      // Ensure unique username
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(safeUsername);
      const finalUsername = existing ? `${safeUsername}${userId.slice(0, 4)}` : safeUsername;

      db.prepare(
        'INSERT INTO users (id, username, email, password_hash, role, age_verified, firebase_uid) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(userId, finalUsername, email, '', assignedRole, 1, firebaseUid);

      db.prepare('INSERT INTO tokens (id, user_id, balance) VALUES (?, ?, ?)').run(
        crypto.randomUUID(), userId, 0
      );

      if (assignedRole === 'performer') {
        db.prepare(
          'INSERT INTO performers (id, user_id, display_name, bio, rate_per_minute, avatar_color) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(crypto.randomUUID(), userId, displayName, '', 10, '#ec4899');
      }

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }

    const token = generateToken(user.id, user.role);
    const res = NextResponse.json({ success: true, role: user.role, username: user.username });
    res.cookies.set('auth_token', token, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return res;
  } catch (e: unknown) {
    console.error('Firebase auth error:', e);
    const msg = e instanceof Error ? e.message : 'Authentication failed';
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
