export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

// POST /api/performers/posts/media-url
// Saves a Firebase Storage media URL for a post
export async function POST(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'performer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const performer = db.prepare('SELECT id FROM performers WHERE user_id = ?').get(auth.userId) as any;
  if (!performer) return NextResponse.json({ error: 'Performer not found' }, { status: 404 });

  const { post_id, url, media_type } = await req.json();
  if (!post_id || !url) return NextResponse.json({ error: 'post_id and url required' }, { status: 400 });

  const post = db.prepare('SELECT * FROM performer_posts WHERE id = ?').get(post_id) as any;
  if (!post || post.performer_id !== performer.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const mediaId = crypto.randomUUID();
  db.prepare('INSERT INTO performer_post_media (id, post_id, url, media_type) VALUES (?, ?, ?, ?)').run(
    mediaId, post_id, url, media_type || 'image'
  );

  return NextResponse.json({ id: mediaId, url, media_type: media_type || 'image' });
}
