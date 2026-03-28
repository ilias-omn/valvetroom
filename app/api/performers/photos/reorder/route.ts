import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

// Receives ordered array of photo ids and updates created_at to reflect order
export async function POST(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'performer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const performer = db.prepare('SELECT id FROM performers WHERE user_id = ?').get(auth.userId) as { id: string } | undefined;
  if (!performer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { order } = await req.json() as { order: string[] };
  if (!Array.isArray(order)) return NextResponse.json({ error: 'order must be an array' }, { status: 400 });

  // Re-stamp created_at with synthetic ascending timestamps to preserve order
  const base = new Date('2000-01-01T00:00:00Z').getTime();
  const update = db.prepare('UPDATE performer_photos SET created_at = ? WHERE id = ? AND performer_id = ?');
  const tx = db.transaction(() => {
    order.forEach((id, i) => {
      const ts = new Date(base + i * 1000).toISOString();
      update.run(ts, id, performer.id);
    });
  });
  tx();

  return NextResponse.json({ success: true });
}
