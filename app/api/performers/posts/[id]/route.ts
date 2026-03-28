export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

// DELETE /api/performers/posts/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuthFromRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.role !== 'performer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const performer = db.prepare('SELECT id FROM performers WHERE user_id = ?').get(auth.userId) as any;
  if (!performer) return NextResponse.json({ error: 'Performer not found' }, { status: 404 });

  const post = db.prepare('SELECT * FROM performer_posts WHERE id = ?').get(params.id) as any;
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  if (post.performer_id !== performer.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  db.prepare('DELETE FROM performer_posts WHERE id = ?').run(params.id);
  return NextResponse.json({ success: true });
}
