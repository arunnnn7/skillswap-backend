const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  userId1: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userId2: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  matchedSkills: { type: [String], default: [] },
  status: { type: String, enum: ['pending', 'connected', 'completed'], default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('Match', matchSchema);
