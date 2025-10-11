const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Skill = require('../models/Skill');
const Swap = require('../models/Swap');

const router = express.Router();

// GET /api/dashboard
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name email');

    const offeredCount = await Skill.countDocuments({ user: req.user.id, skillType: 'offered', deleted: false });
    const wantedCount = await Skill.countDocuments({ user: req.user.id, skillType: 'wanted', deleted: false });
    const completedSwaps = await Swap.countDocuments({ $or: [{ requester: req.user.id }, { skillOwner: req.user.id }], status: 'completed' });

    const myOffered = await Skill.find({ user: req.user.id, skillType: 'offered', deleted: false }).lean();
    const myWanted = await Skill.find({ user: req.user.id, skillType: 'wanted', deleted: false }).lean();

    const browseOffered = await Skill.find({ skillType: 'offered', deleted: false, user: { $ne: req.user.id } }).populate('user', 'name').limit(30).lean();
    const browseWanted = await Skill.find({ skillType: 'wanted', deleted: false, user: { $ne: req.user.id } }).populate('user', 'name').limit(30).lean();

    res.json({
      success: true,
      user,
      stats: {
        offered_skills: offeredCount,
        wanted_skills: wantedCount,
        completed_swaps: completedSwaps
      },
      my_skills: { offered: myOffered, wanted: myWanted },
      browse_skills: { offered: browseOffered, wanted: browseWanted }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;

// GET /api/dashboard/matches - find potential matches for the current user
router.get('/matches', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const myOffered = await Skill.find({ user: userId, skillType: 'offered', deleted: false }).lean();
    const myWanted = await Skill.find({ user: userId, skillType: 'wanted', deleted: false }).lean();

    const mongoose = require('mongoose');
    // Others want what I offer
   const offeredMatches = await Skill.aggregate([
  { $match: { skillType: 'wanted', deleted: false, user: { $ne: new mongoose.Types.ObjectId(userId) }, skillName: { $in: myOffered.map(s => s.skillName) } } },
  { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user_info' } },
  { $unwind: '$user_info' },
  { $project: { skillName: 1, category: 1, priorityLevel: 1, user: '$user_info' } }
]);

const wantedMatches = await Skill.aggregate([
  { $match: { skillType: 'offered', deleted: false, user: { $ne: new mongoose.Types.ObjectId(userId) }, skillName: { $in: myWanted.map(s => s.skillName) } } },
  { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user_info' } },
  { $unwind: '$user_info' },
  { $project: { skillName: 1, category: 1, proficiencyLevel: 1, user: '$user_info' } }
]);


    // Add simple matchScore heuristic (exact name match => 90-100)
    const scoreFor = (s) => 90 + Math.floor(Math.random() * 10);

    const formattedOff = offeredMatches.map(m => ({ skill: m.skillName, type: 'you-offer-they-want', partner: { id: m.user._id, name: m.user.name }, score: scoreFor(m) }));
    const formattedWant = wantedMatches.map(m => ({ skill: m.skillName, type: 'you-want-they-offer', partner: { id: m.user._id, name: m.user.name }, score: scoreFor(m) }));

    res.json({ success: true, matches: { offeredMatches: formattedOff, wantedMatches: formattedWant } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
