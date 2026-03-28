import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Recent sign-ups
  const recentSignups = db.prepare(`
    SELECT id, username, email, role, created_at
    FROM users
    WHERE role != 'admin'
    ORDER BY created_at DESC
    LIMIT 20
  `).all() as { id: string; username: string; email: string; role: string; created_at: string }[];

  // Recent transactions
  const recentTransactions = db.prepare(`
    SELECT t.*, u.username
    FROM transactions t
    JOIN users u ON u.id = t.user_id
    ORDER BY t.created_at DESC
    LIMIT 20
  `).all() as { id: string; username: string; amount: number; type: string; description: string; created_at: string }[];

  // Recent calls with names
  const recentCalls = db.prepare(`
    SELECT c.*, cu.username as customer_name, pu.username as performer_name
    FROM calls c
    JOIN users cu ON cu.id = c.customer_id
    JOIN users pu ON pu.id = c.performer_id
    ORDER BY c.created_at DESC
    LIMIT 20
  `).all() as {
    id: string;
    customer_name: string;
    performer_name: string;
    status: string;
    tokens_charged: number;
    duration_seconds: number;
    created_at: string;
  }[];

  // Recent bookings
  const recentBookings = db.prepare(`
    SELECT b.*, cu.username as customer_name, p.display_name as performer_name
    FROM bookings b
    JOIN users cu ON cu.id = b.customer_id
    JOIN performers p ON p.id = b.performer_id
    ORDER BY b.created_at DESC
    LIMIT 10
  `).all() as {
    id: string;
    customer_name: string;
    performer_name: string;
    date: string;
    time: string;
    status: string;
    created_at: string;
  }[];

  // Build a unified activity feed sorted by time
  const feed: { type: string; label: string; detail: string; created_at: string }[] = [];

  recentSignups.forEach(u => {
    feed.push({
      type: 'signup',
      label: `New ${u.role} registered`,
      detail: u.username,
      created_at: u.created_at,
    });
  });

  recentTransactions.forEach(t => {
    feed.push({
      type: 'transaction',
      label: `Token ${t.type.replace('_', ' ')}`,
      detail: `${t.username} • ${t.amount > 0 ? '+' : ''}${t.amount} tokens${t.description ? ' — ' + t.description : ''}`,
      created_at: t.created_at,
    });
  });

  recentCalls.forEach(c => {
    feed.push({
      type: 'call',
      label: `Call ${c.status}`,
      detail: `${c.customer_name} → ${c.performer_name}${c.tokens_charged ? ' • ' + c.tokens_charged + ' tokens' : ''}`,
      created_at: c.created_at,
    });
  });

  recentBookings.forEach(b => {
    feed.push({
      type: 'booking',
      label: `Booking ${b.status}`,
      detail: `${b.customer_name} → ${b.performer_name} on ${b.date} ${b.time}`,
      created_at: b.created_at,
    });
  });

  feed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({ feed: feed.slice(0, 50), recentSignups, recentCalls });
}
