import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const performer_id = searchParams.get('performer_id');
  const date = searchParams.get('date');

  if (!performer_id || !date) return NextResponse.json([]);

  const rows = db.prepare(`
    SELECT time FROM bookings
    WHERE performer_id = ? AND date = ? AND status IN ('pending','confirmed')
  `).all(performer_id, date) as Array<{ time: string }>;

  return NextResponse.json(rows.map(r => r.time));
}
