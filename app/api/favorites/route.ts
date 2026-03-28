export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = db.prepare(`
    SELECT p.*, u.username,
      (SELECT url FROM performer_photos WHERE performer_id = p.id ORDER BY created_at ASC LIMIT 1) as first_photo
    FROM favorites f
    JOIN performers p ON p.id = f.performer_id
    JOIN users u ON u.id = p.user_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(auth.userId) as Array<Record<string, unknown>>;

  const result = rows.map(p => {
    let services: string[] = []; try { services = JSON.parse((p.services as string) || '[]'); } catch {}
    let pricing = {}; try { pricing = JSON.parse((p.pricing as string) || '{}'); } catch {}
    return {
      ...p,
      services,
      pricing,
      photos: p.first_photo ? [{ id: 'main', url: p.first_photo }] : [],
    };
  });

  return NextResponse.json(result);
}

// Toggle favorite
export async function POST(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { performer_id } = await req.json();
  if (!performer_id) return NextResponse.json({ error: 'performer_id required' }, { status: 400 });

  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND performer_id = ?').get(auth.userId, performer_id);

  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND performer_id = ?').run(auth.userId, performer_id);
    return NextResponse.json({ favorited: false });
  } else {
    db.prepare('INSERT INTO favorites (id, user_id, performer_id) VALUES (?, ?, ?)').run(crypto.randomUUID(), auth.userId, performer_id);
    return NextResponse.json({ favorited: true });
  }
}
