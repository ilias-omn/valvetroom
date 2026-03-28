import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { status } = await req.json();

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(params.id) as {
    id: string; customer_id: string; performer_id: string; status: string;
  } | undefined;
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (auth.role === 'performer') {
    const performer = db.prepare('SELECT id FROM performers WHERE user_id = ?').get(auth.userId) as { id: string } | undefined;
    if (!performer || performer.id !== booking.performer_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!['confirmed', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
  } else if (auth.role === 'customer') {
    if (booking.customer_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (status !== 'cancelled') {
      return NextResponse.json({ error: 'Customers can only cancel bookings' }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, params.id);
  return NextResponse.json({ success: true });
}
