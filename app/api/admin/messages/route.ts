import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const messages = db.prepare(`
    SELECT
      m.id,
      m.call_id,
      m.content,
      m.created_at,
      u.username as sender_name,
      u.role as sender_role,
      cu.username as customer_name,
      pu.username as performer_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    JOIN calls c ON c.id = m.call_id
    JOIN users cu ON cu.id = c.customer_id
    JOIN users pu ON pu.id = c.performer_id
    ORDER BY m.created_at DESC
    LIMIT 100
  `).all() as {
    id: string;
    call_id: string;
    content: string;
    created_at: string;
    sender_name: string;
    sender_role: string;
    customer_name: string;
    performer_name: string;
  }[];

  return NextResponse.json({ messages });
}
