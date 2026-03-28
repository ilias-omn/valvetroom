const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // performerId -> socketId
  const onlinePerformers = new Map();
  // callId -> { customerSocketId, performerSocketId }
  const activeCalls = new Map();
  // socketId -> { userId, username, role, connectedAt, page }
  const connectedUsers = new Map();
  // performerId -> Set of socketIds viewing that performer
  const performerViewers = new Map();

  function emitToAdmins(type, data) {
    io.to('admin-room').emit('admin-event', { type, data, ts: Date.now() });
  }

  function getSessionsList() {
    return Array.from(connectedUsers.entries()).map(([socketId, info]) => ({
      socketId,
      ...info,
    }));
  }

  function getViewerCounts() {
    return Object.fromEntries(
      Array.from(performerViewers.entries()).map(([pid, set]) => [pid, set.size])
    );
  }

  io.on('connection', (socket) => {
    // ----- ADMIN -----
    socket.on('admin-join', () => {
      socket.join('admin-room');
      socket.emit('admin-sessions', getSessionsList());
      socket.emit('admin-viewers', getViewerCounts());
    });

    // ----- USER IDENTIFICATION -----
    socket.on('user-identify', ({ userId, username, role, page }) => {
      const info = { userId, username, role, page: page || '/', connectedAt: Date.now() };
      connectedUsers.set(socket.id, info);
      socket.data.userId = userId;
      socket.data.username = username;
      socket.data.role = role;
      emitToAdmins('user-connected', { socketId: socket.id, ...info });
      io.to('admin-room').emit('admin-sessions', getSessionsList());
    });

    // ----- NEW LOGIN -----
    socket.on('user-login', ({ userId, username, role }) => {
      emitToAdmins('new-login', { userId, username, role });
    });

    // ----- NEW REGISTRATION -----
    socket.on('user-register', ({ userId, username, role }) => {
      emitToAdmins('new-register', { userId, username, role });
    });

    // ----- VIEWER TRACKING -----
    socket.on('viewer-join', ({ performerId, userId, username }) => {
      if (!performerViewers.has(performerId)) {
        performerViewers.set(performerId, new Set());
      }
      performerViewers.get(performerId).add(socket.id);
      socket.data.viewingPerformerId = performerId;
      emitToAdmins('viewer-joined', { performerId, userId, username, socketId: socket.id });
      io.to('admin-room').emit('admin-viewers', getViewerCounts());
    });

    socket.on('viewer-leave', ({ performerId }) => {
      if (performerViewers.has(performerId)) {
        performerViewers.get(performerId).delete(socket.id);
        if (performerViewers.get(performerId).size === 0) {
          performerViewers.delete(performerId);
        }
      }
      socket.data.viewingPerformerId = null;
      emitToAdmins('viewer-left', { performerId, socketId: socket.id });
      io.to('admin-room').emit('admin-viewers', getViewerCounts());
    });

    // ----- PERFORMER PRESENCE -----
    socket.on('performer-online', ({ performerId }) => {
      onlinePerformers.set(performerId, socket.id);
      socket.data.performerId = performerId;
      io.emit('performer-status', { performerId, online: true });
      emitToAdmins('performer-online', { performerId, username: socket.data.username });
    });

    socket.on('performer-offline', ({ performerId }) => {
      onlinePerformers.delete(performerId);
      io.emit('performer-status', { performerId, online: false });
      emitToAdmins('performer-offline', { performerId, username: socket.data.username });
    });

    // ----- CALL PAGE JOIN (join room for this call) -----
    socket.on('call-join', ({ callId, role, performerId }) => {
      socket.join(`call:${callId}`);
      socket.data.callId = callId;
      socket.data.callRole = role;
      // Re-register performer as online with new socket
      if (role === 'performer' && performerId) {
        onlinePerformers.set(performerId, socket.id);
        socket.data.performerId = performerId;
      }
      // Tell the other party someone joined
      socket.to(`call:${callId}`).emit('peer-joined', { role });
    });

    // ----- CALL FLOW -----
    socket.on('call-request', ({ callId, performerId, customerId, customerName }) => {
      const perfSocketId = onlinePerformers.get(performerId);
      if (!perfSocketId) {
        socket.emit('call-error', { message: 'Performer is offline' });
        return;
      }
      // Store customer socket so we can notify them of accept/reject
      activeCalls.set(callId, { customerSocketId: socket.id, performerSocketId: perfSocketId });
      io.to(perfSocketId).emit('incoming-call', { callId, customerId, customerName });
      emitToAdmins('call-requested', { callId, customerId, customerName, performerId });
    });

    socket.on('call-accepted', ({ callId }) => {
      const call = activeCalls.get(callId);
      if (call) {
        // Notify customer directly (they haven't joined the room yet)
        io.to(call.customerSocketId).emit('call-accepted', { callId });
        emitToAdmins('call-accepted', { callId, performerUsername: socket.data.username });
      }
    });

    socket.on('call-rejected', ({ callId }) => {
      const call = activeCalls.get(callId);
      if (call) {
        io.to(call.customerSocketId).emit('call-rejected', { callId });
        activeCalls.delete(callId);
        emitToAdmins('call-rejected', { callId, performerUsername: socket.data.username });
      }
    });

    // ----- WebRTC SIGNALING (room-based) -----
    socket.on('webrtc-ready', ({ callId }) => {
      socket.to(`call:${callId}`).emit('webrtc-ready');
    });

    socket.on('webrtc-offer', ({ callId, offer }) => {
      socket.to(`call:${callId}`).emit('webrtc-offer', { callId, offer });
    });

    socket.on('webrtc-answer', ({ callId, answer }) => {
      socket.to(`call:${callId}`).emit('webrtc-answer', { callId, answer });
    });

    socket.on('ice-candidate', ({ callId, candidate }) => {
      socket.to(`call:${callId}`).emit('ice-candidate', { callId, candidate });
    });

    // ----- CHAT (room-based) -----
    socket.on('chat-message', ({ callId, message, senderName, senderId }) => {
      const payload = { callId, message, senderName, senderId, ts: Date.now() };
      socket.to(`call:${callId}`).emit('chat-message', payload);
      socket.emit('chat-message-sent', payload);
      emitToAdmins('chat-message', { callId, message, senderName, senderId });
    });

    // ----- END CALL (room-based) -----
    socket.on('end-call', ({ callId }) => {
      socket.to(`call:${callId}`).emit('call-ended', { callId });
      activeCalls.delete(callId);
      emitToAdmins('call-ended', { callId, endedBy: socket.data.username });
    });

    // ----- DISCONNECT -----
    socket.on('disconnect', () => {
      const userInfo = connectedUsers.get(socket.id);
      if (userInfo) {
        emitToAdmins('user-disconnected', { socketId: socket.id, ...userInfo });
        connectedUsers.delete(socket.id);
        io.to('admin-room').emit('admin-sessions', getSessionsList());
      }

      // Remove performer
      if (socket.data.performerId) {
        onlinePerformers.delete(socket.data.performerId);
        io.emit('performer-status', { performerId: socket.data.performerId, online: false });
        emitToAdmins('performer-offline', { performerId: socket.data.performerId, reason: 'disconnect' });
      }

      // Clean up viewer
      if (socket.data.viewingPerformerId) {
        const pid = socket.data.viewingPerformerId;
        if (performerViewers.has(pid)) {
          performerViewers.get(pid).delete(socket.id);
          if (performerViewers.get(pid).size === 0) performerViewers.delete(pid);
        }
        io.to('admin-room').emit('admin-viewers', getViewerCounts());
      }

      // End any active call
      if (socket.data.callId) {
        const call = activeCalls.get(socket.data.callId);
        if (call) {
          const target = socket.id === call.customerSocketId
            ? call.performerSocketId
            : call.customerSocketId;
          io.to(target).emit('call-ended', { callId: socket.data.callId, reason: 'disconnect' });
          activeCalls.delete(socket.data.callId);
          emitToAdmins('call-ended', { callId: socket.data.callId, reason: 'disconnect' });
        }
      }
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
