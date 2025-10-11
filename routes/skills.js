const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Add or update skills for authenticated user
router.post('/add', auth, async (req, res) => {
  const { skills, wantedSkills, phoneNumber } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (skills) user.skills = skills;
    if (wantedSkills) user.wantedSkills = wantedSkills;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    await user.save();

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Get user by id (public)
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
