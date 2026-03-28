import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import path from 'path';
import fs from 'fs';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;  // 50MB images
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB videos

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuthFromRequest(request);
  if (!auth || auth.role !== 'performer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const performer = db.prepare('SELECT id FROM performers WHERE user_id = ?').get(auth.userId) as any;
  if (!performer) return NextResponse.json({ error: 'Performer not found' }, { status: 404 });

  const post = db.prepare('SELECT * FROM performer_posts WHERE id = ?').get(params.id) as any;
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  if (post.performer_id !== performer.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('media') as File | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Use JPEG, PNG, WebP, GIF, MP4, MOV, or WebM.' }, { status: 400 });
  }

  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

  if (file.size > maxSize) {
    return NextResponse.json({ error: `File too large. Max ${isVideo ? '500MB for videos' : '50MB for images'}.` }, { status: 400 });
  }

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'posts');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
  const filename = `${params.id}-${Date.now()}.${ext}`;
  const filePath = path.join(uploadsDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  const publicUrl = `/uploads/posts/${filename}`;
  const mediaId = crypto.randomUUID();
  db.prepare('INSERT INTO performer_post_media (id, post_id, url, media_type) VALUES (?, ?, ?, ?)').run(
    mediaId, params.id, publicUrl, isVideo ? 'video' : 'image'
  );

  return NextResponse.json({ id: mediaId, url: publicUrl, media_type: isVideo ? 'video' : 'image' });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuthFromRequest(request);
  if (!auth || auth.role !== 'performer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mediaId = request.nextUrl.searchParams.get('media_id');
  if (!mediaId) return NextResponse.json({ error: 'media_id required' }, { status: 400 });

  const performer = db.prepare('SELECT id FROM performers WHERE user_id = ?').get(auth.userId) as any;
  const post = db.prepare('SELECT * FROM performer_posts WHERE id = ?').get(params.id) as any;
  if (!post || post.performer_id !== performer?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const media = db.prepare('SELECT * FROM performer_post_media WHERE id = ? AND post_id = ?').get(mediaId, params.id) as any;
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete file from disk
  const filePath = path.join(process.cwd(), 'public', media.url);
  try { fs.unlinkSync(filePath); } catch {}

  db.prepare('DELETE FROM performer_post_media WHERE id = ?').run(mediaId);
  return NextResponse.json({ success: true });
}
