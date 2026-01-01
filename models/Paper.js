const mongoose = require('mongoose');

const PaperSchema = new mongoose.Schema({
    // --- Core Identifiers ---
    courseCode: { type: String, required: true },
    courseTitle: { type: String, required: true },
    department: { type: String, required: true },
    level: { type: String, required: true },
    
    // ✅ CRITICAL FIX: 'year' is required to prevent "undefined" errors in the dropdown
    year: { type: String, required: true }, 
    
    semester: { type: String, required: true }, // 'First' or 'Second'
    
    // --- File Content ---
    type: { type: String }, // 'pdf' or 'image'
    fileData: { type: String }, // Stores the heavy Base64 string
    
    // --- Typed Questions (for Admin Builder) ---
    instructions: String,
    sections: [{
        id: Number,
        title: String,
        questions: [{ text: String }]
    }],

    // --- Metadata ---
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now },

    // (Optional Legacy Fields - kept for safety if you used them before)
    imagePaths: [String], 
    documents: [{
        name: String,
        type: String,
        data: String
    }]
});

module.exports = mongoose.model('Paper', PaperSchema);