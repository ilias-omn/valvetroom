'use client';
import { useState, useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';

interface ChatMsg {
  senderName: string;
  message: string;
  isSelf: boolean;
  ts: number;
}

interface Props {
  socket: Socket | null;
  callId: string;
  myName: string;
  myId: string;
}

export default function Chat({ socket, callId, myName, myId }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (data: { message: string; senderName: string; senderId: string; ts: number }) => {
      setMessages(prev => [
        ...prev,
        { ...data, isSelf: data.senderId === myId },
      ]);
    };
    const onSent = (data: { message: string; senderName: string; senderId: string; ts: number }) => {
      setMessages(prev => [
        ...prev,
        { ...data, isSelf: true },
      ]);
    };
    socket.on('chat-message', onMsg);
    socket.on('chat-message-sent', onSent);
    return () => {
      socket.off('chat-message', onMsg);
      socket.off('chat-message-sent', onSent);
    };
  }, [socket, myId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!input.trim() || !socket) return;
    socket.emit('chat-message', { callId, message: input.trim(), senderName: myName, senderId: myId });
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-dark-800 rounded-xl border border-dark-600">
      <div className="px-4 py-3 border-b border-dark-600">
        <h3 className="text-white font-semibold text-sm">Chat</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-gray-600 text-xs text-center mt-4">No messages yet. Say hi!</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.isSelf ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                msg.isSelf
                  ? 'bg-primary-600 text-white rounded-br-sm'
                  : 'bg-dark-600 text-gray-200 rounded-bl-sm'
              }`}
            >
              {!msg.isSelf && (
                <div className="text-xs text-primary-400 font-medium mb-1">{msg.senderName}</div>
              )}
              {msg.message}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-dark-600 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          className="flex-1 bg-dark-700 text-white text-sm px-3 py-2 rounded-lg border border-dark-500 focus:outline-none focus:border-primary-500 placeholder-gray-600"
        />
        <button
          onClick={send}
          className="bg-primary-600 hover:bg-primary-500 text-white px-3 py-2 rounded-lg transition-colors text-sm font-medium"
        >
          Send
        </button>
      </div>
    </div>
  );
}
