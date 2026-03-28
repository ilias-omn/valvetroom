import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

// GET /api/performers/posts?performer_id=xxx
// Returns posts. If requester is not subscribed, description is hidden.
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const performerId = request.nextUrl.searchParams.get('performer_id');
  if (!performerId) return NextResponse.json({ error: 'performer_id required' }, { status: 400 });

  const posts = db.prepare(`
    SELECT pp.*, p.display_name as performer_name
    FROM performer_posts pp
    JOIN performers p ON p.id = pp.performer_id
    WHERE pp.performer_id = ?
    ORDER BY pp.created_at DESC
  `).all(performerId) as any[];

  const allMedia = db.prepare(`
    SELECT * FROM performer_post_media
    WHERE post_id IN (SELECT id FROM performer_posts WHERE performer_id = ?)
    ORDER BY created_at ASC
  `).all(performerId) as any[];

  // Check subscription
  let isSubscribed = false;
  let isOwner = false;

  if (auth) {
    const performer = db.prepare('SELECT user_id FROM performers WHERE id = ?').get(performerId) as any;
    if (performer && performer.user_id === auth.userId) isOwner = true;

    if (!isOwner) {
      const sub = db.prepare(`
        SELECT id FROM subscriptions
        WHERE user_id = ? AND performer_id = ? AND expires_at > datetime('now') AND status = 'active'
      `).get(auth.userId, performerId);
      isSubscribed = !!sub;
    }
  }

  const result = posts.map(post => {
    const media = allMedia.filter(m => m.post_id === post.id);
    const unlocked = isOwner || isSubscribed;
    return {
      id: post.id,
      performer_id: post.performer_id,
      performer_name: post.performer_name,
      title: post.title,
      description: unlocked ? post.description : null,
      media: unlocked ? media.map(m => ({ id: m.id, url: m.url, media_type: m.media_type })) : [],
      locked: !unlocked,
      created_at: post.created_at,
    };
  });

  return NextResponse.json({ posts: result, isSubscribed, isOwner });
}

// POST /api/performers/posts — create a post (performer only)
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.role !== 'performer') return NextResponse.json({ error: 'Only performers can create posts' }, { status: 403 });

  const performer = db.prepare('SELECT id FROM performers WHERE user_id = ?').get(auth.userId) as any;
  if (!performer) return NextResponse.json({ error: 'Performer profile not found' }, { status: 404 });

  const { title, description } = await request.json();
  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!description?.trim()) return NextResponse.json({ error: 'Description is required' }, { status: 400 });

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO performer_posts (id, performer_id, title, description)
    VALUES (?, ?, ?, ?)
  `).run(id, performer.id, title.trim(), description.trim());

  const post = db.prepare('SELECT * FROM performer_posts WHERE id = ?').get(id);
  return NextResponse.json(post, { status: 201 });
}
