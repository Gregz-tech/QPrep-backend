require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // 🔑 NEW SECURITY TOOL
const User = require('./models/User');

const app = express();

// MIDDLEWARE
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// SECRET KEY (In production, put this in .env file)
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_academic_key_123";

// ==========================================
// 1. DATABASE
// ==========================================
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ DB Error:", err));

// ==========================================
// 2. SECURITY MIDDLEWARE (The Gatekeepers)
// ==========================================

// Gatekeeper 1: "Are you logged in?"
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: "No token provided" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Unauthorized" });
        req.user = decoded; // Attach user ID/Role to the request
        next();
    });
};

// Gatekeeper 2: "Are you an Admin or Moderator?"
const requireStaff = (req, res, next) => {
    if (req.user.role === 'student') {
        return res.status(403).json({ error: "Access denied. Students cannot perform this action." });
    }
    next();
};

// ==========================================
// 3. AUTH ROUTES
// ==========================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, institution, department, level, password } = req.body;
        // Validation...
        if (!username || !email || !institution || !department || !level || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }
        
        const existingUser = await User.findOne({ $or: [{email}, {username}] });
        if (existingUser) return res.status(400).json({ error: "User exists" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username, email, institution, department, level, 
            password: hashedPassword,
            role: 'student' // Always default to student
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

        // 🔑 GENERATE TOKEN
        const token = jwt.sign(
            { id: user._id, role: user.role, scope: user.moderatorScope }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // ✅ THE FIX: Send BOTH "dept" and "department"
        res.json({
            token, 
            user: {
                _id: user._id,
                username: user.username,
                role: user.role,
                scope: user.moderatorScope,
                
                // 1. The Official Name
                department: user.department,
                
                // 2. The Frontend Name (This fixes the "undefined")
                dept: user.department, 
                
                level: user.level,
                institution: user.institution
            }
        });

    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

// ==========================================
// 4. SUPER ADMIN ROUTES (Promote Users)
// ==========================================
app.post('/api/admin/promote', verifyToken, async (req, res) => {
    // Only Super Admin can do this
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: "Only Super Admin can promote users" });
    }

    const { username, institution, department, level } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: "User not found" });

        user.role = 'moderator';
        user.moderatorScope = { institution, department, level };
        await user.save();

        res.json({ message: `${username} is now a Moderator for ${department} (${level}L)` });
    } catch (err) {
        res.status(500).json({ error: "Promotion Failed" });
    }
});

// ==========================================
// 5. PAPER ROUTES (With Strict Rules)
// ==========================================

const PaperSchema = new mongoose.Schema({
    courseCode: String,
    courseTitle: String,
    department: String,
    level: String,
    year: String,
    semester: String,
    type: String,
    fileData: String,
    uploadedBy: String, // Store who uploaded it
    uploadedAt: { type: Date, default: Date.now }
});
const Paper = mongoose.model('Paper', PaperSchema);

// 1. GET DASHBOARD LIST (LIGHTWEIGHT) ⚡
// This excludes the heavy 'fileData' field using .select('-fileData')
app.get('/api/papers', async (req, res) => {
    try {
        const { department, level } = req.query;
        let query = {};
        
        // Filter by context if provided
        if (department) query.department = department;
        if (level) query.level = level;

        // .select('-fileData') means: "Give me everything EXCEPT the heavy file"
        const papers = await Paper.find(query).select('-fileData').sort({ createdAt: -1 });
        res.json(papers);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch list" });
    }
});

// 2. GET SINGLE PAPER FILE (HEAVY) 📦
// We only call this when the user CLICKS a specific card
app.get('/api/papers/:id', async (req, res) => {
    try {
        const paper = await Paper.findById(req.params.id);
        if (!paper) return res.status(404).json({ error: "Paper not found" });
        res.json(paper); // This includes the fileData
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch file" });
    }
});

// 🛡️ SECURE UPLOAD ROUTE (With Multi-Department Support)
app.post('/api/papers', verifyToken, requireStaff, async (req, res) => {
    try {
        // We now expect 'departments' to be an Array (e.g., ["ITH", "NUR"])
        // If it's just a string, we turn it into an array of one.
        let { departments, level, courseCode, courseTitle, semester, fileData } = req.body;
        const u = req.user; 

        // 1. Normalize Input (Ensure it's always an array)
        if (!Array.isArray(departments)) {
            departments = [departments];
        }

        // 2. Permission Loop
        // We check every single department requested.
        // If you are a Moderator, you can ONLY upload for your own dept.
        if (u.role === 'moderator') {
            for (const dept of departments) {
                if (u.scope.department !== dept) {
                    return res.status(403).json({ 
                        error: `Restriction: You cannot upload for ${dept}. Only ${u.scope.department}.` 
                    });
                }
            }
        }

        // 3. The "Broadcast" Loop
        // We create a database entry for EACH selected department
        const savePromises = departments.map(dept => {
            return new Paper({
                courseCode,
                courseTitle,
                level,
                semester,
                fileData,
                department: dept, // Save specifically for this dept
                uploadedBy: u.username
            }).save();
        });

        // Wait for all to finish
        await Promise.all(savePromises);

        res.status(201).json({ message: `Success! Paper uploaded to ${departments.length} department(s).` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Upload Failed" });
    }
});

app.delete('/api/papers/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: "Only Super Admin can delete papers" });
    }
    await Paper.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));