const mongoose = require('mongoose');

const swapSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  skillOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedSkill: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  offeredSkill: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'completed', 'rejected'], default: 'pending' },
  completedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Swap', swapSchema);
