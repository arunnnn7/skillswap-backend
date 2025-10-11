const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  skillType: { type: String, enum: ['offered', 'wanted'], required: true },
  skillName: { type: String, required: true },
  category: { type: String, default: '' },
  proficiencyLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
  priorityLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  description: { type: String, default: '' },
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Skill', skillSchema);
