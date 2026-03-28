'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PerformerCard from '@/components/PerformerCard';
import TokenPurchase from '@/components/TokenPurchase';
import type { Performer, Call } from '@/lib/types';

export default function CustomerDashboard() {
  const [user, setUser] = useState<{ id: string; username: string; role: string } | null>(null);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [balance, setBalance] = useState(0);
  const [showBuy, setShowBuy] = useState(false);
  const [callError, setCallError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d || d.error) { router.push('/login'); return; }
        if (d.role !== 'customer') { router.push('/'); return; }
        setUser(d);
      });
    fetch('/api/performers').then(r => r.json()).then(setPerformers);
    fetch('/api/tokens').then(r => r.json()).then(d => setBalance(d.balance));
    fetch('/api/calls').then(r => r.json()).then(setCalls);
  }, [router]);

  const handleCall = async (performer: Performer) => {
    setCallError('');
    const res = await fetch('/api/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ performer_id: performer.user_id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCallError(data.error);
      if (data.error?.includes('token')) setShowBuy(true);
      return;
    }
    router.push(`/call/${data.callId}`);
  };

  if (!user) return <div className="min-h-screen bg-dark-900 flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-dark-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Welcome, {user.username}</h1>
            <p className="text-gray-500 text-sm mt-1">Browse performers and start a call</p>
          </div>
        </div>

        {callError && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
            {callError}
          </div>
        )}

        {/* Performers */}
        <h2 className="text-xl font-bold text-white mb-4">Online Performers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-12">
          {performers.filter(p => p.is_online).map(p => (
            <PerformerCard key={p.id} performer={p} />
          ))}
          {performers.filter(p => p.is_online).length === 0 && (
            <p className="text-gray-600 col-span-4 py-10 text-center">No performers online right now. Check back soon!</p>
          )}
        </div>

        {/* Call History */}
        <h2 className="text-xl font-bold text-white mb-4">Call History</h2>
        <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
          {calls.length === 0 ? (
            <p className="text-gray-600 text-center py-10">No calls yet. Start your first call above!</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-dark-600">
                <tr className="text-gray-500 text-left">
                  <th className="px-6 py-3">Performer</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3">Tokens</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {calls.map(call => (
                  <tr key={call.id} className="border-b border-dark-700 last:border-0">
                    <td className="px-6 py-3 text-white">{call.performer_name}</td>
                    <td className="px-6 py-3 text-gray-400">
                      {call.duration_seconds
                        ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                        : '—'}
                    </td>
                    <td className="px-6 py-3 text-gold-400">{call.tokens_charged || '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        call.status === 'ended' ? 'bg-gray-600/30 text-gray-400' :
                        call.status === 'active' ? 'bg-green-500/20 text-green-400' :
                        call.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {call.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {new Date(call.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {showBuy && (
        <TokenPurchase
          onSuccess={b => { setBalance(b); setShowBuy(false); }}
          onClose={() => setShowBuy(false)}
        />
      )}
    </div>
  );
}
