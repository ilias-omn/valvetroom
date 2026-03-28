'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

// ---- Types ----
interface Stats {
  totalUsers: number;
  totalPerformers: number;
  totalCustomers: number;
  onlinePerformers: number;
  totalCalls: number;
  activeCalls: number;
  totalTokensTraded: number;
  recentCalls: RecentCall[];
}

interface RecentCall {
  id: string;
  customer_name: string;
  performer_name: string;
  status: string;
  tokens_charged: number;
  duration_seconds: number;
  created_at: string;
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  role: string;
  token_balance: number;
  created_at: string;
}

interface ActivityItem {
  type: string;
  label: string;
  detail: string;
  created_at: string;
}

interface PayoutRequest {
  id: string;
  performer_username: string;
  amount_tokens: number;
  amount_usd: number;
  bank_details: string;
  status: string;
  note: string;
  created_at: string;
  paid_at: string | null;
}

interface BankSettings {
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_iban: string;
  bank_swift: string;
  bank_instructions: string;
}

interface ChatMessage {
  id: string;
  call_id: string;
  content: string;
  created_at: string;
  sender_name: string;
  sender_role: string;
  customer_name: string;
  performer_name: string;
}

interface Session {
  socketId: string;
  userId?: string;
  username?: string;
  role?: string;
  page?: string;
  connectedAt?: number;
}

interface LiveEvent {
  type: string;
  data: Record<string, unknown>;
  ts: number;
}

// ---- Helpers ----
const EVENT_COLORS: Record<string, string> = {
  'new-login': 'text-green-400',
  'new-register': 'text-blue-400',
  'user-connected': 'text-gray-400',
  'user-disconnected': 'text-gray-600',
  'call-requested': 'text-yellow-400',
  'call-accepted': 'text-green-400',
  'call-rejected': 'text-red-400',
  'call-ended': 'text-gray-400',
  'chat-message': 'text-purple-400',
  'performer-online': 'text-green-400',
  'performer-offline': 'text-red-400',
  'viewer-joined': 'text-blue-300',
  'viewer-left': 'text-gray-500',
};

const EVENT_ICONS: Record<string, string> = {
  'new-login': '🔑',
  'new-register': '✨',
  'user-connected': '→',
  'user-disconnected': '←',
  'call-requested': '📞',
  'call-accepted': '✅',
  'call-rejected': '❌',
  'call-ended': '📵',
  'chat-message': '💬',
  'performer-online': '🟢',
  'performer-offline': '🔴',
  'viewer-joined': '👁',
  'viewer-left': '👁',
};

function formatLiveEvent(event: LiveEvent): string {
  const d = event.data;
  switch (event.type) {
    case 'new-login': return `${d.username} (${d.role}) logged in`;
    case 'new-register': return `${d.username} (${d.role}) registered`;
    case 'user-connected': return `${d.username || 'guest'} connected`;
    case 'user-disconnected': return `${d.username || 'guest'} disconnected`;
    case 'call-requested': return `Call — ${d.customerName} requested a call`;
    case 'call-accepted': return `Call accepted by ${d.performerUsername}`;
    case 'call-rejected': return `Call rejected by ${d.performerUsername}`;
    case 'call-ended': return `Call ended${d.endedBy ? ' by ' + d.endedBy : ''}${d.reason ? ' (' + d.reason + ')' : ''}`;
    case 'chat-message': return `${d.senderName}: "${d.message}"`;
    case 'performer-online': return `${d.username || d.performerId} went online`;
    case 'performer-offline': return `${d.username || d.performerId} went offline${d.reason ? ' (' + d.reason + ')' : ''}`;
    case 'viewer-joined': return `${d.username || 'guest'} is viewing a performer page`;
    case 'viewer-left': return `Viewer left a performer page`;
    default: return JSON.stringify(d);
  }
}

type Tab = 'overview' | 'users' | 'live' | 'chats' | 'sessions' | 'payments';

