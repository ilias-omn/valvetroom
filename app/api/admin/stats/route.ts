import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = getAuthFromRequest(req);
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin'").get() as { c: number }).c;
  const totalPerformers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'performer'").get() as { c: number }).c;
  const totalCustomers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'customer'").get() as { c: number }).c;
  const onlinePerformers = (db.prepare("SELECT COUNT(*) as c FROM performers WHERE is_online = 1").get() as { c: number }).c;
  const totalCalls = (db.prepare("SELECT COUNT(*) as c FROM calls").get() as { c: number }).c;
  const activeCalls = (db.prepare("SELECT COUNT(*) as c FROM calls WHERE status = 'active'").get() as { c: number }).c;
  const totalTokensTraded = (db.prepare("SELECT COALESCE(SUM(tokens_charged),0) as t FROM calls WHERE status = 'ended'").get() as { t: number }).t;
  const recentCalls = db.prepare(`
    SELECT c.*, cu.username as customer_name, pu.username as performer_name
    FROM calls c
    JOIN users cu ON cu.id = c.customer_id
    JOIN users pu ON pu.id = c.performer_id
    ORDER BY c.created_at DESC LIMIT 10
  `).all();

  return NextResponse.json({
    totalUsers, totalPerformers, totalCustomers, onlinePerformers,
    totalCalls, activeCalls, totalTokensTraded, recentCalls,
  });
}
