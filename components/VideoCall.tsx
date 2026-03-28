'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';

interface Props {
  socket: Socket | null;
  callId: string;
  isInitiator: boolean; // customer = true, performer = false
  onCallEnded: () => void;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function VideoCall({ socket, callId, isInitiator, onCallEnded }: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<'connecting' | 'connected' | 'ended'>('connecting');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [error, setError] = useState('');

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
  }, []);

  useEffect(() => {
    if (!socket) return;

    const startMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        await initPeerConnection(stream);
      } catch (e) {
        setError('Could not access camera/microphone. Please allow permissions.');
      }
    };

    const initPeerConnection = async (stream: MediaStream) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setStatus('connected');
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', { callId, candidate: event.candidate });
        }
      };

      if (!isInitiator) {
        // Non-initiator signals they are ready to receive an offer
        socket.emit('webrtc-ready', { callId });
      }
    };

    const onPeerJoined = () => {
      // If the other party joined after us and we're the non-initiator,
      // re-send webrtc-ready so the initiator knows we're set up
      if (!isInitiator && pcRef.current) {
        socket.emit('webrtc-ready', { callId });
      }
    };

    const sendOffer = async () => {
      if (!isInitiator || !pcRef.current) return;
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      socket.emit('webrtc-offer', { callId, offer });
    };

    const onOffer = async ({ offer }: { callId: string; offer: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      socket.emit('webrtc-answer', { callId, answer });
    };

    const onAnswer = async ({ answer }: { callId: string; answer: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    };

    const onIce = async ({ candidate }: { callId: string; candidate: RTCIceCandidateInit }) => {
      if (!pcRef.current) return;
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    };

    const onCallEnded = () => {
      setStatus('ended');
      cleanup();
      onCallEnded();
    };

    socket.on('webrtc-offer', onOffer);
    socket.on('webrtc-answer', onAnswer);
    socket.on('ice-candidate', onIce);
    socket.on('call-ended', onCallEnded);
    socket.on('webrtc-ready', sendOffer);
    socket.on('peer-joined', onPeerJoined);

    startMedia();

    return () => {
      socket.off('webrtc-offer', onOffer);
      socket.off('webrtc-answer', onAnswer);
      socket.off('ice-candidate', onIce);
      socket.off('call-ended', onCallEnded);
      socket.off('webrtc-ready', sendOffer);
      socket.off('peer-joined', onPeerJoined);
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, callId, isInitiator]);

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMuted(!muted); }
  };

  const toggleCam = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setCamOff(!camOff); }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-900 rounded-xl">
        <div className="text-center p-6">
          <div className="text-4xl mb-3">📷</div>
          <p className="text-red-400 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black rounded-xl overflow-hidden">
      {/* Remote video */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      {status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-900">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Connecting...</p>
          </div>
        </div>
      )}

      {/* Local video (PiP) */}
      <div className="absolute bottom-4 right-4 w-32 h-24 rounded-lg overflow-hidden border-2 border-dark-600 shadow-xl">
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        {camOff && (
          <div className="absolute inset-0 bg-dark-900 flex items-center justify-center">
            <span className="text-2xl">🚫</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
        <button
          onClick={toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all ${
            muted ? 'bg-red-600' : 'bg-dark-700/80 hover:bg-dark-600'
          }`}
        >
          {muted ? '🔇' : '🎤'}
        </button>
        <button
          onClick={toggleCam}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all ${
            camOff ? 'bg-red-600' : 'bg-dark-700/80 hover:bg-dark-600'
          }`}
        >
          {camOff ? '📵' : '📹'}
        </button>
      </div>
    </div>
  );
}
