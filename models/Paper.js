const mongoose = require('mongoose');

const PaperSchema = new mongoose.Schema({
    courseCode: { type: String, required: true },
    courseTitle: { type: String, required: true },
    department: { type: String, required: true },
    level: { type: String, required: true },
    year: { type: String, required: true },
    semester: { type: String, required: true },
    instructions: String,
    
    // ✅ NEW: This matches your frontend logic exactly
    type: { type: String }, // 'pdf' or 'image'
    fileData: { type: String }, // Stores the Base64 string
    
    // STRUCTURE FOR TYPED QUESTIONS (Keep this, it's good!)
    sections: [{
        id: Number,
        title: String,
        questions: [{ text: String }]
    }],

    // (Optional: You can keep these for future use, or remove them)
    imagePaths: [String], 
    documents: [{
        name: String,
        type: String,
        data: String
    }],
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Paper', PaperSchema);