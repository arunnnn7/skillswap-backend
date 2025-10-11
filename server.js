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

// ✅ Use environment variable for frontend URL
const allowedOrigin = process.env.FRONTEND_URL || "https://skillswap-frontend-neon.vercel.app";

app.use(cors({
  origin: allowedOrigin,
  credentials: true
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
app.get('/', (req, res) => res.send({ ok: true, msg: 'Skill Swap API' }));

// Socket.io for WebRTC signaling
const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Map userId -> socket ids
const userSockets = {};
app.set('userSockets', userSockets);
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id, 'Origin:', socket.handshake.headers.origin);

  socket.on('join-room', ({ roomId, userId }) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', { userId });
  });

  socket.on('register-user', ({ userId }) => {
    if (!userId) return;
    userSockets[userId] = userSockets[userId] || [];
    if (!userSockets[userId].includes(socket.id)) userSockets[userId].push(socket.id);
    socket.userId = userId;
  });

  socket.on('signal', ({ roomId, data }) => {
    socket.to(roomId).emit('signal', data);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
    const uid = socket.userId;
    if (uid && userSockets[uid]) {
      userSockets[uid] = userSockets[uid].filter(sid => sid !== socket.id);
      if (userSockets[uid].length === 0) delete userSockets[uid];
    }
  });
});

const PORT = process.env.PORT || 5000;

async function start() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) console.warn('MONGO_URI not set in environment variables.');

  try {
    if (mongoUri) await mongoose.connect(mongoUri);
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
