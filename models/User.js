// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: { type: String, unique: true },
  accessToken: String,
  refreshToken: String,
  email: { type: String, unique: true }
}, {
  collection: 'users'  // Specify your collection name here
});

module.exports = mongoose.model('User', userSchema);
