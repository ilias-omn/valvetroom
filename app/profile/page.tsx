'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PerformerCard from '@/components/PerformerCard';
import type { Performer } from '@/lib/types';

export default function ProfilePage() {
  const [user, setUser] = useState<{ id: string; username: string; email: string; role: string; created_at: string } | null>(null);
  const [favorites, setFavorites] = useState<Performer[]>([]);
  const [balance, setBalance] = useState(0);
  const [bookings, setBookings] = useState<Array<{ id: string; performer_name: string; date: string; time: string; duration_minutes: number; status: string }>>([]);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d || d.error) { router.push('/login'); return; }
        setUser(d);
      });
    fetch('/api/favorites').then(r => r.json()).then(d => { if (Array.isArray(d)) setFavorites(d); });
    fetch('/api/tokens').then(r => r.json()).then(d => setBalance(d.balance ?? 0));
    fetch('/api/bookings').then(r => r.json()).then(d => { if (Array.isArray(d)) setBookings(d); });
  }, [router]);

  if (!user) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-gray-500">Loading...</div>
  );

  const memberSince = new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-dark-900">
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Profile Header */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-primary-600/20 border border-primary-600/30 flex items-center justify-center text-3xl font-bold text-primary-400 flex-shrink-0">
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">{user.username}</h1>
            <p className="text-gray-500 text-sm mt-1">{user.email}</p>
            <p className="text-gray-600 text-xs mt-1">Member since {memberSince}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="bg-dark-700 border border-dark-600 rounded-xl px-4 py-2 flex items-center gap-2">
              <span className="text-yellow-400 text-lg">🪙</span>
              <span className="text-white font-bold">{balance}</span>
              <span className="text-gray-500 text-sm">tokens</span>
            </div>
          </div>
        </div>

        {/* Favorites */}
        <div className="mb-10">
          <h2 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
            ♡ <span>Favorites</span>
            <span className="text-sm font-normal text-gray-500">({favorites.length})</span>
          </h2>
          {favorites.length === 0 ? (
            <div className="bg-dark-800 border border-dark-600 rounded-2xl p-10 text-center">
              <p className="text-gray-500 text-sm">No favorites yet.</p>
              <p className="text-gray-600 text-xs mt-1">Tap ♡ on a performer's profile to save them here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {favorites.map(p => (
                <PerformerCard key={p.id} performer={p} />
              ))}
            </div>
          )}
        </div>

        {/* Bookings */}
        <div>
          <h2 className="text-xl font-bold text-white mb-5">My Bookings</h2>
          {bookings.length === 0 ? (
            <div className="bg-dark-800 border border-dark-600 rounded-2xl p-10 text-center">
              <p className="text-gray-500 text-sm">No bookings yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookings.map(b => (
                <div key={b.id} className="bg-dark-800 border border-dark-600 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-white font-medium">{b.performer_name}</div>
                    <div className="text-gray-400 text-sm mt-0.5">{b.date} at {b.time} · {b.duration_minutes} min</div>
                  </div>
                  <span className={`px-3 py-1 rounded-lg text-xs font-semibold self-start sm:self-auto ${
                    b.status === 'confirmed' ? 'bg-green-500/20 text-green-400'
                    : b.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400'
                    : b.status === 'rejected' ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-500/20 text-gray-400'
                  }`}>{b.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Change Password */}
        <div className="mt-10">
          <h2 className="text-xl font-bold text-white mb-5">Change Password</h2>
          <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 space-y-3">
            <input type="password" placeholder="Current password" value={pwForm.current}
              onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
              className="w-full bg-dark-700 border border-dark-600 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-primary-500" />
            <input type="password" placeholder="New password" value={pwForm.next}
              onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
              className="w-full bg-dark-700 border border-dark-600 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-primary-500" />
            <input type="password" placeholder="Confirm new password" value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              className="w-full bg-dark-700 border border-dark-600 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-primary-500" />
            {pwMsg && (
              <p className={`text-sm ${pwMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{pwMsg.text}</p>
            )}
            <button
              disabled={savingPw}
              onClick={async () => {
                if (!pwForm.current || !pwForm.next || !pwForm.confirm) { setPwMsg({ ok: false, text: 'All fields required.' }); return; }
                if (pwForm.next !== pwForm.confirm) { setPwMsg({ ok: false, text: 'Passwords do not match.' }); return; }
                setSavingPw(true); setPwMsg(null);
                const res = await fetch('/api/auth/password', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
                });
                const data = await res.json();
                setSavingPw(false);
                if (res.ok) { setPwMsg({ ok: true, text: 'Password updated successfully.' }); setPwForm({ current: '', next: '', confirm: '' }); }
                else { setPwMsg({ ok: false, text: data.error || 'Failed to update password.' }); }
              }}
              className="w-full bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white py-3 rounded-xl font-bold transition-all text-sm">
              {savingPw ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
