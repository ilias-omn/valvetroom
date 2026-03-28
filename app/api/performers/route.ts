export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

function parsePerformer(p: Record<string, unknown>) {
  let availability = {}; try { availability = JSON.parse((p.availability as string) || '{}'); } catch {}
  let services: string[] = []; try { services = JSON.parse((p.services as string) || '[]'); } catch {}
  let pricing = {}; try { pricing = JSON.parse((p.pricing as string) || '{}'); } catch {}
  return { ...p, availability, services, pricing };
}

export async function GET() {
  const performers = db.prepare(`
    SELECT p.*, u.username, u.email
    FROM performers p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.is_online DESC, p.display_name ASC
  `).all() as Array<Record<string, unknown> & { id: string }>;

  const photos = db.prepare('SELECT * FROM performer_photos ORDER BY created_at ASC').all() as Array<{ id: string; performer_id: string; url: string }>;

  const result = performers.map(p => ({
    ...parsePerformer(p),
    photos: photos.filter(ph => ph.performer_id === p.id).map(ph => ({ id: ph.id, url: ph.url })),
  }));

  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'performer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const performer = db.prepare('SELECT * FROM performers WHERE user_id = ?').get(auth.userId) as { id: string } | undefined;
  if (!performer) return NextResponse.json({ error: 'Performer not found' }, { status: 404 });

  const { display_name, bio, rate_per_minute, is_online, is_available, availability, services, pricing, location, tagline, subscription_price } = body;

  db.prepare(`
    UPDATE performers SET
      display_name = COALESCE(?, display_name),
      bio = COALESCE(?, bio),
      rate_per_minute = COALESCE(?, rate_per_minute),
      is_online = COALESCE(?, is_online),
      is_available = COALESCE(?, is_available),
      availability = COALESCE(?, availability),
      services = COALESCE(?, services),
      pricing = COALESCE(?, pricing),
      location = COALESCE(?, location),
      tagline = COALESCE(?, tagline),
      subscription_price = COALESCE(?, subscription_price)
    WHERE user_id = ?
  `).run(
    display_name ?? null,
    bio ?? null,
    rate_per_minute ?? null,
    is_online !== undefined ? (is_online ? 1 : 0) : null,
    is_available !== undefined ? (is_available ? 1 : 0) : null,
    availability !== undefined ? JSON.stringify(availability) : null,
    services !== undefined ? JSON.stringify(services) : null,
    pricing !== undefined ? JSON.stringify(pricing) : null,
    location ?? null,
    tagline ?? null,
    subscription_price !== undefined ? subscription_price : null,
    auth.userId
  );

  return NextResponse.json({ success: true });
}
