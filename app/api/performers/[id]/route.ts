import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const performer = db.prepare(`
    SELECT p.*, u.username, u.created_at as member_since
    FROM performers p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(params.id) as (Record<string, unknown> & { id: string }) | undefined;

  if (!performer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const photos = db.prepare('SELECT id, url FROM performer_photos WHERE performer_id = ? ORDER BY created_at ASC').all(performer.id) as Array<{ id: string; url: string }>;

  let availability = {}; try { availability = JSON.parse((performer.availability as string) || '{}'); } catch {}
  let services: string[] = []; try { services = JSON.parse((performer.services as string) || '[]'); } catch {}
  let pricing = {}; try { pricing = JSON.parse((performer.pricing as string) || '{}'); } catch {}

  return NextResponse.json({ ...performer, availability, services, pricing, photos });
}
