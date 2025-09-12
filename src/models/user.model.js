const { Schema, model } = require('mongoose');
const UserSchema = new Schema({
  name: String,
  email: { type: String, unique: true, index: true, required: true },
  passwordHash: { type: String },
  role: { type: String, enum: ['student','teacher','moderator','admin'], default: 'student' },
  status: { type: String, enum: ['active','blocked'], default: 'active' }
}, { timestamps: true });
module.exports = model('User', UserSchema);
