export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let bookings;
  const performerIdFilter = req.nextUrl.searchParams.get('performer_id');
  if (auth.role === 'customer') {
    if (performerIdFilter) {
      bookings = db.prepare(`
        SELECT b.*, p.display_name as performer_name
        FROM bookings b
        JOIN performers p ON p.id = b.performer_id
        WHERE b.customer_id = ? AND b.performer_id = ?
        ORDER BY b.date ASC, b.time ASC
      `).all(auth.userId, performerIdFilter);
    } else {
      bookings = db.prepare(`
        SELECT b.*, p.display_name as performer_name
        FROM bookings b
        JOIN performers p ON p.id = b.performer_id
        WHERE b.customer_id = ?
        ORDER BY b.date DESC, b.time DESC
      `).all(auth.userId);
    }
  } else if (auth.role === 'performer') {

    const performer = db.prepare('SELECT id FROM performers WHERE user_id = ?').get(auth.userId) as { id: string } | undefined;
    if (!performer) return NextResponse.json([], { status: 200 });
    bookings = db.prepare(`
      SELECT b.*, u.username as customer_name
      FROM bookings b
      JOIN users u ON u.id = b.customer_id
      WHERE b.performer_id = ?
      ORDER BY b.date DESC, b.time DESC
    `).all(performer.id);
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(bookings);
}

export async function POST(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'customer') {
    return NextResponse.json({ error: 'Only customers can book performers' }, { status: 403 });
  }

  const { performer_id, date, time, duration_minutes, note } = await req.json();

  if (!performer_id || !date || !time) {
    return NextResponse.json({ error: 'performer_id, date and time are required' }, { status: 400 });
  }

  const performer = db.prepare('SELECT id FROM performers WHERE id = ?').get(performer_id) as { id: string } | undefined;
  if (!performer) return NextResponse.json({ error: 'Performer not found' }, { status: 404 });

  // Prevent double-booking same slot
  const conflict = db.prepare(`
    SELECT id FROM bookings
    WHERE performer_id = ? AND date = ? AND time = ? AND status IN ('pending','confirmed')
  `).get(performer_id, date, time);
  if (conflict) return NextResponse.json({ error: 'That time slot is already booked.' }, { status: 409 });

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO bookings (id, customer_id, performer_id, date, time, duration_minutes, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, auth.userId, performer_id, date, time, duration_minutes || 60, note || '');

  return NextResponse.json({ id });
}
