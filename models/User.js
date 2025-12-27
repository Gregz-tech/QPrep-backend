// qprep-backend/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // New Fields
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    matricNumber: { type: String, required: true, unique: true, sparse: true }, // Unique entry identifier
    email: { type: String, required: true, unique: true, lowercase: true }, // Good for password reset later

    // Existing Fields
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Remember to hash this in production!
    department: { type: String, required: true },
    level: { type: String, required: true }, // Stored level
    role: { type: String, enum: ['student', 'admin'], default: 'student' }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);