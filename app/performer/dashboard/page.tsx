'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import type { Performer, Call, Booking, DaySchedule } from '@/lib/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DURATION_OPTIONS = [30, 60, 90, 120];
const ALL_SERVICES = [
  'Massage', 'Striptease', 'GFE', 'Dinner Date', 'Travel Companion',
  'Video Call', 'Photo Session', 'Roleplay', 'Fetish', 'Domination',
  'Submission', 'BDSM', 'Tantric', 'Couples', 'Bachelor Party',
];

const DEFAULT_SCHEDULE: DaySchedule = { enabled: false, start: '09:00', end: '20:00' };

function initAvailability(): Record<string, DaySchedule> {
  return Object.fromEntries(DAYS.map(d => [d, { ...DEFAULT_SCHEDULE }]));
}

export default function PerformerDashboard() {
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [performer, setPerformer] = useState<Performer | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{ callId: string; customerName: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ display_name: '', bio: '', rate_per_minute: 10, subscription_price: 0 });
  const [posts, setPosts] = useState<{ id: string; title: string; description: string; media: { id: string; url: string; media_type: string }[]; created_at: string }[]>([]);
  const [postForm, setPostForm] = useState({ title: '', description: '' });
  const [postMediaFiles, setPostMediaFiles] = useState<File[]>([]);
  const [postSaving, setPostSaving] = useState(false);
  const [postError, setPostError] = useState('');
  const [postSuccess, setPostSuccess] = useState(false);
  const postMediaRef = useRef<HTMLInputElement>(null);
  const [services, setServices] = useState<string[]>([]);
  const [durations, setDurations] = useState<string[]>(['30', '60', '90', '120']);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [picError, setPicError] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [availability, setAvailability] = useState<Record<string, DaySchedule>>(initAvailability());
  const [savingAvail, setSavingAvail] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [payoutRequests, setPayoutRequests] = useState<{ id: string; amount_tokens: number; amount_usd: number; status: string; created_at: string }[]>([]);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutBank, setPayoutBank] = useState({ accountName: '', accountNumber: '', iban: '', bankName: '', swift: '' });
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d || d.role !== 'performer') { router.push('/login'); return; }
        setUser(d);
      });
    fetch('/api/performers/me')
      .then(r => r.json())
      .then(p => {
        setPerformer(p);
        setIsOnline(!!p.is_online);
        setEditForm({ display_name: p.display_name, bio: p.bio, rate_per_minute: p.rate_per_minute, subscription_price: p.subscription_price ?? 0 });
        if (p.availability && typeof p.availability === 'object' && !Array.isArray(p.availability)) {
          // Merge saved availability over defaults
          setAvailability(prev => {
            const merged = { ...prev };
            for (const day of DAYS) {
              if (p.availability[day]) merged[day] = p.availability[day];
            }
            return merged;
          });
        }
        if (Array.isArray(p.services)) setServices(p.services);
        if (p.pricing && Object.keys(p.pricing).length > 0) {
          setDurations(Object.keys(p.pricing).sort((a, b) => Number(a) - Number(b)));
        }
        // Load posts for this performer
        fetch(`/api/performers/posts?performer_id=${p.id}`)
          .then(r => r.json())
          .then(d => { if (Array.isArray(d.posts)) setPosts(d.posts); });
      });
    fetch('/api/bookings').then(r => r.json()).then(d => { if (Array.isArray(d)) setBookings(d); });
    fetch('/api/tokens').then(r => r.json()).then(d => setTokenBalance(d.balance ?? 0));
    // Posts are loaded after performer profile so we can pass performer_id

    fetch('/api/performers/payout').then(r => r.json()).then(d => {
      if (Array.isArray(d.requests)) setPayoutRequests(d.requests);
    });
  }, [router]);

  useEffect(() => {
    if (!user || !performer) return;
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;
    socket.on('connect', () => {
      // Always re-register online status on (re)connect
      if (isOnline) {
        socket.emit('performer-online', { performerId: user.id });
        socket.emit('user-identify', { userId: user.id, username: user.username, role: 'performer', page: '/performer/dashboard' });
      }
    });
    socket.on('incoming-call', ({ callId, customerName }: { callId: string; customerName: string }) => {
      setIncomingCall({ callId, customerName });
    });
    return () => { socket.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, performer]);

  const toggleOnline = async () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    await fetch('/api/performers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_online: newStatus }),
    });
    if (socketRef.current && user) {
      if (newStatus) socketRef.current.emit('performer-online', { performerId: user.id });
      else socketRef.current.emit('performer-offline', { performerId: user.id });
    }
  };

  const uploadPicture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPicError('');
    setUploadingPic(true);
    try {
      const { uploadToFirebase } = await import('@/lib/firebase-upload');
      const url = await uploadToFirebase(file, `performers/${user?.id}/${Date.now()}-${file.name}`);
      const res = await fetch('/api/performers/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) setPicError(data.error || 'Upload failed');
      else setPerformer(p => p ? { ...p, photos: [...(p.photos || []), { id: data.id, url: data.url }] } : p);
    } catch {
      setPicError('Upload failed. Check your connection and try again.');
    }
    setUploadingPic(false);
    e.target.value = '';
  };

  const deletePhoto = async (photoId: string) => {
    const res = await fetch(`/api/performers/photos/${photoId}`, { method: 'DELETE' });
    if (res.ok) setPerformer(p => p ? { ...p, photos: (p.photos || []).filter(ph => ph.id !== photoId) } : p);
  };

  const setDay = (day: string, field: keyof DaySchedule, value: string | boolean) => {
    setAvailability(a => ({ ...a, [day]: { ...a[day], [field]: value } }));
  };

  const saveAvailability = async () => {
    setSavingAvail(true);
    await fetch('/api/performers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availability }),
    });
    setSavingAvail(false);
  };

  const isBookingJoinable = (b: Booking) => {
    if (b.status !== 'confirmed') return false;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    // Future dates — always joinable
    if (b.date > todayStr) return true;
    // Today — joinable until the session ends
    if (b.date === todayStr) {
      const [bh, bm] = b.time.split(':').map(Number);
      const endMins = bh * 60 + bm + (b.duration_minutes || 60);
      const nowMins = now.getHours() * 60 + now.getMinutes();
      return nowMins < endMins;
    }
    return false;
  };

  const updateBookingStatus = async (bookingId: string, status: 'confirmed' | 'rejected') => {
    await fetch(`/api/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, status } : b));
  };

  const toggleService = (s: string) => setServices(ss => ss.includes(s) ? ss.filter(x => x !== s) : [...ss, s]);

  const dragPhoto = useRef<number | null>(null);

  const onDragStart = (index: number) => { dragPhoto.current = index; };

  const onDrop = async (index: number) => {
    const from = dragPhoto.current;
    if (from === null || from === index) return;
    dragPhoto.current = null;
    const photos = [...(performer?.photos || [])];
    const [moved] = photos.splice(from, 1);
    photos.splice(index, 0, moved);
    setPerformer(p => p ? { ...p, photos } : p);
    await fetch('/api/performers/photos/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: photos.map(p => p.id) }),
    });
  };

  const saveProfile = async () => {
    setSaving(true);
    const pricingNum = Object.fromEntries(
      durations.filter(d => d && Number(d) > 0).map(d => [d, 0])
    );
    await fetch('/api/performers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, services, pricing: pricingNum, subscription_price: editForm.subscription_price }),
    });
    setSaving(false);
  };

  const createPost = async () => {
    if (!postForm.title.trim() || !postForm.description.trim()) {
      setPostError('Title and description are required.'); return;
    }
    setPostSaving(true); setPostError(''); setPostSuccess(false);
    const res = await fetch('/api/performers/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postForm),
    });
    const data = await res.json();
    if (!res.ok) { setPostSaving(false); setPostError(data.error || 'Failed to create post.'); return; }

    // Upload media files to Firebase Storage
    const uploadedMedia: { id: string; url: string; media_type: string }[] = [];
    if (postMediaFiles.length > 0) {
      const { uploadToFirebase } = await import('@/lib/firebase-upload');
      for (const file of postMediaFiles) {
        try {
          const isVideo = file.type.startsWith('video/');
          const url = await uploadToFirebase(file, `posts/${data.id}/${Date.now()}-${file.name}`);
          const mRes = await fetch('/api/performers/posts/media-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ post_id: data.id, url, media_type: isVideo ? 'video' : 'image' }),
          });
          if (mRes.ok) uploadedMedia.push(await mRes.json());
        } catch { /* skip failed uploads */ }
      }
    }

    setPostSaving(false);
    setPosts(prev => [{ ...data, media: uploadedMedia }, ...prev]);
    setPostForm({ title: '', description: '' });
    setPostMediaFiles([]);
    if (postMediaRef.current) postMediaRef.current.value = '';
    setPostSuccess(true);
    setTimeout(() => setPostSuccess(false), 3000);
  };

  const deletePost = async (postId: string) => {
    await fetch(`/api/performers/posts/${postId}`, { method: 'DELETE' });
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const acceptCall = () => {
    if (!incomingCall || !socketRef.current) return;
    socketRef.current.emit('call-accepted', { callId: incomingCall.callId });
    fetch(`/api/calls/${incomingCall.callId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
    router.push(`/call/${incomingCall.callId}`);
  };

  const rejectCall = () => {
    if (!incomingCall || !socketRef.current) return;
    socketRef.current.emit('call-rejected', { callId: incomingCall.callId });
    fetch(`/api/calls/${incomingCall.callId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    });
    setIncomingCall(null);
  };

  if (!user || !performer) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-gray-500">Loading...</div>
  );

  const photos = performer.photos || [];
  const canAddMore = photos.length < 10;

  return (
    <div className="min-h-screen bg-dark-900">

      {/* Incoming Call Alert */}
      {incomingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-dark-800 border border-primary-600 rounded-2xl p-8 text-center max-w-sm w-full mx-4 shadow-2xl animate-pulse">
            <div className="text-5xl mb-4">📞</div>
            <h2 className="text-2xl font-bold text-white mb-2">Incoming Call!</h2>
            <p className="text-gray-400 mb-6">{incomingCall.customerName} wants to call you</p>
            <div className="flex gap-3">
              <button onClick={rejectCall} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all">Decline</button>
              <button onClick={acceptCall} className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold transition-all">Accept</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Performer Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">Manage your profile and availability</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleOnline}
              className={`px-6 py-2 rounded-xl font-bold transition-all ${
                isOnline ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-dark-700 hover:bg-dark-600 text-gray-400'
              }`}
            >
              {isOnline ? '● Online' : '○ Go Online'}
            </button>
          </div>
        </div>

        {/* Profile Settings */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-white mb-5">Profile Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">Display Name</label>
              <input value={editForm.display_name}
                onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                className="w-full bg-dark-700 text-white px-4 py-3 rounded-xl border border-dark-500 focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Bio</label>
              <textarea value={editForm.bio}
                onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))}
                rows={3}
                className="w-full bg-dark-700 text-white px-4 py-3 rounded-xl border border-dark-500 focus:outline-none focus:border-primary-500 resize-none"
                placeholder="Tell customers about yourself..." />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Rate per minute (tokens)</label>
              <input type="number" min={5} max={100} value={editForm.rate_per_minute}
                onChange={e => setEditForm(f => ({ ...f, rate_per_minute: parseInt(e.target.value) }))}
                className="w-full bg-dark-700 text-white px-4 py-3 rounded-xl border border-dark-500 focus:outline-none focus:border-primary-500" />
              <p className="text-gray-600 text-xs mt-1">You earn 80% of charged tokens</p>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Monthly subscription price (USD $)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                <input type="number" min={0} value={editForm.subscription_price}
                  onChange={e => setEditForm(f => ({ ...f, subscription_price: parseInt(e.target.value) || 0 }))}
                  className="w-full bg-dark-700 text-white pl-8 pr-4 py-3 rounded-xl border border-dark-500 focus:outline-none focus:border-primary-500"
                  placeholder="0 = no subscription" />
              </div>
              <p className="text-gray-600 text-xs mt-1">Fans pay this monthly via bank transfer to unlock your exclusive posts. Set 0 to disable subscriptions.</p>
            </div>

            {/* Duration Options */}
            <div>
              <label className="block text-gray-400 text-sm mb-2">Duration options (minutes)</label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {durations.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 bg-dark-700 rounded-xl px-3 py-2.5 border border-dark-500">
                    <input type="number" min={1} value={d}
                      onChange={e => setDurations(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                      className="flex-1 bg-transparent text-white text-sm focus:outline-none w-0" />
                    <span className="text-gray-500 text-sm flex-shrink-0">min</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setDurations(prev => [...prev, ''])}
                className="text-primary-400 hover:text-primary-300 text-sm transition-colors">+ Add option</button>
            </div>

            {/* Services */}
            <div>
              <label className="block text-gray-400 text-sm mb-2">Services</label>
              <div className="flex flex-wrap gap-2">
                {ALL_SERVICES.map(s => (
                  <button key={s} type="button" onClick={() => toggleService(s)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      services.includes(s) ? 'bg-primary-600 text-white' : 'bg-dark-700 hover:bg-dark-600 text-gray-400 border border-dark-500'
                    }`}>{s}</button>
                ))}
              </div>
            </div>

            <button onClick={saveProfile} disabled={saving}
              className="w-full bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white py-3 rounded-xl font-bold transition-all">
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        {/* Availability — per day */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-white mb-1">Availability</h2>
          <p className="text-gray-500 text-xs mb-5">Set each day independently</p>
          <div className="space-y-3">
            {DAYS.map(day => {
              const sched = availability[day] || DEFAULT_SCHEDULE;
              return (
                <div key={day} className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border transition-all ${
                  sched.enabled ? 'bg-dark-700 border-primary-600/40' : 'bg-dark-700/40 border-dark-600'
                }`}>
                  <button
                    onClick={() => setDay(day, 'enabled', !sched.enabled)}
                    className={`w-10 h-6 rounded-full transition-all flex-shrink-0 relative ${sched.enabled ? 'bg-primary-600' : 'bg-dark-500'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${sched.enabled ? 'left-5' : 'left-1'}`} />
                  </button>
                  <span className={`w-24 text-sm font-medium flex-shrink-0 ${sched.enabled ? 'text-white' : 'text-gray-600'}`}>{day}</span>
                  {sched.enabled ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input type="time" value={sched.start}
                        onChange={e => setDay(day, 'start', e.target.value)}
                        className="bg-dark-600 text-white px-3 py-1.5 rounded-lg border border-dark-500 text-sm focus:outline-none focus:border-primary-500" />
                      <span className="text-gray-500 text-sm">to</span>
                      <input type="time" value={sched.end}
                        onChange={e => setDay(day, 'end', e.target.value)}
                        className="bg-dark-600 text-white px-3 py-1.5 rounded-lg border border-dark-500 text-sm focus:outline-none focus:border-primary-500" />
                    </div>
                  ) : (
                    <span className="text-gray-600 text-sm">Not available</span>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={saveAvailability} disabled={savingAvail}
            className="mt-4 bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all">
            {savingAvail ? 'Saving...' : 'Save Availability'}
          </button>
        </div>

        {/* Change Password */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">Change Password</h2>
          <div className="space-y-3">
            <input type="password" placeholder="Current password" value={pwForm.current}
              onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
              className="w-full bg-dark-700 border border-dark-500 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-primary-500" />
            <input type="password" placeholder="New password" value={pwForm.next}
              onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
              className="w-full bg-dark-700 border border-dark-500 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-primary-500" />
            <input type="password" placeholder="Confirm new password" value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              className="w-full bg-dark-700 border border-dark-500 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-primary-500" />
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

        {/* Booking Requests */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">Booking Requests</h2>
          {bookings.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-4">No bookings yet.</p>
          ) : (
            <div className="space-y-3">
              {bookings.map(b => (
                <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-dark-700 rounded-xl p-4">
                  <div>
                    <div className="text-white font-medium">{b.customer_name}</div>
                    <div className="text-gray-400 text-sm mt-0.5">{b.date} at {b.time} · {b.duration_minutes}min</div>
                    {b.note && <div className="text-gray-500 text-xs mt-1 italic">"{b.note}"</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {b.status === 'pending' ? (
                      <>
                        <button onClick={() => updateBookingStatus(b.id, 'rejected')}
                          className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm font-medium transition-all">Decline</button>
                        <button onClick={() => updateBookingStatus(b.id, 'confirmed')}
                          className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg text-sm font-medium transition-all">Confirm</button>
                      </>
                    ) : (
                      <>
                        <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                          b.status === 'confirmed' ? 'bg-green-500/20 text-green-400'
                          : b.status === 'rejected' ? 'bg-red-500/20 text-red-400'
                          : 'bg-gray-500/20 text-gray-400'
                        }`}>{b.status}</span>
                        {isBookingJoinable(b) && (
                          <button
                            onClick={() => router.push(`/room/${b.id}`)}
                            className="px-4 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-bold transition-all"
                          >
                            Join
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Earnings & Payout */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Earnings & Payout</h2>
              <p className="text-gray-500 text-xs mt-0.5">You earn 80% of tokens charged on calls</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-yellow-400">{tokenBalance} tokens</div>
              <div className="text-gray-500 text-xs">≈ ${(tokenBalance * 0.08).toFixed(2)} USD</div>
            </div>
          </div>

          {!showPayoutForm ? (
            <button
              onClick={() => setShowPayoutForm(true)}
              disabled={tokenBalance < 100}
              className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all text-sm"
            >
              {tokenBalance < 100 ? 'Minimum 100 tokens to request payout' : 'Request Payout'}
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-gray-400 text-xs mb-1">Amount (tokens)</label>
                <input
                  type="number" min={100} max={tokenBalance}
                  value={payoutAmount}
                  onChange={e => setPayoutAmount(e.target.value)}
                  placeholder={`Max ${tokenBalance}`}
                  className="w-full bg-dark-700 border border-dark-500 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary-500"
                />
                {payoutAmount && Number(payoutAmount) > 0 && (
                  <p className="text-gray-500 text-xs mt-1">≈ ${(Number(payoutAmount) * 0.08).toFixed(2)} USD after 20% platform fee</p>
                )}
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Account Name</label>
                <input value={payoutBank.accountName} onChange={e => setPayoutBank(b => ({ ...b, accountName: e.target.value }))}
                  className="w-full bg-dark-700 border border-dark-500 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary-500" placeholder="Full name on account" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Bank Name</label>
                <input value={payoutBank.bankName} onChange={e => setPayoutBank(b => ({ ...b, bankName: e.target.value }))}
                  className="w-full bg-dark-700 border border-dark-500 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary-500" placeholder="e.g. Chase, HSBC..." />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Account Number</label>
                <input value={payoutBank.accountNumber} onChange={e => setPayoutBank(b => ({ ...b, accountNumber: e.target.value }))}
                  className="w-full bg-dark-700 border border-dark-500 text-white px-4 py-2.5 rounded-xl text-sm font-mono focus:outline-none focus:border-primary-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">IBAN (optional)</label>
                  <input value={payoutBank.iban} onChange={e => setPayoutBank(b => ({ ...b, iban: e.target.value }))}
                    className="w-full bg-dark-700 border border-dark-500 text-white px-4 py-2.5 rounded-xl text-sm font-mono focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">SWIFT (optional)</label>
                  <input value={payoutBank.swift} onChange={e => setPayoutBank(b => ({ ...b, swift: e.target.value }))}
                    className="w-full bg-dark-700 border border-dark-500 text-white px-4 py-2.5 rounded-xl text-sm font-mono focus:outline-none focus:border-primary-500" />
                </div>
              </div>
              {payoutMsg && (
                <p className={`text-sm ${payoutMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{payoutMsg.text}</p>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setShowPayoutForm(false); setPayoutMsg(null); }}
                  className="flex-1 py-2.5 bg-dark-700 hover:bg-dark-600 text-gray-400 rounded-xl text-sm transition-all">
                  Cancel
                </button>
                <button
                  disabled={payoutLoading}
                  onClick={async () => {
                    const amt = Number(payoutAmount);
                    if (!amt || amt < 100) { setPayoutMsg({ ok: false, text: 'Minimum 100 tokens.' }); return; }
                    if (amt > tokenBalance) { setPayoutMsg({ ok: false, text: 'Exceeds your balance.' }); return; }
                    if (!payoutBank.accountName || !payoutBank.accountNumber) {
                      setPayoutMsg({ ok: false, text: 'Account name and number required.' }); return;
                    }
                    setPayoutLoading(true); setPayoutMsg(null);
                    const res = await fetch('/api/performers/payout', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ amountTokens: amt, bankDetails: payoutBank }),
                    });
                    const data = await res.json();
                    setPayoutLoading(false);
                    if (res.ok) {
                      setPayoutMsg({ ok: true, text: `Payout request submitted! ≈ $${data.amountUsd?.toFixed(2)}` });
                      setShowPayoutForm(false);
                      fetch('/api/performers/payout').then(r => r.json()).then(d => {
                        if (Array.isArray(d.requests)) setPayoutRequests(d.requests);
                      });
                    } else {
                      setPayoutMsg({ ok: false, text: data.error || 'Failed to submit request.' });
                    }
                  }}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-all"
                >
                  {payoutLoading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          )}

          {/* Payout history */}
          {payoutRequests.length > 0 && (
            <div className="mt-5 border-t border-dark-600 pt-4">
              <h3 className="text-white text-sm font-semibold mb-3">Payout History</h3>
              <div className="space-y-2">
                {payoutRequests.map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-4 py-3 text-sm">
                    <div>
                      <span className="text-white font-medium">{r.amount_tokens} tokens</span>
                      <span className="text-gray-500 ml-2">≈ ${r.amount_usd.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-600 text-xs">{new Date(r.created_at).toLocaleDateString()}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                        r.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>{r.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Subscription Posts */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-white mb-1">Subscription Posts</h2>
          <p className="text-gray-500 text-xs mb-5">Only fans with an active subscription can read the full content</p>

          {editForm.subscription_price === 0 && (
            <div className="mb-4 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-4 py-3 rounded-xl text-sm">
              Set a subscription price in Profile Settings above to allow fans to subscribe.
            </div>
          )}

          {/* Create post form */}
          <div className="bg-dark-700 rounded-xl p-4 mb-5 space-y-3">
            <h3 className="text-white font-semibold text-sm">New Post</h3>
            <input
              value={postForm.title}
              onChange={e => setPostForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Post title (visible to everyone)"
              className="w-full bg-dark-600 text-white px-4 py-2.5 rounded-xl border border-dark-500 focus:outline-none focus:border-primary-500 text-sm"
            />
            <textarea
              value={postForm.description}
              onChange={e => setPostForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description (only visible to subscribers)"
              rows={3}
              className="w-full bg-dark-600 text-white px-4 py-2.5 rounded-xl border border-dark-500 focus:outline-none focus:border-primary-500 text-sm resize-none"
            />

            {/* Media upload */}
            <div>
              <label className="block text-gray-400 text-xs mb-2">Photos & Videos (subscribers only)</label>
              <input
                ref={postMediaRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                multiple
                onChange={e => setPostMediaFiles(Array.from(e.target.files || []))}
                className="hidden"
                id="post-media-input"
              />
              <label htmlFor="post-media-input"
                className="inline-flex items-center gap-2 px-4 py-2 bg-dark-600 hover:bg-dark-500 border border-dark-500 text-gray-300 rounded-xl text-sm cursor-pointer transition-all">
                📎 {postMediaFiles.length > 0 ? `${postMediaFiles.length} file(s) selected` : 'Attach photos / videos'}
              </label>
              {postMediaFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {postMediaFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-dark-600 px-2 py-1 rounded-lg text-xs text-gray-300">
                      <span>{f.type.startsWith('video/') ? '🎬' : '🖼️'}</span>
                      <span className="max-w-[120px] truncate">{f.name}</span>
                      <button onClick={() => setPostMediaFiles(prev => prev.filter((_, j) => j !== i))}
                        className="text-gray-500 hover:text-red-400 ml-1">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {postError && <p className="text-red-400 text-sm">{postError}</p>}
            {postSuccess && <p className="text-green-400 text-sm">Post published!</p>}
            <button
              onClick={createPost}
              disabled={postSaving}
              className="bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all"
            >
              {postSaving ? 'Publishing...' : 'Publish Post'}
            </button>
          </div>

          {/* Posts list */}
          {posts.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-4">No posts yet. Create your first exclusive post above.</p>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="bg-dark-700 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{post.title}</p>
                      <p className="text-gray-400 text-xs mt-1 line-clamp-2">{post.description}</p>
                      <p className="text-gray-600 text-xs mt-1">{new Date(post.created_at).toLocaleDateString()}</p>
                      {post.media?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {post.media.map(m => (
                            m.media_type === 'video' ? (
                              <video key={m.id} src={m.url} className="w-20 h-16 object-cover rounded-lg bg-black" muted />
                            ) : (
                              <img key={m.id} src={m.url} className="w-20 h-16 object-cover rounded-lg" />
                            )
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deletePost(post.id)}
                      className="text-red-400 hover:text-red-300 text-xs flex-shrink-0 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Photo Gallery */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Photos</h2>
              <p className="text-gray-500 text-xs mt-0.5">{photos.length}/10 · First photo appears on your card</p>
            </div>
            {canAddMore && (
              <label className={`cursor-pointer px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                uploadingPic ? 'bg-primary-800 text-primary-400 opacity-60 pointer-events-none' : 'bg-primary-600 hover:bg-primary-500 text-white'
              }`}>
                {uploadingPic ? 'Uploading...' : '+ Add Photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={uploadingPic} onChange={uploadPicture} />
              </label>
            )}
          </div>
          {picError && <p className="text-red-400 text-sm mb-3">{picError}</p>}
          {photos.length === 0 ? (
            <div className="border-2 border-dashed border-dark-500 rounded-xl py-12 text-center">
              <p className="text-gray-500 text-sm mb-3">No photos yet</p>
              <label className="cursor-pointer px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-all">
                Upload your first photo
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={uploadingPic} onChange={uploadPicture} />
              </label>
              <p className="text-gray-600 text-xs mt-3">JPEG, PNG, WebP or GIF · Max 5MB each</p>
            </div>
          ) : (
            <>
              <p className="text-gray-600 text-xs mb-3">Drag photos to reorder · First photo is shown on your card</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className="relative group aspect-square cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={() => onDragStart(index)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onDrop(index)}
                  >
                    <img src={photo.url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover rounded-xl pointer-events-none" />
                    {index === 0 && (
                      <span className="absolute top-1.5 left-1.5 bg-primary-600 text-white text-xs px-1.5 py-0.5 rounded-md font-semibold">Main</span>
                    )}
                    <button onClick={() => deletePhoto(photo.id)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 hover:bg-red-600 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
