'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import VideoCall from '@/components/VideoCall';
import Chat from '@/components/Chat';
import type { Call } from '@/lib/types';

export default function CallRoom() {
  const params = useParams();
  const callId = params.id as string;
  const router = useRouter();

  const [user, setUser] = useState<{ id: string; username: string; role: string } | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [callStatus, setCallStatus] = useState<'waiting' | 'active' | 'ended' | 'rejected'>('waiting');
  const [timer, setTimer] = useState(0);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [ratePerMin, setRatePerMin] = useState(10);
  const [balance, setBalance] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (!d || d.error) { router.push('/login'); return; }
      setUser(d);
    });
    fetch(`/api/calls/${callId}`).then(r => r.json()).then(setCall);
    fetch('/api/tokens').then(r => r.json()).then(d => setBalance(d.balance));
  }, [callId, router]);

  useEffect(() => {
    if (!user || !call) return;

    // Get performer rate
    fetch('/api/performers').then(r => r.json()).then((performers: { user_id: string; rate_per_minute: number }[]) => {
      const perf = performers.find(p => p.user_id === call.performer_id);
      if (perf) setRatePerMin(perf.rate_per_minute);
    });

    const s = io({ path: '/socket.io' });
    socketRef.current = s;
    setSocket(s);

    const isCustomer = user.role === 'customer';

    s.on('connect', () => {
      // Always re-register in the active call (socket ID changes on navigation)
      s.emit('call-join', { callId, role: user.role, performerId: user.role === 'performer' ? user.id : undefined });

      if (isCustomer) {
        s.emit('call-request', {
          callId,
          performerId: call.performer_id,
          customerId: user.id,
          customerName: user.username,
        });
      }
    });

    s.on('call-accepted', () => {
      setCallStatus('active');
      // Start billing timer
      timerRef.current = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    });

    s.on('call-rejected', () => {
      setCallStatus('rejected');
      setTimeout(() => router.push('/dashboard'), 3000);
    });

    s.on('call-ended', () => {
      endCall(true);
    });

    // If performer lands on this page, they're already accepted
    if (!isCustomer) {
      setCallStatus('active');
      timerRef.current = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    }

    return () => {
      s.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, call]);

  // Update tokens used display every second
  useEffect(() => {
    setTokensUsed(Math.ceil((timer / 60) * ratePerMin));
  }, [timer, ratePerMin]);

  const endCall = async (fromRemote = false) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCallStatus('ended');
    if (!fromRemote && socketRef.current) {
      socketRef.current.emit('end-call', { callId });
    }
    await fetch(`/api/calls/${callId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'end' }),
    });
    setTimeout(() => router.push(user?.role === 'performer' ? '/performer/dashboard' : '/dashboard'), 2000);
  };

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (!user || !call) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-gray-500">Loading call...</div>
  );

  if (callStatus === 'rejected') return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">❌</div>
        <h2 className="text-xl font-bold text-white mb-2">Call Declined</h2>
        <p className="text-gray-500">The performer declined your call. Redirecting...</p>
      </div>
    </div>
  );

  if (callStatus === 'ended') return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">📞</div>
        <h2 className="text-xl font-bold text-white mb-2">Call Ended</h2>
        <p className="text-gray-400">Duration: {fmt(timer)}</p>
        {user.role === 'customer' && <p className="text-gold-400 mt-1">Tokens used: {tokensUsed}</p>}
        <p className="text-gray-600 text-sm mt-4">Redirecting to dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* Top bar */}
      <div className="bg-dark-800 border-b border-dark-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 text-sm ${callStatus === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
            <span className={`w-2 h-2 rounded-full ${callStatus === 'active' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
            {callStatus === 'active' ? 'Live' : 'Waiting for performer...'}
          </div>
          {callStatus === 'active' && (
            <span className="text-white font-mono font-bold">{fmt(timer)}</span>
          )}
          {callStatus === 'active' && user.role === 'customer' && (
            <span className="text-gold-400 text-sm">
              {tokensUsed} / {balance} tokens
            </span>
          )}
        </div>
        <button
          onClick={() => endCall(false)}
          className="bg-red-600 hover:bg-red-500 text-white px-5 py-2 rounded-xl font-bold text-sm transition-all"
        >
          End Call
        </button>
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video */}
        <div className="flex-1 p-4">
          <VideoCall
            socket={socket}
            callId={callId}
            isInitiator={user.role === 'customer'}
            onCallEnded={() => endCall(true)}
          />
        </div>
        {/* Chat sidebar */}
        <div className="w-72 p-4 pl-0">
          <Chat
            socket={socket}
            callId={callId}
            myName={user.username}
            myId={user.id}
          />
        </div>
      </div>
    </div>
  );
}
