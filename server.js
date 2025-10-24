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

// Socket.io for WebRTC signaling - OPTIMIZED FOR STABILITY
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['*']
  },
  // Optimized timeout settings for stable connections
  pingTimeout: 30000,        // 30 seconds - time to wait for pong response
  pingInterval: 20000,       // 20 seconds - interval between pings
  upgradeTimeout: 10000,     // 10 seconds - timeout for upgrade to websocket
  allowEIO3: true,           // Allow Engine.IO v3 clients
  transports: ['websocket', 'polling'],
  // Connection state management
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true
  }
});

const userSockets = {};
const roomUsers = {};
const userNames = {};

app.set('userSockets', userSockets);
app.set('roomUsers', roomUsers);
app.set('userNames', userNames);
app.set('io', io);

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);
  
  // Connection health monitoring
  socket.on('ping', () => {
    socket.emit('pong');
  });
  
  // Handle connection errors
  socket.on('error', (error) => {
    console.error('❌ Socket error:', socket.id, error);
  });

  // Register user with their socket
  socket.on('register-user', ({ userId, userName }) => {
    if (!userId) return;
    
    console.log(`Registering user ${userId} with socket ${socket.id}`);
    
    if (!userSockets[userId]) {
      userSockets[userId] = [];
    }
    
    if (!userSockets[userId].includes(socket.id)) {
      userSockets[userId].push(socket.id);
    }
    
    // Store user name for display
    if (userName) {
      userNames[userId] = userName;
      console.log(`✅ Stored user name for ${userId}: ${userName}`);
    }
    
    socket.userId = userId;
    console.log(`User ${userId} now has ${userSockets[userId].length} sockets`);
  });

  // Join a video room
  socket.on('join-room', ({ roomId, userId, userName }) => {
    if (!userId || userId === 'anonymous') {
      console.error(`❌ Invalid user ID:`, userId);
      socket.emit('join-error', { error: 'Invalid user ID' });
      return;
    }
    
    console.log(`User ${userId} joining room ${roomId}`);
    
    socket.join(roomId);
    
    // Track room users
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = new Set();
    }
    roomUsers[roomId].add(userId);
    
    // Store user name
    if (userName) {
      userNames[userId] = userName;
    }
    
    // Get all users in room for response
    const usersInRoom = Array.from(roomUsers[roomId]);
    const isCaller = usersInRoom.length === 1;
    
    console.log(`Room ${roomId} now has users:`, usersInRoom);
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', { 
      userId,
      userName: userNames[userId] || `User-${userId.substr(0, 8)}`,
      socketId: socket.id 
    });
    
    // Acknowledge join
    socket.emit('joined-room', { 
      roomId, 
      success: true,
      usersInRoom: usersInRoom,
      isCaller: isCaller,
      yourUserId: userId
    });
    
    // If second user joined, notify first user
    if (roomUsers[roomId].size === 2) {
      socket.to(roomId).emit('partner-joined', { 
        userId,
        userName: userNames[userId] || `User-${userId.substr(0, 8)}`
      });
      console.log(`🚀 Partner joined - room ready for call`);
    }
    
    // Share user info with others
    setTimeout(() => {
      socket.to(roomId).emit('user-info', {
        userId: userId,
        userName: userNames[userId] || `User-${userId.substr(0, 8)}`
      });
    }, 500);
  });

  // WebRTC signaling - SIMPLIFIED AND FIXED
  socket.on('webrtc-signal', (data) => {
    const { roomId, type, offer, answer, candidate } = data;
    console.log(`📡 WebRTC signal in ${roomId}: ${type} from ${socket.id}`);
    
    // Broadcast to other users in the room
    socket.to(roomId).emit('webrtc-signal', {
      type,
      offer,
      answer,
      candidate,
      from: socket.id
    });
  });

  // Request offer from caller
  socket.on('request-offer', ({ roomId }) => {
    console.log(`📨 User ${socket.id} requesting offer in room ${roomId}`);
    socket.to(roomId).emit('offer-requested', { from: socket.id });
  });

  // Share user info
  socket.on('share-user-info', (data) => {
    const { roomId, userId, userName } = data;
    console.log(`👤 User ${userId} sharing name: ${userName}`);
    
    if (userName) {
      userNames[userId] = userName;
    }
    
    socket.to(roomId).emit('user-info', {
      userId: userId,
      userName: userName || userNames[userId] || `User-${userId.substr(0, 8)}`
    });
  });

  // Leave room
  socket.on('leave-room', ({ roomId, userId }) => {
    const leaveUserId = userId || socket.userId;
    console.log(`User ${leaveUserId} leaving room ${roomId}`);
    
    socket.leave(roomId);
    
    if (roomUsers[roomId] && leaveUserId) {
      roomUsers[roomId].delete(leaveUserId);
      if (roomUsers[roomId].size === 0) {
        delete roomUsers[roomId];
      }
    }
    
    socket.to(roomId).emit('user-left', { 
      userId: leaveUserId, 
      socketId: socket.id 
    });
  });

  // Handle disconnection with enhanced logging
  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', socket.id, 'Reason:', reason);
    
    const uid = socket.userId;
    if (uid && userSockets[uid]) {
      userSockets[uid] = userSockets[uid].filter(sid => sid !== socket.id);
      
      if (userSockets[uid].length === 0) {
        delete userSockets[uid];
        delete userNames[uid];
        console.log(`🗑️ Cleaned up user data for ${uid}`);
      } else {
        console.log(`👤 User ${uid} still has ${userSockets[uid].length} active sockets`);
      }
    }
    
    // Clean up room data if user was in a room
    Object.keys(roomUsers).forEach(roomId => {
      if (roomUsers[roomId] && roomUsers[roomId].has(uid)) {
        roomUsers[roomId].delete(uid);
        if (roomUsers[roomId].size === 0) {
          delete roomUsers[roomId];
          console.log(`🗑️ Cleaned up empty room ${roomId}`);
        } else {
          // Notify remaining users
          socket.to(roomId).emit('user-left', { 
            userId: uid, 
            socketId: socket.id,
            reason: reason
          });
        }
      }
    });
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