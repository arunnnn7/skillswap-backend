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

    // Check if user is part of this match
    const isUserInMatch = match.userId1._id.equals(req.user.id) || match.userId2._id.equals(req.user.id);
    if (!isUserInMatch) return res.status(403).json({ msg: 'Not authorized for this match' });

    const roomId = uuidv4();

    // Mark match as connected
    match.status = 'connected';
    await match.save();

    // return partner info and room
    const partner = match.userId1._id.equals(req.user.id) ? match.userId2 : match.userId1;

    // If the server has socket.io and userSockets mapping, notify the partner
    try {
      const app = req.app;
      const io = app.get('io');
      const userSockets = app.get('userSockets');
      const partnerId = String(partner._id);
      
      if (io && userSockets && userSockets[partnerId]) {
        const payload = { 
          roomId, 
          from: { 
            id: req.user.id, 
            name: req.user.name || 'Someone' 
          }, 
          matchId: matchId,
          partnerName: partner.name,
          callerName: req.user.name || 'Someone'
        };
        
        console.log(`Sending incoming-call to partner ${partnerId} with room ${roomId}`);
        
        // Emit to all sockets of the partner using the new event structure
        userSockets[partnerId].forEach(sid => {
          io.to(sid).emit('incoming-call', payload);
          console.log(`Sent incoming-call to socket ${sid}`);
        });
        
        console.log(`Incoming call notification sent to partner: ${partnerId}`);
      } else {
        console.log(`Partner ${partnerId} not connected via socket. Available users:`, Object.keys(userSockets));
      }
    } catch(e) { 
      console.error('Failed to emit incoming-call', e);
    }

    res.json({ 
      roomId, 
      partner: { 
        id: partner._id, 
        name: partner.name, 
        phoneNumber: partner.phoneNumber 
      },
      isCaller: true // Important: indicate this user is the caller
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Join an existing video call
router.post('/join', auth, async (req, res) => {
  const { roomId, matchId } = req.body;
  try {
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ msg: 'Match not found' });

    // Check if user is part of this match
    const isUserInMatch = match.userId1.equals(req.user.id) || match.userId2.equals(req.user.id);
    if (!isUserInMatch) return res.status(403).json({ msg: 'Not authorized for this match' });

    // Get partner info for the frontend
    const partner = match.userId1.equals(req.user.id) ? match.userId2 : match.userId1;
    const partnerUser = await User.findById(partner, 'name phoneNumber');

    res.json({ 
      roomId,
      partner: {
        id: partnerUser._id,
        name: partnerUser.name,
        phoneNumber: partnerUser.phoneNumber
      },
      success: true,
      message: 'Joined video call successfully',
      isCaller: false // Important: indicate this user is not the caller
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Complete a video call
router.post('/complete', auth, async (req, res) => {
  const { matchId, rating } = req.body;
  try {
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ msg: 'Match not found' });

    // Check if user is part of this match
    const isUserInMatch = match.userId1.equals(req.user.id) || match.userId2.equals(req.user.id);
    if (!isUserInMatch) return res.status(403).json({ msg: 'Not authorized for this match' });

    // Update match status and rating
    match.status = 'completed';
    
    // Add rating - determine which user is being rated
    if (match.userId1.equals(req.user.id)) {
      match.userRating2 = rating; // User1 is rating User2
    } else {
      match.userRating1 = rating; // User2 is rating User1
    }
    
    await match.save();

    res.json({ 
      success: true,
      message: 'Call completed successfully'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;