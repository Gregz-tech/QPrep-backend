const mongoose = require('mongoose');

const PaperSchema = new mongoose.Schema({
    courseCode: { type: String, required: true },
    courseTitle: { type: String, required: true },
    department: { type: String, required: true },
    level: { type: String, required: true },
    year: { type: String, required: true }, 
    semester: { type: String, required: true },
    type: { type: String }, 
    
    fileUrls: { type: [String], default: [] }, 

    fileUrl: { type: String },  
    fileData: { type: String }, 
    
    instructions: String,

    sections: { type: mongoose.Schema.Types.Mixed },

    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Paper', PaperSchema);