// ---- Component ----
export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [liveEvents, setLiveEvents] = useState<(LiveEvent & { id: number })[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [bankSettings, setBankSettings] = useState<BankSettings>({ bank_name: '', bank_account_name: '', bank_account_number: '', bank_iban: '', bank_swift: '', bank_instructions: '' });
  const [savingBank, setSavingBank] = useState(false);
  const [bankSaved, setBankSaved] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const eventIdRef = useRef(0);
  const router = useRouter();

  // Auth check + initial data
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (!d || d.role !== 'admin') { router.push('/login'); return; }
    });
    Promise.allSettled([
      fetch('/api/admin/stats').then(r => r.json()).catch(() => null),
      fetch('/api/admin/users').then(r => r.json()).catch(() => []),
      fetch('/api/admin/activity').then(r => r.json()).catch(() => ({ feed: [] })),
      fetch('/api/admin/messages').then(r => r.json()).catch(() => ({ messages: [] })),
      fetch('/api/admin/payouts').then(r => r.json()).catch(() => ({ payouts: [] })),
      fetch('/api/admin/settings').then(r => r.json()).catch(() => ({})),
    ]).then(results => {
      const [statsRes, usersRes, activityRes, messagesRes, payoutsRes, settingsRes] = results;
      const statsData = statsRes.status === 'fulfilled' ? statsRes.value : null;
      const usersData = usersRes.status === 'fulfilled' ? usersRes.value : [];
      const activityData = activityRes.status === 'fulfilled' ? activityRes.value : { feed: [] };
      const messagesData = messagesRes.status === 'fulfilled' ? messagesRes.value : { messages: [] };
      const payoutsData = payoutsRes.status === 'fulfilled' ? payoutsRes.value : { payouts: [] };
      const settingsData = settingsRes.status === 'fulfilled' ? settingsRes.value : {};
      setStats(statsData);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setActivity(activityData.feed || []);
      setMessages(messagesData.messages || []);
      setPayouts(payoutsData.payouts || []);
      setBankSettings(s => ({ ...s, ...settingsData }));
      setLoading(false);
    });
  }, [router]);

  // Socket.io for live feed
  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('admin-join');
    });
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('admin-sessions', (data: Session[]) => setSessions(data));

    socket.on('admin-event', (event: LiveEvent) => {
      setLiveEvents(prev => {
        const id = ++eventIdRef.current;
        return [{ ...event, id }, ...prev].slice(0, 200);
      });

      if (event.type === 'chat-message') {
        const d = event.data as { callId: string; message: string; senderName: string };
        setMessages(prev => [{
          id: String(eventIdRef.current),
          call_id: d.callId,
          content: d.message,
          created_at: new Date(event.ts).toISOString(),
          sender_name: d.senderName,
          sender_role: 'unknown',
          customer_name: '—',
          performer_name: '—',
        }, ...prev].slice(0, 200));
      }
    });

    return () => { socket.disconnect(); };
  }, []);

  const resetPassword = async (userId: string, username: string) => {
    const newPw = prompt(`Set new password for "${username}":`);
    if (!newPw) return;
    if (newPw.length < 6) { alert('Password must be at least 6 characters.'); return; }
    const res = await fetch('/api/admin/users/reset-password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newPassword: newPw }),
    });
    if (res.ok) alert('Password reset successfully.');
    else alert('Failed to reset password.');
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    setUsers(u => u.filter(x => x.id !== userId));
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'users', label: 'Users' },
    { key: 'payments', label: 'Payments' },
    { key: 'live', label: 'Live Feed' },
    { key: 'chats', label: 'Chats' },
    { key: 'sessions', label: 'Sessions' },
  ];

  const handlePayoutAction = async (payoutId: string, action: 'paid' | 'reject', note?: string) => {
    await fetch('/api/admin/payouts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payoutId, action, note }),
    });
    setPayouts(prev => prev.map(p => p.id === payoutId ? { ...p, status: action === 'paid' ? 'paid' : 'rejected' } : p));
  };

  const saveBank = async () => {
    setSavingBank(true);
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bankSettings),
    });
    setSavingBank(false);
    setBankSaved(true);
    setTimeout(() => setBankSaved(false), 2000);
  };

  if (loading) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-gray-500">Loading...</div>
  );

  return (
    <div className="min-h-screen bg-dark-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
            <span className={socketConnected ? 'text-green-400' : 'text-red-400'}>
              {socketConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-dark-800 border border-dark-600 rounded-xl p-1 w-fit flex-wrap">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg font-medium text-sm transition-all relative ${
                tab === t.key ? 'bg-primary-600 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              {t.label}
              {t.key === 'live' && liveEvents.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {liveEvents.length > 99 ? '!' : liveEvents.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total Users', value: stats.totalUsers, color: 'text-white' },
                { label: 'Performers', value: stats.totalPerformers, color: 'text-primary-400' },
                { label: 'Customers', value: stats.totalCustomers, color: 'text-blue-400' },
                { label: 'Online Now', value: stats.onlinePerformers, color: 'text-green-400' },
                { label: 'Total Calls', value: stats.totalCalls, color: 'text-white' },
                { label: 'Active Calls', value: stats.activeCalls, color: 'text-green-400' },
                { label: 'Tokens Traded', value: stats.totalTokensTraded, color: 'text-gold-400' },
                { label: 'Platform Cut (20%)', value: Math.floor(stats.totalTokensTraded * 0.2), color: 'text-gold-400' },
              ].map(s => (
                <div key={s.label} className="bg-dark-800 border border-dark-600 rounded-2xl p-5">
                  <div className={`text-3xl font-bold ${s.color}`}>{(s.value ?? 0).toLocaleString()}</div>
                  <div className="text-gray-500 text-sm mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Recent Activity */}
            <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>
            <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden mb-8">
              {activity.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-500 text-sm">No activity yet.</div>
              ) : (
                <div className="divide-y divide-dark-700">
                  {activity.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 px-5 py-3">
                      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        item.type === 'signup' ? 'bg-blue-400' :
                        item.type === 'call' ? 'bg-yellow-400' :
                        item.type === 'transaction' ? 'bg-yellow-300' :
                        'bg-purple-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-white text-sm font-medium">{item.label}</span>
                        <span className="text-gray-400 text-sm ml-2">{item.detail}</span>
                      </div>
                      <span className="text-gray-600 text-xs flex-shrink-0">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Calls */}
            <h2 className="text-xl font-bold text-white mb-4">Recent Calls</h2>
            <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-dark-600">
                  <tr className="text-gray-500 text-left">
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Performer</th>
                    <th className="px-5 py-3">Duration</th>
                    <th className="px-5 py-3">Tokens</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentCalls.map(c => (
                    <tr key={c.id} className="border-b border-dark-700 last:border-0">
                      <td className="px-5 py-3 text-white">{c.customer_name}</td>
                      <td className="px-5 py-3 text-gray-300">{c.performer_name}</td>
                      <td className="px-5 py-3 text-gray-400">
                        {c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` : '—'}
                      </td>
                      <td className="px-5 py-3 text-gold-400">{c.tokens_charged || '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          c.status === 'ended' ? 'bg-gray-600/30 text-gray-400' :
                          c.status === 'active' ? 'bg-green-500/20 text-green-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>{c.status}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* USERS TAB */}
        {tab === 'users' && (
          <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-dark-600">
                <tr className="text-gray-500 text-left">
                  <th className="px-5 py-3">Username</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Tokens</th>
                  <th className="px-5 py-3">Joined</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-dark-700 last:border-0">
                    <td className="px-5 py-3 text-white font-medium">{u.username}</td>
                    <td className="px-5 py-3 text-gray-400">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'admin' ? 'bg-red-500/20 text-red-400' :
                        u.role === 'performer' ? 'bg-primary-500/20 text-primary-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>{u.role}</span>
                    </td>
                    <td className="px-5 py-3 text-gold-400">{u.token_balance}</td>
                    <td className="px-5 py-3 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 flex items-center gap-3">
                      <button
                        onClick={() => resetPassword(u.id, u.username)}
                        className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
                      >
                        Reset PW
                      </button>
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => deleteUser(u.id)}
                          className="text-red-500 hover:text-red-400 text-xs transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* LIVE FEED TAB */}
        {tab === 'live' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Real-time Events</h2>
              <button
                onClick={() => setLiveEvents([])}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
              {liveEvents.length === 0 ? (
                <div className="px-5 py-16 text-center text-gray-500 text-sm">
                  <div className="text-2xl mb-2">📡</div>
                  Waiting for events…
                </div>
              ) : (
                <div className="divide-y divide-dark-700 max-h-[600px] overflow-y-auto">
                  {liveEvents.map(event => (
                    <div key={event.id} className="flex items-start gap-3 px-5 py-3 hover:bg-dark-700/30 transition-colors">
                      <span className="text-base flex-shrink-0 mt-0.5">
                        {EVENT_ICONS[event.type] || '•'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-mono font-semibold uppercase tracking-wide ${EVENT_COLORS[event.type] || 'text-gray-400'}`}>
                          {event.type}
                        </span>
                        <p className="text-gray-300 text-sm mt-0.5 break-words">
                          {formatLiveEvent(event)}
                        </p>
                      </div>
                      <span className="text-gray-600 text-xs flex-shrink-0 tabular-nums">
                        {new Date(event.ts).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* CHATS TAB */}
        {tab === 'chats' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Chat Messages</h2>
              <span className="text-xs text-gray-500">{messages.length} messages</span>
            </div>
            <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
              {messages.length === 0 ? (
                <div className="px-5 py-16 text-center text-gray-500 text-sm">No messages yet.</div>
              ) : (
                <div className="divide-y divide-dark-700 max-h-[600px] overflow-y-auto">
                  {messages.map((msg, i) => (
                    <div key={msg.id || i} className="flex items-start gap-3 px-5 py-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-600/30 flex items-center justify-center text-xs font-bold text-primary-400">
                        {(msg.sender_name || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-white text-sm font-medium">{msg.sender_name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            msg.sender_role === 'performer' ? 'bg-primary-500/20 text-primary-400' : 'bg-blue-500/20 text-blue-400'
                          }`}>{msg.sender_role}</span>
                          {msg.customer_name !== '—' && (
                            <span className="text-gray-600 text-xs">
                              {msg.customer_name} ↔ {msg.performer_name}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-300 text-sm break-words">{msg.content}</p>
                      </div>
                      <span className="text-gray-600 text-xs flex-shrink-0 tabular-nums">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SESSIONS TAB */}
        {tab === 'sessions' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Active Sessions</h2>
              <span className="text-xs text-gray-500">{sessions.length} connected</span>
            </div>
            <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
              {sessions.length === 0 ? (
                <div className="px-5 py-16 text-center text-gray-500 text-sm">
                  <div className="text-2xl mb-2">👥</div>
                  No active sessions right now.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-dark-600">
                    <tr className="text-gray-500 text-left">
                      <th className="px-5 py-3">User</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Page</th>
                      <th className="px-5 py-3">Connected</th>
                      <th className="px-5 py-3">Socket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.socketId} className="border-b border-dark-700 last:border-0">
                        <td className="px-5 py-3 text-white font-medium">
                          {s.username || <span className="text-gray-600">anonymous</span>}
                        </td>
                        <td className="px-5 py-3">
                          {s.role ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              s.role === 'admin' ? 'bg-red-500/20 text-red-400' :
                              s.role === 'performer' ? 'bg-primary-500/20 text-primary-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>{s.role}</span>
                          ) : <span className="text-gray-600 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3 text-gray-400 font-mono text-xs">{s.page || '/'}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {s.connectedAt ? new Date(s.connectedAt).toLocaleTimeString() : '—'}
                        </td>
                        <td className="px-5 py-3 text-gray-700 font-mono text-xs">{s.socketId.slice(0, 8)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* PAYMENTS TAB */}
        {tab === 'payments' && (
          <div className="space-y-8">
            {/* Bank Account Settings */}
            <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-1">Your Bank Account</h2>
              <p className="text-gray-500 text-xs mb-5">Customers see these details when buying tokens</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  { key: 'bank_name', label: 'Bank Name', placeholder: 'e.g. Chase, HSBC' },
                  { key: 'bank_account_name', label: 'Account Name', placeholder: 'Full name on account' },
                  { key: 'bank_account_number', label: 'Account Number', placeholder: '000000000' },
                  { key: 'bank_iban', label: 'IBAN', placeholder: 'GB00 XXXX...' },
                  { key: 'bank_swift', label: 'SWIFT / BIC', placeholder: 'XXXXGB2L' },
                ] as { key: keyof BankSettings; label: string; placeholder: string }[]).map(f => (
                  <div key={f.key}>
                    <label className="block text-gray-400 text-xs mb-1">{f.label}</label>
                    <input
                      value={bankSettings[f.key]}
                      onChange={e => setBankSettings(s => ({ ...s, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full bg-dark-700 border border-dark-500 text-white px-4 py-2.5 rounded-xl text-sm font-mono focus:outline-none focus:border-primary-500"
                    />
                  </div>
                ))}
                <div className="md:col-span-2">
                  <label className="block text-gray-400 text-xs mb-1">Payment Instructions</label>
                  <textarea
                    value={bankSettings.bank_instructions}
                    onChange={e => setBankSettings(s => ({ ...s, bank_instructions: e.target.value }))}
                    rows={2}
                    className="w-full bg-dark-700 border border-dark-500 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary-500 resize-none"
                    placeholder="Instructions shown to customer after they see bank details..."
                  />
                </div>
              </div>
              <button
                onClick={saveBank}
                disabled={savingBank}
                className="mt-4 px-6 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-all"
              >
                {bankSaved ? 'Saved!' : savingBank ? 'Saving...' : 'Save Bank Details'}
              </button>
            </div>

            {/* Payout Requests */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Performer Payout Requests</h2>
                <span className="text-xs text-gray-500">
                  {payouts.filter(p => p.status === 'pending').length} pending
                </span>
              </div>
              <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
                {payouts.length === 0 ? (
                  <div className="px-5 py-16 text-center text-gray-500 text-sm">No payout requests yet.</div>
                ) : (
                  <div className="divide-y divide-dark-700">
                    {payouts.map(p => {
                      const bank = (() => { try { return JSON.parse(p.bank_details); } catch { return {}; } })();
                      return (
                        <div key={p.id} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-white font-semibold">{p.performer_username}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  p.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                                  p.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                                  'bg-yellow-500/20 text-yellow-400'
                                }`}>{p.status}</span>
                              </div>
                              <div className="text-yellow-400 font-bold">{p.amount_tokens} tokens — ${p.amount_usd.toFixed(2)}</div>
                              <div className="text-gray-500 text-xs mt-1">
                                {new Date(p.created_at).toLocaleString()}
                                {p.paid_at && <span className="ml-2 text-green-400">Paid: {new Date(p.paid_at).toLocaleString()}</span>}
                              </div>
                              {/* Bank details */}
                              <div className="mt-2 text-xs space-y-0.5 text-gray-400">
                                {bank.accountName && <div><span className="text-gray-600">Name:</span> {bank.accountName}</div>}
                                {bank.bankName && <div><span className="text-gray-600">Bank:</span> {bank.bankName}</div>}
                                {bank.accountNumber && <div><span className="text-gray-600">Account:</span> <span className="font-mono">{bank.accountNumber}</span></div>}
                                {bank.iban && <div><span className="text-gray-600">IBAN:</span> <span className="font-mono">{bank.iban}</span></div>}
                                {bank.swift && <div><span className="text-gray-600">SWIFT:</span> <span className="font-mono">{bank.swift}</span></div>}
                              </div>
                            </div>
                            {p.status === 'pending' && (
                              <div className="flex gap-2 flex-shrink-0">
                                <button
                                  onClick={() => {
                                    const note = prompt('Note (optional):') || '';
                                    handlePayoutAction(p.id, 'reject', note);
                                  }}
                                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-xl text-sm font-medium transition-all"
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => {
                                    const note = prompt('Payment note / reference (optional):') || '';
                                    handlePayoutAction(p.id, 'paid', note);
                                  }}
                                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-bold transition-all"
                                >
                                  Mark as Paid
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
