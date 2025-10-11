const express = require('express');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const Match = require('../models/Match');
const User = require('../models/User');

const router = express.Router();

// Start a video session for a match (returns room id)
router.post('/start', auth, async (req, res) => {
  const { matchId } = req.body;
  try {
    const match = await Match.findById(matchId).populate('userId1 userId2', '-password');
    if (!match) return res.status(404).json({ msg: 'Match not found' });

    const roomId = uuidv4();

    // Mark match as connected
    match.status = 'connected';
    await match.save();

    // return partner info and room
    const partner = match.userId1._id.equals(req.user.id) ? match.userId2 : match.userId1;

    // If the server has socket.io and userSockets mapping, notify the partner
    try{
      const app = req.app
      const io = app.get('io')
      const userSockets = app.get('userSockets')
      const partnerId = String(partner._id)
      if (io && userSockets && userSockets[partnerId]){
        const payload = { roomId, from: { id: req.user.id, name: (req.user && req.user.name) || 'Someone' }, matchId }
        userSockets[partnerId].forEach(sid => io.to(sid).emit('incoming-call', payload))
      }
    }catch(e){ console.error('Failed to emit incoming-call', e) }

    res.json({ roomId, partner: { id: partner._id, name: partner.name, phoneNumber: partner.phoneNumber } });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
