const express = require('express');
const auth = require('../middleware/auth');
const Skill = require('../models/Skill');
const Swap = require('../models/Swap');
const User = require('../models/User');

const router = express.Router();

// Request a swap
router.post('/request', auth, async (req, res) => {
  const { skillOwnerId, requestedSkillId, offeredSkillId } = req.body;
  try {
    // validate skills
    const requested = await Skill.findById(requestedSkillId);
    const offered = await Skill.findById(offeredSkillId);
    if (!requested || !offered) return res.status(400).json({ success: false, error: 'Skill not found' });
    if (requested.user.toString() !== skillOwnerId) return res.status(400).json({ success: false, error: 'Requested skill owner mismatch' });
    if (offered.user.toString() !== req.user.id) return res.status(400).json({ success: false, error: 'Offered skill must belong to requester' });

    const swap = new Swap({ requester: req.user.id, skillOwner: skillOwnerId, requestedSkill: requestedSkillId, offeredSkill: offeredSkillId });
    await swap.save();

    res.json({ success: true, swapId: swap._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Accept swap
router.put('/:id/accept', auth, async (req, res) => {
  try {
    const swap = await Swap.findById(req.params.id).populate('requestedSkill offeredSkill');
    if (!swap) return res.status(404).json({ success: false, error: 'Swap not found' });
    if (swap.skillOwner.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (swap.status !== 'pending') return res.status(400).json({ success: false, error: 'Swap not pending' });

    swap.status = 'accepted';
    await swap.save();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Complete swap
router.put('/:id/complete', auth, async (req, res) => {
  try {
    const swap = await Swap.findById(req.params.id);
    if (!swap) return res.status(404).json({ success: false, error: 'Swap not found' });
    const isParticipant = [swap.requester.toString(), swap.skillOwner.toString()].includes(req.user.id);
    if (!isParticipant) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (swap.status !== 'accepted') return res.status(400).json({ success: false, error: 'Swap must be accepted before completing' });

    swap.status = 'completed';
    swap.completedAt = new Date();
    await swap.save();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get user's swaps
router.get('/my-swaps', auth, async (req, res) => {
  try {
    const swaps = await Swap.find({ $or: [{ requester: req.user.id }, { skillOwner: req.user.id }] })
      .populate('requester skillOwner requestedSkill offeredSkill');
    res.json({ success: true, swaps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
