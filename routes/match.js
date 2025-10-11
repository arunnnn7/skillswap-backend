const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Match = require('../models/Match');
const Skill = require('../models/Skill');

const router = express.Router();

// Find a partner based on overlapping skills
router.post('/find', auth, async (req, res) => {
  const { desiredSkills } = req.body; // array of skills user is looking to learn
  try {
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ msg: 'User not found' });

    // find other users who have at least one of desiredSkills by looking up Skill documents
    // This aligns with how the dashboard builds matches (via Skill collection)
    const skillDocs = await Skill.find({ skillName: { $in: desiredSkills }, user: { $ne: me._id } }).populate('user', '-password').lean();

    if (!skillDocs || skillDocs.length === 0) return res.json({ msg: 'No matches found', match: null });

    // choose best candidate by number of matched skills across skillDocs grouped by user
    const byUser = {}
    for (const s of skillDocs) {
      const uid = String(s.user._id)
      byUser[uid] = byUser[uid] || { user: s.user, matchedSkills: new Set() }
      byUser[uid].matchedSkills.add(s.skillName)
    }

    let best = null;
    let bestCount = -1;
    for (const uid of Object.keys(byUser)) {
      const matchedSkills = Array.from(byUser[uid].matchedSkills)
      if (matchedSkills.length > bestCount) {
        best = { user: byUser[uid].user, matchedSkills }
        bestCount = matchedSkills.length
      }
    }

    // create match record
    const match = new Match({ userId1: me._id, userId2: best.user._id, matchedSkills: best.matchedSkills });
    await match.save();

    res.json({ msg: 'Match found', matchId: match._id, partner: { id: best.user._id, name: best.user.name, phoneNumber: best.user.phoneNumber, skills: best.user.skills }, matchedSkills: best.matchedSkills });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Connect: return partner info for a match
router.post('/connect', auth, async (req, res) => {
  const { matchId } = req.body;
  try {
    const match = await Match.findById(matchId).populate('userId1 userId2', '-password');
    if (!match) return res.status(404).json({ msg: 'Match not found' });

    // determine partner
    const partner = match.userId1._id.equals(req.user.id) ? match.userId2 : match.userId1;

    // update status
    match.status = 'connected';
    await match.save();

    res.json({ partner: { id: partner._id, name: partner.name, phoneNumber: partner.phoneNumber, skills: partner.skills } });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Get current user's matches (completed)
router.get('/my', auth, async (req, res) => {
  try {
    const matches = await Match.find({
      $or: [{ userId1: req.user.id }, { userId2: req.user.id }],
      status: 'completed'
    }).populate('userId1 userId2', '-password');

    // format response
    const formatted = matches.map(m => {
      const partner = m.userId1._id.equals(req.user.id) ? m.userId2 : m.userId1;
      return {
        id: m._id,
        skill: m.matchedSkills,
        partnerName: partner.name,
        date: m.updatedAt,
        status: m.status
      }
    })

    res.json({ matches: formatted })
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
})

// Mark a match as completed (optionally include a rating for the partner)
router.post('/complete', auth, async (req, res) => {
  const { matchId, rating } = req.body;
  try {
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ msg: 'Match not found' });

    // ensure requesting user is part of the match
    const userId = req.user.id;
    const isParticipant = match.userId1.equals(userId) || match.userId2.equals(userId);
    if (!isParticipant) return res.status(403).json({ msg: 'Not authorized for this match' });

    if (match.status === 'completed') return res.json({ msg: 'Already completed' });

    match.status = 'completed';
    await match.save();

    // if a rating was provided, update partner's average rating
    if (rating && typeof rating === 'number') {
      const partnerId = match.userId1.equals(userId) ? match.userId2 : match.userId1;
      const partner = await User.findById(partnerId);
      if (partner) {
        const prevTotal = (partner.ratings || 0) * (partner.ratingCount || 0);
        const newCount = (partner.ratingCount || 0) + 1;
        const newAvg = (prevTotal + rating) / newCount;
        partner.ratings = newAvg;
        partner.ratingCount = newCount;
        await partner.save();
      }
    }

    res.json({ msg: 'Match marked completed' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
