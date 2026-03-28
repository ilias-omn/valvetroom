export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

// POST /api/performers/upload-url
// Saves a Firebase Storage photo URL for the performer
export async function POST(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'performer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const performer = db.prepare('SELECT id FROM performers WHERE user_id = ?').get(auth.userId) as { id: string } | undefined;
  if (!performer) return NextResponse.json({ error: 'Performer not found' }, { status: 404 });

  const photoCount = (db.prepare('SELECT COUNT(*) as count FROM performer_photos WHERE performer_id = ?').get(performer.id) as { count: number }).count;
  if (photoCount >= 10) {
    return NextResponse.json({ error: 'Max 10 photos allowed. Delete one first.' }, { status: 400 });
  }

  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  const photoId = crypto.randomUUID();
  db.prepare('INSERT INTO performer_photos (id, performer_id, url) VALUES (?, ?, ?)').run(photoId, performer.id, url);

  return NextResponse.json({ id: photoId, url });
}
