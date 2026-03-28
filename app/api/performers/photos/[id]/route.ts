import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import path from 'path';
import fs from 'fs';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'performer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const performer = db.prepare('SELECT id FROM performers WHERE user_id = ?').get(auth.userId) as { id: string } | undefined;
  if (!performer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const photo = db.prepare('SELECT * FROM performer_photos WHERE id = ? AND performer_id = ?').get(params.id, performer.id) as { id: string; url: string } | undefined;
  if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });

  // Delete file from disk
  const filePath = path.join(process.cwd(), 'public', photo.url.replace(/^\//, ''));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM performer_photos WHERE id = ?').run(photo.id);

  return NextResponse.json({ success: true });
}
