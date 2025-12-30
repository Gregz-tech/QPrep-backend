const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // 1. IDENTITY
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    
    // 2. ACADEMIC CONTEXT (Their personal details)
    institution: { type: String, required: true },
    department: { type: String, required: true },
    level: { type: String, required: true },
    
    // 3. SECURITY & ROLE
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['student', 'moderator', 'superadmin'], 
        default: 'student' 
    },

    // 4. MODERATOR SCOPE (Only used if role == 'moderator')
    // This defines where they are allowed to upload
    moderatorScope: {
        institution: String,
        department: String,
        level: String
    }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);