const express = require('express');
const auth = require('../middleware/auth');
const Skill = require('../models/Skill');
const User = require('../models/User');

const router = express.Router();

// Add offered skill
router.post('/offered', auth, async (req, res) => {
  const { skillName, category, proficiencyLevel, description } = req.body;
  if (!skillName) return res.status(400).json({ success: false, error: 'skillName required' });
  try {
    const skill = new Skill({ user: req.user.id, skillType: 'offered', skillName, category, proficiencyLevel, description });
    await skill.save();
    res.json({ success: true, skill });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Add wanted skill
router.post('/wanted', auth, async (req, res) => {
  const { skillName, category, priorityLevel, description } = req.body;
  if (!skillName) return res.status(400).json({ success: false, error: 'skillName required' });
  try {
    const skill = new Skill({ user: req.user.id, skillType: 'wanted', skillName, category, priorityLevel, description });
    await skill.save();
    res.json({ success: true, skill });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Delete skill (hard delete) with active-swap check
router.delete('/:id', auth, async (req, res) => {
  try {
    const skill = await Skill.findById(req.params.id);
    if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
    if (skill.user.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });

    // check for active swaps that reference this skill
    const Swap = require('../models/Swap');
    const activeSwaps = await Swap.find({
      $or: [
        { requestedSkill: skill._id, status: { $in: ['pending', 'accepted'] } },
        { offeredSkill: skill._id, status: { $in: ['pending', 'accepted'] } }
      ]
    });

    if (activeSwaps.length > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete skill with active swaps' });
    }

  // delete the skill document
  await Skill.findByIdAndDelete(skill._id);
  res.json({ success: true, message: 'Skill deleted successfully', deletedSkillId: skill._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Browse skills from other users
router.get('/browse', auth, async (req, res) => {
  try {
    const { type = 'offered', category, search, page = 1, limit = 20 } = req.query;
    const q = { skillType: type, deleted: false, user: { $ne: req.user.id } };
    if (category) q.category = category;
    if (search) q.$or = [ { skillName: new RegExp(search, 'i') }, { category: new RegExp(search, 'i') }, { description: new RegExp(search, 'i') } ];

    const skills = await Skill.find(q).populate('user', 'name').skip((page-1)*limit).limit(Number(limit));
    res.json({ success: true, skills });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Search (alias to browse but without auth - optional)
router.get('/search', async (req, res) => {
  try {
    const { q, type = 'offered' } = req.query;
    if (!q) return res.json({ success: true, skills: [] });
    const regex = new RegExp(q, 'i');
    const skills = await Skill.find({ skillType: type, deleted: false, $or: [{ skillName: regex }, { category: regex }, { description: regex }] }).populate('user', 'name');
    res.json({ success: true, skills });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
