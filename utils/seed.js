const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

async function seed() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set in environment. Copy .env.example to .env and set it.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  await User.deleteMany({});

  const users = [
    { name: 'Alice', email: 'alice@example.com', password: 'password123', skills: ['guitar', 'spanish'], phoneNumber: '+1234567890' },
    { name: 'Bob', email: 'bob@example.com', password: 'password123', skills: ['javascript', 'react'], phoneNumber: '+1987654321' },
    { name: 'Carol', email: 'carol@example.com', password: 'password123', skills: ['spanish', 'cooking'], phoneNumber: '+1122334455' }
  ];

  for (const u of users) {
    const hashed = require('bcryptjs').hashSync(u.password, 10);
    await new User({ ...u, password: hashed }).save();
  }

  console.log('Seed complete');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
