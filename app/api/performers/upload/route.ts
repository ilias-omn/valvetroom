import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import path from 'path';
import fs from 'fs';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PHOTOS = 10;

export async function POST(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'performer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const performer = db.prepare('SELECT id FROM performers WHERE user_id = ?').get(auth.userId) as { id: string } | undefined;
  if (!performer) return NextResponse.json({ error: 'Performer not found' }, { status: 404 });

  const photoCount = (db.prepare('SELECT COUNT(*) as count FROM performer_photos WHERE performer_id = ?').get(performer.id) as { count: number }).count;
  if (photoCount >= MAX_PHOTOS) {
    return NextResponse.json({ error: `Max ${MAX_PHOTOS} photos allowed. Delete one first.` }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get('picture') as File | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Use JPEG, PNG, WebP, or GIF.' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Max 5MB.' }, { status: 400 });
  }

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'performers');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const filename = `${auth.userId}-${Date.now()}.${ext}`;
  const filePath = path.join(uploadsDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  const publicUrl = `/uploads/performers/${filename}`;
  const photoId = crypto.randomUUID();
  db.prepare('INSERT INTO performer_photos (id, performer_id, url) VALUES (?, ?, ?)').run(photoId, performer.id, publicUrl);

  return NextResponse.json({ id: photoId, url: publicUrl });
}
