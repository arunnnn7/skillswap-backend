const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

dotenv.config();

const authRoutes = require('./routes/auth');
const skillsRoutes = require('./routes/skills');
const skillsV2Routes = require('./routes/skills_v2');
const swapsRoutes = require('./routes/swaps');
const matchRoutes = require('./routes/match');
const videoRoutes = require('./routes/video');
const usersRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const profileRoutes = require('./routes/profile');

const app = express();
const server = http.createServer(app);

// ✅ CORS configuration for Production
const allowedOrigins = [
  "http://localhost:5173",
  "https://skillswap-frontend-neon.vercel.app",
  "https://skillswap-frontend.vercel.app"
];

app.use(cors({ 
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/skills', skillsV2Routes);
app.use('/api/swaps', swapsRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);

// Health check
app.get('/', (req, res) => res.send({ 
  ok: true, 
  msg: 'Skill Swap API (Production)',
  frontend: 'https://skillswap-frontend-neon.vercel.app',
  timestamp: new Date().toISOString()
}));

app.get('/api/health', (req, res) => res.send({ 
  ok: true, 
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'production'
}));

// Socket.io for WebRTC signaling
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['*']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const userSockets = {};
const roomUsers = {}; // Track users in rooms
const activeCalls = {}; // Track active calls

app.set('userSockets', userSockets);
app.set('roomUsers', roomUsers);
app.set('activeCalls', activeCalls);
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Register user with their socket
  socket.on('register-user', ({ userId }) => {
    if (!userId) return;
    
    console.log(`Registering user ${userId} with socket ${socket.id}`);
    
    if (!userSockets[userId]) {
      userSockets[userId] = [];
    }
    
    if (!userSockets[userId].includes(socket.id)) {
      userSockets[userId].push(socket.id);
    }
    
    socket.userId = userId;
    console.log(`User ${userId} now has ${userSockets[userId].length} sockets`);
  });

  // Join a video room - IMPROVED VERSION
  socket.on('join-room', ({ roomId, userId }) => {
    console.log(`User ${userId} joining room ${roomId}`);
    
    socket.join(roomId);
    
    // Track room users
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = new Set();
    }
    roomUsers[roomId].add(userId);
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', { 
      userId,
      socketId: socket.id 
    });
    
    // Acknowledge join with room info
    socket.emit('joined-room', { 
      roomId, 
      success: true,
      usersInRoom: Array.from(roomUsers[roomId]),
      isCaller: roomUsers[roomId].size === 1 // First user is caller
    });
    
    console.log(`Room ${roomId} now has users:`, Array.from(roomUsers[roomId]));
    
    // If this is the second user joining, notify the first user to start call
    if (roomUsers[roomId].size === 2) {
      socket.to(roomId).emit('partner-joined', { userId });
      console.log(`Partner joined room ${roomId}, notifying other users`);
    }
  });

  // WebRTC signaling - IMPROVED VERSION
  socket.on('webrtc-signal', (data) => {
    const { roomId, type, offer, answer, candidate } = data;
    console.log(`WebRTC signal in room ${roomId}: ${type} from ${socket.id}`);
    
    // Log signal details for debugging
    if (type === 'offer') {
      console.log('📤 Offer being relayed to room:', roomId);
    } else if (type === 'answer') {
      console.log('📥 Answer being relayed to room:', roomId);
    } else if (type === 'candidate') {
      console.log('🔄 ICE candidate being relayed');
    }
    
    // Broadcast to other users in the room (excluding sender)
    socket.to(roomId).emit('webrtc-signal', {
      type,
      offer,
      answer,
      candidate,
      from: socket.id
    });
  });

  // Handle incoming call notifications
  socket.on('incoming-call-response', ({ roomId, accepted, userId }) => {
    console.log(`Incoming call response from ${userId}: ${accepted ? 'accepted' : 'rejected'}`);
    socket.to(roomId).emit('call-response', { accepted, userId });
  });

  // Call initiation - NEW EVENT
  socket.on('initiate-call', ({ roomId, offer, toUserId }) => {
    console.log(`Call initiation in room ${roomId} to user ${toUserId}`);
    
    // Send offer to specific user
    if (userSockets[toUserId]) {
      userSockets[toUserId].forEach(sid => {
        io.to(sid).emit('webrtc-signal', {
          type: 'offer',
          offer: offer,
          roomId: roomId,
          from: socket.id
        });
        console.log(`📤 Offer sent to user ${toUserId} via socket ${sid}`);
      });
    } else {
      console.log(`❌ User ${toUserId} not connected for call initiation`);
    }
  });

  // Request offer from caller (for answerer)
  socket.on('request-offer', ({ roomId }) => {
    console.log(`User ${socket.id} requesting offer in room ${roomId}`);
    socket.to(roomId).emit('offer-requested', { from: socket.id });
  });

  // Leave room - IMPROVED
  socket.on('leave-room', ({ roomId }) => {
    console.log(`Socket ${socket.id} leaving room ${roomId}`);
    socket.leave(roomId);
    
    // Remove from room tracking
    if (roomUsers[roomId] && socket.userId) {
      roomUsers[roomId].delete(socket.userId);
      if (roomUsers[roomId].size === 0) {
        delete roomUsers[roomId];
      }
    }
    
    socket.to(roomId).emit('user-left', { 
      userId: socket.userId, 
      socketId: socket.id 
    });
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, 'Reason:', reason);
    
    const uid = socket.userId;
    if (uid && userSockets[uid]) {
      userSockets[uid] = userSockets[uid].filter(sid => sid !== socket.id);
      
      if (userSockets[uid].length === 0) {
        delete userSockets[uid];
        console.log(`Removed all sockets for user ${uid}`);
      } else {
        console.log(`User ${uid} has ${userSockets[uid].length} sockets remaining`);
      }
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Debug endpoint to check connected users and rooms
app.get('/api/debug/connected-users', (req, res) => {
  res.json({
    connectedUsers: Object.keys(userSockets).length,
    userSockets: userSockets,
    activeRooms: Object.keys(roomUsers).reduce((acc, roomId) => {
      acc[roomId] = Array.from(roomUsers[roomId]);
      return acc;
    }, {})
  });
});

// Production port
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
async function start() {
  const mongoUri = process.env.MONGO_URI || "mongodb+srv://arun:arunprakash@skill.tbufvet.mongodb.net/?retryWrites=true&w=majority&appName=skill";
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();