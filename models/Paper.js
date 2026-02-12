const mongoose = require('mongoose');

const PaperSchema = new mongoose.Schema({
    // --- Core Identifiers ---
    courseCode: { type: String, required: true },
    courseTitle: { type: String, required: true },
    department: { type: String, required: true },
    level: { type: String, required: true },
    
    // ✅ CRITICAL FIX: 'year' is required
    year: { type: String, required: true }, 
    
    semester: { type: String, required: true }, // 'First' or 'Second'
    
    // --- File Content ---
    type: { type: String }, // 'pdf' or 'image'

    // ✅ FIX 1: THE MISSING LINK! (Multi-Page Array)
    fileUrls: { type: [String], default: [] }, 

    // Legacy Support (Single File)
    fileData: { type: String }, 
    fileUrl: { type: String },
    
    // --- Typed Questions ---
    instructions: String,
    
    // ✅ FIX 2: Crash-Proof Sections (Mixed Type)
    sections: { type: mongoose.Schema.Types.Mixed },

    // --- Metadata ---
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now },

    // (Optional Legacy Fields)
    imagePaths: [String], 
    documents: [{
        name: String,
        type: String,
        data: String
    }]
});

module.exports = mongoose.model('Paper', PaperSchema);