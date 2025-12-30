const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // 1. IDENTITY
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    
    // 2. ACADEMIC CONTEXT
    institution: { type: String, required: true }, // ✅ NEW FIELD
    department: { type: String, required: true },
    level: { type: String, required: true },       // ✅ KEPT AS REQUESTED
    
    // 3. SECURITY & ROLE
    password: { type: String, required: true },    // Will be hashed
    role: { type: String, enum: ['student', 'admin'], default: 'student' }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);