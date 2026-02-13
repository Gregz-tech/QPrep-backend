require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();

// ==========================================
// 1. MIDDLEWARE
// ==========================================
app.use(express.json());
app.use(cors());

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_academic_key_123";
const PORT = process.env.PORT || 5000;

// ==========================================
// 2. CLOUDINARY CONFIGURATION ☁️
// ==========================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'QPrep_Repository',
        allowed_formats: ['jpg', 'png', 'pdf', 'jpeg'],
        resource_type: 'auto'
    }
});

const upload = multer({ storage: storage });

// ==========================================
// 3. DATABASE CONNECTION
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.log("❌ DB Error:", err));

// ==========================================
// 4. SCHEMAS (DEFINED LOCALLY TO PREVENT CONFLICTS) 🛡️
// ==========================================

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    institution: String,
    department: String,
    level: String,
    role: { type: String, default: 'student' },
    moderatorScope: {
        institution: String,
        department: String,
        level: String
    }
});
const User = mongoose.model('User', UserSchema);

// ✅ THE CORRECT PAPER SCHEMA (Defined right here!)
const PaperSchema = new mongoose.Schema({
    courseCode: { type: String, required: true },
    courseTitle: { type: String, required: true },
    department: { type: String, required: true },
    level: { type: String, required: true },
    year: { type: String, required: true }, 
    semester: { type: String, required: true },
    type: { type: String }, 
    
    // ✅ FIX: Multi-Page Support (Explicitly defined here)
    fileUrls: { type: [String], default: [] }, 

    // Legacy Support
    fileUrl: { type: String },  
    fileData: { type: String }, 
    
    instructions: String,
    sections: { type: mongoose.Schema.Types.Mixed }, // Crash-proof

    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now }
});
// Check if model exists before compiling (prevents OverwriteModelError)
const Paper = mongoose.models.Paper || mongoose.model('Paper', PaperSchema);

// ==========================================
// 5. SECURITY MIDDLEWARE
// ==========================================

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: "No token provided" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Unauthorized" });
        req.user = decoded;
        next();
    });
};

const requireStaff = (req, res, next) => {
    if (req.user.role === 'student') return res.status(403).json({ error: "Access denied. Staff only." });
    next();
};

const requireSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: "Access denied. Super Admin only." });
    next();
};

// ==========================================
// 6. ROUTES
// ==========================================

