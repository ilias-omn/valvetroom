'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Performer, DaySchedule } from '@/lib/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DURATIONS = [30, 60, 90, 120];

function getDayName(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
}

function generateTimeSlots(start: string, end: string): string[] {
  const slots: string[] = [];
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let h = sh, m = sm;
  while (h < eh || (h === eh && m < em)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += 30;
    if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}

function memberSince(dateStr?: string) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  const now = new Date();
  const months = (now.getFullYear() - then.getFullYear()) * 12 + now.getMonth() - then.getMonth();
  if (months < 1) return 'New member';
  if (months < 12) return `Member for ${months} month${months > 1 ? 's' : ''}`;
  const years = Math.floor(months / 12);
  return `Member for ${years} year${years > 1 ? 's' : ''}`;
}

export default function PerformerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [performer, setPerformer] = useState<Performer | null>(null);
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [bookForm, setBookForm] = useState({ date: '', time: '', duration: 60, note: '' });
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState('');
  const [bookSuccess, setBookSuccess] = useState(false);
  const [dateLocked, setDateLocked] = useState(false);
  const [takenSlots, setTakenSlots] = useState<string[]>([]);
  const [favorited, setFavorited] = useState(false);
  const [callError] = useState('');
  const [myBookings, setMyBookings] = useState<{ id: string; date: string; time: string; duration_minutes: number; status: string }[]>([]);
  const [selectedAvailDay, setSelectedAvailDay] = useState<string | null>(null);
  const [availDaySlots, setAvailDaySlots] = useState<string[]>([]);
  const [availDayTaken, setAvailDayTaken] = useState<string[]>([]);
  const [availDayDate, setAvailDayDate] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subError, setSubError] = useState('');
  const [posts, setPosts] = useState<{ id: string; title: string; description: string | null; media: { id: string; url: string; media_type: string }[]; locked: boolean; created_at: string }[]>([]);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [subBankDetails, setSubBankDetails] = useState<{ bankName: string; accountName: string; accountNumber: string; iban: string; swift: string; instructions: string } | null>(null);
  const [subPrice, setSubPrice] = useState(0);
  const [subReference, setSubReference] = useState('');
  const [subStep, setSubStep] = useState<'details' | 'confirm'>('details');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => { if (d && !d.error) setUser(d); });
    fetch(`/api/performers/${id}`).then(r => r.json()).then(p => {
      setPerformer(p);
      fetch(`/api/bookings?performer_id=${p.id}`)
        .then(r => r.ok ? r.json() : [])
        .then(d => { if (Array.isArray(d)) setMyBookings(d); });
      // Load posts
      fetch(`/api/performers/posts?performer_id=${p.id}`)
        .then(r => r.json())
        .then(d => { if (Array.isArray(d.posts)) { setPosts(d.posts); setIsSubscribed(d.isSubscribed); } setPostsLoaded(true); });
      // Check subscription + get bank details
      fetch(`/api/subscriptions?performer_id=${p.id}`)
        .then(r => r.json())
        .then(d => {
          setIsSubscribed(d.subscribed);
          setSubPrice(d.price || 0);
          if (d.bankDetails) setSubBankDetails(d.bankDetails);
        });
    });
    fetch('/api/favorites').then(r => r.ok ? r.json() : []).then((favs: Array<{ id: string }>) => {
      if (Array.isArray(favs)) setFavorited(favs.some(f => f.id === id));
    });
  }, [id]);

  useEffect(() => {
    if (!bookForm.date || !performer) return;
    fetch(`/api/bookings/slots?performer_id=${performer.id}&date=${bookForm.date}`)
      .then(r => r.ok ? r.json() : []).then(setTakenSlots);
  }, [bookForm.date, performer]);

  if (!performer) return (
    <div className="min-h-screen bg-[#140c0a] flex items-center justify-center text-cream-300">Loading...</div>
  );

  const photos = performer.photos || [];
  const currentPhoto = photos[photoIdx];
  const initials = performer.display_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const availability = (performer.availability || {}) as Record<string, DaySchedule>;
  const enabledDays = DAYS.filter(d => availability[d]?.enabled);
  const pricing = performer.pricing || {};
  const services = performer.services || [];
  const today = new Date().toISOString().split('T')[0];

  // Check if the customer has an active booking right now
  const getActiveBooking = () => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return myBookings.find(b => {
      if (b.status !== 'confirmed') return false;
      if (b.date !== todayStr) return false;
      const [bh, bm] = b.time.split(':').map(Number);
      const startMins = bh * 60 + bm;
      const endMins = startMins + (b.duration_minutes || 60);
      return nowMins >= startMins && nowMins < endMins;
    }) || null;
  };

  // Find the next upcoming booking
  const getNextBooking = () => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return myBookings
      .filter(b => {
        if (b.status !== 'confirmed') return false;
        if (b.date < todayStr) return false;
        if (b.date === todayStr) {
          const [bh, bm] = b.time.split(':').map(Number);
          return bh * 60 + bm > nowMins;
        }
        return true;
      })
      .sort((a, b) => a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date))[0] || null;
  };

  const activeBooking = user?.role === 'customer' ? getActiveBooking() : null;
  const nextBooking = user?.role === 'customer' ? getNextBooking() : null;
  // Performer viewing own profile can always join
  const isOwnProfile = user?.id === performer.user_id;

  const getDaySchedule = (dateStr: string): DaySchedule | null => {
    if (!dateStr) return null;
    const day = getDayName(dateStr);
    const sched = availability[day];
    if (!sched?.enabled) return null;
    return sched;
  };

  const isDateAvailable = (dateStr: string) => {
    if (!dateStr) return false;
    if (enabledDays.length === 0) return true; // no restrictions set
    return !!getDaySchedule(dateStr);
  };

  const timeSlots = bookForm.date
    ? (() => {
        if (enabledDays.length === 0) return [];
        const sched = getDaySchedule(bookForm.date);
        if (!sched) return [];
        return generateTimeSlots(sched.start, sched.end);
      })()
    : [];

  function getNextDateForDay(dayName: string): string {
    const dayIndex = DAYS.indexOf(dayName);
    const now = new Date();
    const todayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
    let daysUntil = dayIndex - todayIndex;
    if (daysUntil <= 0) daysUntil += 7;
    const next = new Date(now);
    next.setDate(now.getDate() + daysUntil);
    return next.toISOString().split('T')[0];
  }

  const handleDayClick = async (day: string) => {
    if (selectedAvailDay === day) { setSelectedAvailDay(null); return; }
    const sched = availability[day];
    if (!sched) return;
    const slots = generateTimeSlots(sched.start, sched.end);
    const date = getNextDateForDay(day);
    setSelectedAvailDay(day);
    setAvailDayDate(date);
    setAvailDaySlots(slots);
    setAvailDayTaken([]);
    const res = await fetch(`/api/bookings/slots?performer_id=${performer.id}&date=${date}`);
    if (res.ok) setAvailDayTaken(await res.json());
  };

  const prevPhoto = () => setPhotoIdx(i => (i - 1 + photos.length) % photos.length);
  const nextPhoto = () => setPhotoIdx(i => (i + 1) % photos.length);

  const handleJoin = (roomId: string) => {
    if (!user) { router.push('/login'); return; }
    router.push(`/room/${roomId}`);
  };

  const submitBooking = async () => {
    if (!bookForm.date || !bookForm.time) { setBookError('Please select a date and time.'); return; }
    if (!isDateAvailable(bookForm.date)) { setBookError('Not available on that day.'); return; }
    if (!user) { router.push('/login'); return; }
    setBooking(true); setBookError('');
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ performer_id: performer.id, date: bookForm.date, time: bookForm.time, duration_minutes: bookForm.duration, note: bookForm.note }),
    });
    const data = await res.json();
    setBooking(false);
    if (!res.ok) { setBookError(data.error || 'Booking failed'); return; }
    setBookSuccess(true); setShowBook(false);
    setBookForm({ date: '', time: '', duration: 60, note: '' });
  };

  return (
    <div className="min-h-screen bg-[#140c0a] text-white">
      {/* Photo Slider Hero */}
      <div className="relative w-full bg-black" style={{ minHeight: 280, maxHeight: 600 }}>
        {currentPhoto ? (
          <img
            src={currentPhoto.url}
            alt=""
            className="w-full object-contain mx-auto block"
            style={{ maxHeight: 600 }}
          />
        ) : (
          <div className="w-full flex items-center justify-center text-5xl font-bold"
            style={{ height: 400, backgroundColor: performer.avatar_color }}>{initials}</div>
        )}


        {/* Back button */}
        <button onClick={() => router.back()}
          className="absolute top-4 left-4 flex items-center gap-1.5 text-white text-sm font-semibold bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
          ‹ Back
        </button>

        {/* Fullscreen button */}
        {currentPhoto && (
          <button onClick={() => setLightbox(true)}
            className="absolute bottom-4 right-4 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-xl flex items-center justify-center text-white hover:bg-black/70 transition-all">
            ⛶
          </button>
        )}

        {/* Arrows */}
        {photos.length > 1 && (
          <>
            <button onClick={prevPhoto}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-all text-xl">
              ‹
            </button>
            <button onClick={nextPhoto}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-all text-xl">
              ›
            </button>
            {/* Dots */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {photos.map((_, i) => (
                <button key={i} onClick={() => setPhotoIdx(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === photoIdx ? 'bg-white w-4' : 'bg-white/40'}`} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 pb-16 mt-4 border-t border-[#36221d] pt-4">

        {bookSuccess && (
          <div className="mb-4 bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-xl text-sm">
            Booking request sent! The performer will confirm your appointment.
          </div>
        )}

        {/* Name + Location */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h1 className="text-2xl font-bold">{performer.display_name}</h1>
            {performer.location && (
              <div className="flex items-center gap-1 text-cream-200 text-sm mt-0.5">
                <span>📍</span>
                <span>{performer.location}</span>
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-yellow-400 font-bold text-lg">{performer.rate_per_minute}</div>
            <div className="text-cream-300 text-xs">tokens/min</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mb-2">
          <button
            onClick={async () => {
              if (!user) { router.push('/login'); return; }
              const res = await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ performer_id: performer.id }),
              });
              if (res.ok) {
                const data = await res.json();
                setFavorited(data.favorited);
              }
            }}
            className={`flex-1 py-3 border rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              favorited
                ? 'border-red-500/50 bg-red-500/10 text-red-400'
                : 'border-[#4a2e28] text-cream-100 hover:bg-white/5'
            }`}
          >
            {favorited ? '♥ Saved' : '♡ Save'}
          </button>
          {isOwnProfile ? null : activeBooking ? (
            <button
              onClick={() => handleJoin(activeBooking.id)}
              disabled={!performer.is_online}
              className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
            >
              Join Session
            </button>
          ) : nextBooking ? (
            <button
              disabled
              className="flex-1 py-3 bg-dark-700 text-cream-200 rounded-xl font-bold text-sm cursor-not-allowed flex flex-col items-center justify-center gap-0.5"
            >
              <span className="text-xs">Session on {new Date(nextBooking.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {nextBooking.time}</span>
            </button>
          ) : (
            <button
              disabled
              className="flex-1 py-3 bg-dark-700 text-cream-300 rounded-xl font-bold text-sm cursor-not-allowed flex items-center justify-center gap-2"
            >
              Book to Join
            </button>
          )}
          <button
            onClick={() => {
              if (!user) { router.push('/login'); return; }
              if (user.role !== 'customer') return;
              setDateLocked(true);
              setBookForm(f => ({ ...f, date: today, time: '' }));
              setShowBook(true);
            }}
            disabled={user?.role === 'performer'}
            className="flex-1 py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            Book
          </button>
        </div>
        {callError && (
          <p className="text-red-400 text-xs mb-3 bg-red-400/10 px-3 py-2 rounded-lg">{callError}</p>
        )}

        {/* Status badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${performer.is_online ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'bg-[#36221d]/50 text-cream-300 border border-[#36221d]'}`}>
            <span className={`w-2 h-2 rounded-full ${performer.is_online ? 'bg-green-400' : 'bg-gray-600'}`} />
            {performer.is_online ? 'Available' : 'Unavailable'}
          </span>
          {memberSince((performer as any).member_since) && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-900/30 text-green-400 border border-green-800/40">
              ✦ {memberSince((performer as any).member_since)}
            </span>
          )}
        </div>

        {/* Tagline */}
        {performer.tagline && (
          <p className="text-white font-semibold text-base mb-4">{performer.tagline}</p>
        )}

        {/* Presentation */}
        {performer.bio && (
          <div className="mb-5">
            <h2 className="text-base font-bold mb-2 flex items-center gap-2">
              <span>💐</span>
              <em>Presentation</em>
            </h2>
            <p className="text-cream-100 text-sm leading-relaxed whitespace-pre-line">{performer.bio}</p>
          </div>
        )}

        {/* Duration options */}
        {Object.keys(pricing).length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {Object.keys(pricing).sort((a, b) => Number(a) - Number(b)).map(d => (
              <span key={d} className="px-4 py-1.5 bg-[#2a1915] border border-[#36221d] text-cream-100 rounded-full text-sm">
                {d} min
              </span>
            ))}
          </div>
        )}

        {/* Availability */}
        {enabledDays.length > 0 && (
          <div className="mb-5">
            <h2 className="text-base font-bold mb-3 flex items-center gap-2">
              <span>ℹ️</span>
              <em>Availability</em>
            </h2>
            <div className="space-y-2">
              {DAYS.map(day => {
                const sched = availability[day];
                if (!sched?.enabled) return null;
                const isExpanded = selectedAvailDay === day;
                return (
                  <div key={day}>
                    <button
                      onClick={() => handleDayClick(day)}
                      className={`w-full flex items-center justify-between text-sm px-4 py-2.5 rounded-xl transition-all ${
                        isExpanded
                          ? 'bg-primary-500/15 border border-primary-500/40'
                          : 'bg-[#1e1210] border border-[#2a1915] hover:border-[#4a2e28]'
                      }`}
                    >
                      <span className="text-white font-medium">{day}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-cream-200">{sched.start} – {sched.end}</span>
                        <span className="text-cream-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="mt-2 px-1 pb-1">
                        {availDaySlots.length === 0 ? (
                          <p className="text-cream-300 text-xs text-center py-3">No slots available</p>
                        ) : (
                          <div className="grid grid-cols-4 gap-2">
                            {availDaySlots.map(slot => {
                              const taken = availDayTaken.includes(slot);
                              return (
                                <button
                                  key={slot}
                                  disabled={taken}
                                  onClick={() => {
                                    if (!user) { router.push('/login'); return; }
                                    if (user.role !== 'customer') return;
                                    setBookForm(f => ({ ...f, date: availDayDate, time: slot }));
                                    setDateLocked(true);
                                    setShowBook(true);
                                  }}
                                  className={`py-2 rounded-lg text-sm font-medium transition-all ${
                                    taken
                                      ? 'bg-[#2a1915] text-cream-400 cursor-not-allowed line-through'
                                      : 'bg-[#2a1915] hover:bg-primary-500 hover:text-white text-cream-100'
                                  }`}
                                >
                                  {slot}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Services */}
        {services.length > 0 && (
          <div className="mb-5">
            <h2 className="text-base font-bold mb-3">Services</h2>
            <div className="flex flex-wrap gap-2">
              {services.map(s => (
                <span key={s} className="px-4 py-1.5 bg-[#2a1915] text-cream-100 rounded-full text-sm border border-[#36221d]">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Subscription & Posts */}
        {(performer as any).subscription_price > 0 && !isOwnProfile && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold">Exclusive Posts</h2>
                <p className="text-cream-300 text-xs mt-0.5">Subscribe to unlock all content</p>
              </div>
              {!isSubscribed ? (
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() => {
                      if (!user) { router.push('/login'); return; }
                      const ref = `SUB-${performer.id.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
                      setSubReference(ref);
                      setSubStep('details');
                      setSubError('');
                      setShowSubModal(true);
                    }}
                    className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-sm font-bold transition-all"
                  >
                    Subscribe — ${(performer as any).subscription_price}/mo
                  </button>
                  {subError && <p className="text-red-400 text-xs">{subError}</p>}
                </div>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/15 border border-primary-500/30 text-primary-400 rounded-xl text-sm font-medium">
                  ✓ Subscribed
                </span>
              )}
            </div>

            {postsLoaded && posts.length === 0 && (
              <p className="text-cream-400 text-sm text-center py-6">No posts yet.</p>
            )}

            <div className="space-y-4">
              {posts.map(post => (
                <div key={post.id} className={`rounded-xl border p-4 ${post.locked ? 'border-[#2a1915] bg-[#1e1210]' : 'border-primary-500/20 bg-primary-500/5'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-white font-medium text-sm">{post.title}</p>
                    <span className="text-cream-400 text-xs flex-shrink-0">{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                  {post.locked ? (
                    <div className="flex items-center gap-2 text-cream-400 text-sm">
                      <span>🔒</span>
                      <span>Subscribe to read this post</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-cream-100 text-sm leading-relaxed whitespace-pre-line">{post.description}</p>
                      {post.media?.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {post.media.map(m => (
                            m.media_type === 'video' ? (
                              <video key={m.id} src={m.url} controls
                                className="w-full rounded-xl bg-black object-cover"
                                style={{ maxHeight: 320 }} />
                            ) : (
                              <img key={m.id} src={m.url} alt=""
                                className="w-full rounded-xl object-cover cursor-pointer"
                                style={{ maxHeight: 320 }}
                                onClick={() => window.open(m.url, '_blank')} />
                            )
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Own profile: show posts */}
        {isOwnProfile && posts.length > 0 && (
          <div className="mb-5">
            <h2 className="text-base font-bold mb-3">Your Exclusive Posts</h2>
            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-4">
                  <p className="text-white font-medium text-sm">{post.title}</p>
                  <p className="text-cream-200 text-xs mt-1 line-clamp-2">{post.description}</p>
                  {post.media?.length > 0 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                      {post.media.map(m => (
                        m.media_type === 'video'
                          ? <video key={m.id} src={m.url} className="w-20 h-16 object-cover rounded-lg bg-black flex-shrink-0" muted />
                          : <img key={m.id} src={m.url} className="w-20 h-16 object-cover rounded-lg flex-shrink-0" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Subscription Modal */}
      {showSubModal && subBankDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center">
          <div className="bg-[#1e1210] border border-[#36221d] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">Subscribe to {performer.display_name}</h2>
              <button onClick={() => setShowSubModal(false)} className="text-cream-300 hover:text-white text-2xl leading-none">×</button>
            </div>

            {subStep === 'details' ? (
              <div className="space-y-4">
                <div className="bg-purple-500/10 border border-primary-500/30 rounded-xl p-4">
                  <div className="text-primary-300 font-bold text-xl mb-1">${subPrice}<span className="text-sm font-normal text-primary-400">/month</span></div>
                  <p className="text-cream-200 text-xs">Unlocks all exclusive posts for 30 days</p>
                </div>

                <div>
                  <p className="text-cream-200 text-xs mb-2 font-medium uppercase tracking-wide">Your reference code</p>
                  <div className="flex items-center gap-2 bg-[#140c0a] border border-[#36221d] rounded-xl px-4 py-3">
                    <span className="text-yellow-400 font-mono font-bold flex-1">{subReference}</span>
                    <button onClick={() => navigator.clipboard.writeText(subReference)}
                      className="text-cream-300 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/5 transition-all">Copy</button>
                  </div>
                  <p className="text-cream-400 text-xs mt-1">Use this as your payment reference/description</p>
                </div>

                <div className="bg-[#140c0a] border border-[#2a1915] rounded-xl p-4 space-y-2">
                  <p className="text-white text-sm font-semibold mb-3">Bank Transfer Details</p>
                  {subBankDetails.bankName && <div className="flex justify-between text-sm"><span className="text-cream-300">Bank</span><span className="text-white">{subBankDetails.bankName}</span></div>}
                  {subBankDetails.accountName && <div className="flex justify-between text-sm"><span className="text-cream-300">Account Name</span><span className="text-white">{subBankDetails.accountName}</span></div>}
                  {subBankDetails.accountNumber && <div className="flex justify-between text-sm"><span className="text-cream-300">Account No.</span><span className="text-white font-mono">{subBankDetails.accountNumber}</span></div>}
                  {subBankDetails.iban && <div className="flex justify-between text-sm"><span className="text-cream-300">IBAN</span><span className="text-white font-mono text-xs">{subBankDetails.iban}</span></div>}
                  {subBankDetails.swift && <div className="flex justify-between text-sm"><span className="text-cream-300">SWIFT</span><span className="text-white font-mono">{subBankDetails.swift}</span></div>}
                </div>

                {subBankDetails.instructions && (
                  <p className="text-cream-300 text-xs leading-relaxed">{subBankDetails.instructions}</p>
                )}

                <button
                  onClick={() => setSubStep('confirm')}
                  className="w-full py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-bold transition-all"
                >
                  I've Made the Transfer
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-cream-100 text-sm">Enter your reference code to confirm and activate your subscription.</p>
                <div>
                  <label className="block text-cream-200 text-xs mb-1">Reference code</label>
                  <input
                    value={subReference}
                    onChange={e => setSubReference(e.target.value)}
                    className="w-full bg-[#140c0a] text-yellow-400 font-mono px-4 py-3 rounded-xl border border-[#36221d] focus:outline-none focus:border-purple-500"
                  />
                </div>
                {subError && <p className="text-red-400 text-sm">{subError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setSubStep('details')}
                    className="flex-1 py-3 bg-[#2a1915] text-cream-200 rounded-xl font-medium transition-all">Back</button>
                  <button
                    disabled={subscribing}
                    onClick={async () => {
                      setSubscribing(true); setSubError('');
                      const res = await fetch('/api/subscriptions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ performer_id: performer.id, reference: subReference }),
                      });
                      const data = await res.json();
                      setSubscribing(false);
                      if (!res.ok) { setSubError(data.error || 'Failed to activate subscription'); return; }
                      setIsSubscribed(true);
                      setShowSubModal(false);
                      fetch(`/api/performers/posts?performer_id=${performer.id}`)
                        .then(r => r.json())
                        .then(d => { if (Array.isArray(d.posts)) setPosts(d.posts); });
                    }}
                    className="flex-1 py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white rounded-xl font-bold transition-all"
                  >
                    {subscribing ? 'Activating...' : 'Activate Subscription'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && currentPhoto && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}>
          <img src={currentPhoto.url} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
          {photos.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); prevPhoto(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/60 rounded-full flex items-center justify-center text-white text-2xl">‹</button>
              <button onClick={e => { e.stopPropagation(); nextPhoto(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/60 rounded-full flex items-center justify-center text-white text-2xl">›</button>
            </>
          )}
        </div>
      )}

      {/* Book Modal */}
      {showBook && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center">
          <div className="bg-[#1e1210] border border-[#36221d] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">Book {performer.display_name}</h2>
              <button onClick={() => { setShowBook(false); setBookError(''); setDateLocked(false); }}
                className="text-cream-300 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-cream-200 text-sm mb-1">Date</label>
                {dateLocked ? (
                  <div className="w-full bg-[#140c0a] text-white px-4 py-3 rounded-xl border border-[#36221d] flex items-center justify-between">
                    <span>{new Date(bookForm.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                    <span className="text-cream-400 text-xs">🔒</span>
                  </div>
                ) : (
                  <>
                    <input type="date" min={today} value={bookForm.date}
                      onChange={e => setBookForm(f => ({ ...f, date: e.target.value, time: '' }))}
                      className="w-full bg-[#140c0a] text-white px-4 py-3 rounded-xl border border-[#36221d] focus:outline-none focus:border-primary-500" />
                    {bookForm.date && !isDateAvailable(bookForm.date) && (
                      <p className="text-red-400 text-xs mt-1">Not available on {getDayName(bookForm.date)}s.</p>
                    )}
                  </>
                )}
              </div>
              {bookForm.date && (dateLocked || isDateAvailable(bookForm.date)) && (
                <div>
                  <label className="block text-cream-200 text-sm mb-1">Time</label>
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                    {timeSlots.map(slot => {
                      const taken = takenSlots.includes(slot);
                      return (
                        <button key={slot} disabled={taken}
                          onClick={() => setBookForm(f => ({ ...f, time: slot }))}
                          className={`py-2 rounded-lg text-sm font-medium transition-all ${
                            taken ? 'bg-[#2a1915] text-cream-400 cursor-not-allowed line-through'
                            : bookForm.time === slot ? 'bg-primary-500 text-white'
                            : 'bg-[#2a1915] hover:bg-[#36221d] text-cream-100'
                          }`}>{slot}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-cream-200 text-sm mb-1">Duration</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(pricing).length > 0
                    ? Object.keys(pricing).sort((a, b) => Number(a) - Number(b))
                    : DURATIONS.map(String)
                  ).map(d => (
                    <button key={d} onClick={() => setBookForm(f => ({ ...f, duration: Number(d) }))}
                      className={`py-3 rounded-xl text-sm font-medium transition-all ${
                        bookForm.duration === Number(d) ? 'bg-primary-500 text-white' : 'bg-[#2a1915] hover:bg-[#36221d] text-cream-100'
                      }`}>
                      {d} min
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-cream-200 text-sm mb-1">Note (optional)</label>
                <textarea value={bookForm.note}
                  onChange={e => setBookForm(f => ({ ...f, note: e.target.value }))}
                  rows={2} placeholder="Anything you'd like the performer to know..."
                  className="w-full bg-[#140c0a] text-white px-4 py-3 rounded-xl border border-[#36221d] focus:outline-none focus:border-primary-500 resize-none text-sm" />
              </div>
              {bookError && <p className="text-red-400 text-sm">{bookError}</p>}
              <button onClick={submitBooking}
                disabled={booking || !bookForm.date || !bookForm.time}
                className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white py-3 rounded-xl font-bold transition-all">
                {booking ? 'Sending...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
