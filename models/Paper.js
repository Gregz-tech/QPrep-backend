const mongoose = require('mongoose');

const PaperSchema = new mongoose.Schema({
    courseCode: { type: String, required: true },
    courseTitle: { type: String, required: true },
    department: { type: String, required: true },
    level: { type: String, required: true },
    year: { type: String, required: true },
    semester: { type: String, required: true },
    instructions: String,
    
    // STRUCTURE FOR TYPED QUESTIONS
    sections: [{
        id: Number,
        title: String,
        questions: [{ text: String }]
    }],

    // STRUCTURE FOR FILES (Base64)
    imagePaths: [String], 
    documents: [{
        name: String,
        type: String,
        data: String
    }],
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Paper', PaperSchema);