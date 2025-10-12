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
    // Allow requests with no origin (like mobile apps or curl requests)
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
  // Add these for better connection stability
  pingTimeout: 60000,
  pingInterval: 25000
});

const userSockets = {};
app.set('userSockets', userSockets);
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Register user with their socket
  socket.on('register-user', ({ userId }) => {
    if (!userId) return;
    
    console.log(`Registering user ${userId} with socket ${socket.id}`);
    
    // Initialize user's socket array if it doesn't exist
    if (!userSockets[userId]) {
      userSockets[userId] = [];
    }
    
    // Add socket if not already present
    if (!userSockets[userId].includes(socket.id)) {
      userSockets[userId].push(socket.id);
    }
    
    socket.userId = userId;
    
    console.log(`User ${userId} now has ${userSockets[userId].length} sockets`);
  });

  // Join a video room
  socket.on('join-room', ({ roomId, userId, userData }) => {
    console.log(`User ${userId} joining room ${roomId}`);
    
    socket.join(roomId);
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', { 
      userId, 
      userData,
      socketId: socket.id 
    });
    
    // Acknowledge join
    socket.emit('joined-room', { roomId, success: true });
  });

  // WebRTC signaling
  socket.on('webrtc-signal', ({ roomId, type, offer, answer, candidate }) => {
    console.log(`WebRTC signal in room ${roomId}: ${type}`);
    
    // Broadcast to other users in the room
    socket.to(roomId).emit('webrtc-signal', {
      type,
      offer,
      answer,
      candidate,
      from: socket.id
    });
  });

  // Legacy signal handler (for backward compatibility)
  socket.on('signal', ({ roomId, data }) => {
    console.log(`Legacy signal in room ${roomId}`);
    socket.to(roomId).emit('signal', data);
  });

  // Handle incoming call notifications
  socket.on('incoming-call-response', ({ roomId, accepted, userId }) => {
    console.log(`Incoming call response from ${userId}: ${accepted ? 'accepted' : 'rejected'}`);
    socket.to(roomId).emit('call-response', { accepted, userId });
  });

  // Leave room
  socket.on('leave-room', ({ roomId }) => {
    console.log(`Socket ${socket.id} leaving room ${roomId}`);
    socket.leave(roomId);
    socket.to(roomId).emit('user-left', { userId: socket.userId, socketId: socket.id });
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, 'Reason:', reason);
    
    const uid = socket.userId;
    if (uid && userSockets[uid]) {
      // Remove this socket from user's sockets
      userSockets[uid] = userSockets[uid].filter(sid => sid !== socket.id);
      
      // Clean up if no sockets left for this user
      if (userSockets[uid].length === 0) {
        delete userSockets[uid];
        console.log(`Removed all sockets for user ${uid}`);
      } else {
        console.log(`User ${uid} has ${userSockets[uid].length} sockets remaining`);
      }
    }
  });

  // Error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Debug endpoint to check connected users
app.get('/api/debug/connected-users', (req, res) => {
  res.json({
    connectedUsers: Object.keys(userSockets).length,
    userSockets: userSockets
  });
});

// Production port - REMOVE THE VERCEL CODE
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