'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import VideoCall from '@/components/VideoCall';
import Chat from '@/components/Chat';

export default function RoomPage() {
  const { id: bookingId } = useParams<{ id: string }>();
  const router = useRouter();

  const [user, setUser] = useState<{ id: string; username: string; role: string } | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<'waiting' | 'active' | 'ended'>('waiting');
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d || d.error) { router.push('/login'); return; }
        setUser(d);
      });
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const s = io({ path: '/socket.io' });
    socketRef.current = s;
    setSocket(s);

    s.on('connect', () => {
      s.emit('user-identify', { userId: user.id, username: user.username, role: user.role, page: `/room/${bookingId}` });
      s.emit('call-join', {
        callId: bookingId,
        role: user.role,
        performerId: user.role === 'performer' ? user.id : undefined,
      });
    });

    s.on('peer-joined', () => {
      setStatus('active');
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
      }
    });

    s.on('call-ended', () => endSession(true));

    return () => {
      s.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const endSession = (fromRemote = false) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setStatus('ended');
    if (!fromRemote && socketRef.current) {
      socketRef.current.emit('end-call', { callId: bookingId });
    }
    setTimeout(() => router.push(user?.role === 'performer' ? '/performer/dashboard' : '/dashboard'), 2000);
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (!user) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-gray-500">Loading...</div>
  );

  if (status === 'ended') return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">📞</div>
        <h2 className="text-xl font-bold text-white mb-2">Call Ended</h2>
        <p className="text-gray-400">Duration: {fmt(timer)}</p>
        <p className="text-gray-600 text-sm mt-4">Redirecting...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <div className="bg-dark-800 border-b border-dark-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 text-sm ${status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
            <span className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-pulse'}`} />
            {status === 'active' ? 'Connected' : 'Waiting for the other party...'}
          </div>
          {status === 'active' && <span className="text-white font-mono font-bold">{fmt(timer)}</span>}
        </div>
        <button
          onClick={() => endSession(false)}
          className="bg-red-600 hover:bg-red-500 text-white px-5 py-2 rounded-xl font-bold text-sm transition-all"
        >
          End Call
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-4">
          <VideoCall
            socket={socket}
            callId={bookingId}
            isInitiator={user.role === 'customer'}
            onCallEnded={() => endSession(true)}
          />
        </div>
        <div className="w-72 p-4 pl-0">
          <Chat
            socket={socket}
            callId={bookingId}
            myName={user.username}
            myId={user.id}
          />
        </div>
      </div>
    </div>
  );
}
