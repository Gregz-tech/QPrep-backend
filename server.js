require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// ==========================================
// 1. MIDDLEWARE
// ==========================================
// Increased limit to 50mb to allow large PDF/Image uploads
app.use(express.json({ limit: '50mb' }));
app.use(cors());

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_academic_key_123";
const PORT = process.env.PORT || 5000;

// ==========================================
// 2. DATABASE CONNECTION
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.log("❌ DB Error:", err));

// ==========================================
// 3. SCHEMAS (The Data Blueprints)
// ==========================================

// --- User Schema ---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    institution: String,
    department: String,
    level: String,
    role: { type: String, default: 'student' }, // student, admin, super_admin
    moderatorScope: {
        institution: String,
        department: String,
        level: String
    }
});
const User = mongoose.model('User', UserSchema);

// --- Paper Schema ---
const PaperSchema = new mongoose.Schema({
    courseCode: { type: String, required: true },
    courseTitle: { type: String, required: true },
    department: { type: String, required: true },
    level: { type: String, required: true },
    year: { type: String, required: true }, 
    semester: { type: String, required: true },
    type: { type: String }, // 'pdf' or 'image'
    fileData: { type: String }, // Base64 string
    
    // Admin Typed Questions (Optional)
    instructions: String,
    sections: [{
        id: Number,
        title: String,
        questions: [{ text: String }]
    }],

    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now }
});
const Paper = mongoose.model('Paper', PaperSchema);

// ==========================================
// 4. SECURITY MIDDLEWARE
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
    // Allows admins, moderators, and super_admins. Blocks students.
    if (req.user.role === 'student') {
        return res.status(403).json({ error: "Access denied. Staff only." });
    }
    next();
};

const requireSuperAdmin = (req, res, next) => {
    // Strict check for system owner
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: "Access denied. Super Admin only." });
    }
    next();
};

// ==========================================
// 5. AUTH ROUTES
// ==========================================

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
                dept: user.department, // Send both formats to be safe
                level: user.level,
                institution: user.institution
            }
        });
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

// ==========================================
// 6. PAPER ROUTES (API)
// ==========================================

// A. GET LIST (Optimized - No heavy files)
app.get('/api/papers', async (req, res) => {
    try {
        const { department, level } = req.query;
        let query = {};
        if (department) query.department = department;
        if (level) query.level = level;

        // Exclude fileData to make the dashboard load fast
        const papers = await Paper.find(query).select('-fileData').sort({ createdAt: -1 });
        res.json(papers);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch list" });
    }
});

// B. GET SINGLE FILE (Called when clicking Year Dropdown)
app.get('/api/papers/:id', async (req, res) => {
    try {
        const paper = await Paper.findById(req.params.id);
        if (!paper) return res.status(404).json({ error: "Paper not found" });
        res.json(paper);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch file" });
    }
});

// C. UPLOAD PAPER (Broadcast Logic)
app.post('/api/papers', verifyToken, requireStaff, async (req, res) => {
    try {
        let { departments, level, courseCode, courseTitle, year, semester, fileData, type, sections, instructions } = req.body;
        const u = req.user; 

        // Validation
        if (!courseCode || !year || !semester) {
            return res.status(400).json({ error: "Missing required fields (Code, Year, or Semester)" });
        }

        if (!Array.isArray(departments)) departments = [departments];

        // Moderator Check
        if (u.role === 'moderator') {
            for (const dept of departments) {
                if (u.scope.department !== dept) {
                    return res.status(403).json({ error: `Restricted: You can only upload for ${u.scope.department}` });
                }
            }
        }

        // Save for each department
        const savePromises = departments.map(dept => {
            return new Paper({
                courseCode,
                courseTitle,
                level,
                year,
                semester,
                type: type || 'image',
                fileData,
                sections,
                instructions,
                department: dept,
                uploadedBy: u.username
            }).save();
        });

        await Promise.all(savePromises);
        res.status(201).json({ message: `Success! Broadcasted to ${departments.length} department(s).` });

    } catch (err) {
        console.error("Upload Error:", err);
        res.status(500).json({ error: "Upload Failed" });
    }
});

// D. DELETE PAPER
app.delete('/api/papers/:id', verifyToken, requireStaff, async (req, res) => {
    // Note: 'requireStaff' already blocks students, but we can add more logic here if needed
    await Paper.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
});

// ==========================================
// 7. SUPER ADMIN ROUTES 👑
// ==========================================

app.get('/api/super-admin/stats', async (req, res) => {
    // Ideally, add verifyToken here too to prevent public access
    // But since it is a GET request, we will rely on frontend hiding or add middleware
    try {
        const [
            totalUsers,
            totalStudents,
            totalAdmins,
            totalPapers,
            uniqueDepts
        ] = await Promise.all([
            User.countDocuments({}),
            User.countDocuments({ role: 'student' }),
            User.countDocuments({ role: 'admin' }),
            Paper.countDocuments({}),
            User.distinct('department')
        ]);

        res.json({
            totalUsers,
            totalStudents,
            totalAdmins,
            totalPapers,
            totalDepts: uniqueDepts.length
        });
    } catch (error) {
        console.error("Stats Error:", error);
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});


// A. GET ALL USERS (Real List)
app.get('/api/super-admin/users', verifyToken, requireSuperAdmin, async (req, res) => {
    try {
        // Fetch all users but hide their passwords
        const users = await User.find({}).select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// B. UPDATE USER ROLE (Promote/Demote)
app.patch('/api/super-admin/users/:id/role', verifyToken, requireSuperAdmin, async (req, res) => {
    try {
        const { role } = req.body; // e.g. "admin" or "student"
        
        // Prevent Super Admin from demoting themselves
        if (req.params.id === req.user.id) {
            return res.status(400).json({ error: "You cannot change your own role." });
        }

        await User.findByIdAndUpdate(req.params.id, { role });
        res.json({ message: `User role updated to ${role}` });
    } catch (err) {
        res.status(500).json({ error: "Failed to update role" });
    }
});

// C. DELETE USER
app.delete('/api/super-admin/users/:id', verifyToken, requireSuperAdmin, async (req, res) => {
    try {
        if (req.params.id === req.user.id) {
            return res.status(400).json({ error: "You cannot delete yourself." });
        }
        
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "User deleted permanently" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete user" });
    }
});
// ==========================================
// 8. START SERVER
// ==========================================
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));