// AUTH
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, institution, department, level, password } = req.body;
        const existingUser = await User.findOne({ $or: [{email}, {username}] });
        if (existingUser) return res.status(400).json({ error: "User already exists" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username, email, institution, department, level, 
            password: hashedPassword,
            role: 'student'
        });

        await newUser.save();
        res.status(201).json({ message: "Registered successfully" });
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
        if (!user) return res.status(400).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid Credentials" });

        const token = jwt.sign(
            { id: user._id, role: user.role, scope: user.moderatorScope }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.json({
            token, 
            user: {
                _id: user._id,
                username: user.username,
                role: user.role,
                department: user.department,
                dept: user.department,
                level: user.level,
                institution: user.institution
            }
        });
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

// PAPERS
app.get('/api/papers', async (req, res) => {
    try {
        const { department, level } = req.query;
        let query = {};
        if (department) query.department = department;
        if (level) query.level = level;
        
        const papers = await Paper.find(query).sort({ createdAt: -1 });
        res.json(papers);
    } catch (err) {
        console.error("Fetch Error:", err);
        res.status(500).json({ error: "Failed to fetch list" });
    }
});

app.get('/api/papers/:id', async (req, res) => {
    try {
        const paper = await Paper.findById(req.params.id);
        if (!paper) return res.status(404).json({ error: "Paper not found" });
        res.json(paper);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch file" });
    }
});

// ✅ UPLOAD ROUTE WITH DEBUGGING
app.post('/api/papers', verifyToken, requireStaff, upload.array('files', 12), async (req, res) => {
    try {
        let { departments, level, courseCode, courseTitle, year, semester, type, sections, instructions } = req.body;
        const u = req.user; 

        if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files uploaded" });
        
        // Department Parsing
        let deptArray = [];
        if (typeof departments === 'string') {
            deptArray = departments.includes(',') ? departments.split(',') : [departments];
        } else if (Array.isArray(departments)) {
            deptArray = departments;
        } else {
            deptArray = [departments];
        }

        // Section Parsing
        let parsedSections = [];
        if (sections) {
            try {
                parsedSections = typeof sections === 'string' ? JSON.parse(sections) : sections;
            } catch (e) {
                console.error("Error parsing sections:", e);
                parsedSections = [];
            }
        }

        const cloudUrls = req.files.map(file => file.path);
        
        // --- DEBUGGING LOG ---
        console.log("Saving Paper with URLs:", cloudUrls);
        // ---------------------

        const savePromises = deptArray.map(dept => {
            return new Paper({
                courseCode,
                courseTitle,
                level,
                year,
                semester,
                type: type || 'image',
                fileUrls: cloudUrls, // ✅ Saving the array
                // Legacy fields
                fileUrl: cloudUrls[0] || "", 
                fileData: "", 
                sections: parsedSections,
                instructions,
                department: dept.trim(),
                uploadedBy: u.username
            }).save();
        });

        await Promise.all(savePromises);
        res.status(201).json({ message: `Success! Uploaded ${req.files.length} pages.`, urls: cloudUrls });

    } catch (err) {
        console.error("Upload Error:", err);
        res.status(500).json({ error: "Upload Failed" });
    }
});

// BULK DELETE
app.delete('/api/papers/bulk-delete', verifyToken, requireStaff, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No papers selected" });
        const result = await Paper.deleteMany({ _id: { $in: ids } });
        res.json({ message: `Successfully deleted ${result.deletedCount} papers.` });
    } catch (err) {
        res.status(500).json({ error: "Bulk delete failed" });
    }
});

// DELETE SINGLE
app.delete('/api/papers/:id', verifyToken, requireStaff, async (req, res) => {
    try {
        await Paper.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

// UPDATE
app.patch('/api/papers/:id', verifyToken, requireStaff, async (req, res) => {
    try {
        const updatedPaper = await Paper.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
        if (!updatedPaper) return res.status(404).json({ error: "Paper not found" });
        res.json({ message: "Paper updated successfully", paper: updatedPaper });
    } catch (err) {
        res.status(500).json({ error: "Failed to update paper" });
    }
});

// SUPER ADMIN ROUTES
app.get('/api/super-admin/stats', async (req, res) => {
    try {
        const [totalUsers, totalStudents, totalAdmins, totalPapers] = await Promise.all([
            User.countDocuments({}), User.countDocuments({ role: 'student' }),
            User.countDocuments({ role: 'admin' }), Paper.countDocuments({})
        ]);
        res.json({ totalUsers, totalStudents, totalAdmins, totalPapers });
    } catch (error) { res.status(500).json({ error: "Error" }); }
});

app.get('/api/super-admin/users', verifyToken, requireSuperAdmin, async (req, res) => {
    try { const users = await User.find({}).select('-password').sort({ createdAt: -1 }); res.json(users); } 
    catch (err) { res.status(500).json({ error: "Error" }); }
});

app.patch('/api/super-admin/users/:id/role', verifyToken, requireSuperAdmin, async (req, res) => {
    try {
        if (req.params.id === req.user.id) return res.status(400).json({ error: "Cannot change own role." });
        await User.findByIdAndUpdate(req.params.id, { role: req.body.role });
        res.json({ message: "Role updated" });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.delete('/api/super-admin/users/:id', verifyToken, requireSuperAdmin, async (req, res) => {
    try {
        if (req.params.id === req.user.id) return res.status(400).json({ error: "Cannot delete self." });
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "User deleted" });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));