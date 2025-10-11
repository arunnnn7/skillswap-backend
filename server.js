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
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Map of userId -> array of socket ids (supports multi-tab)
const userSockets = {};
app.set('userSockets', userSockets);
app.set('io', io);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/skills', skillsRoutes);
// new v2 skills endpoints (offered/wanted/browse/search)
app.use('/api/skills', skillsV2Routes);
app.use('/api/swaps', swapsRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);

// basic health
app.get('/', (req, res) => res.send({ ok: true, msg: 'Skill Swap API' }));

// Simple socket.io signaling for WebRTC
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join-room', ({ roomId, userId }) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', { userId });
  });

  // clients can announce their userId so server can map socket ids to users
  socket.on('register-user', ({ userId }) => {
    if (!userId) return
    userSockets[userId] = userSockets[userId] || []
    if (!userSockets[userId].includes(socket.id)) userSockets[userId].push(socket.id)
    socket.userId = userId
  })

  socket.on('signal', ({ roomId, data }) => {
    socket.to(roomId).emit('signal', data);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
    // cleanup userSockets mapping
    const uid = socket.userId
    if (uid && userSockets[uid]){
      userSockets[uid] = userSockets[uid].filter(sid => sid !== socket.id)
      if (userSockets[uid].length === 0) delete userSockets[uid]
    }
  });
});

const PORT = process.env.PORT || 5000;

async function start() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.warn('MONGO_URI not set in environment; server will still start but DB will fail until set.');
  }

  try {
    if (mongoUri) await mongoose.connect(mongoUri);
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
