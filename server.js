require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // 🔐 ENCRYPTION TOOL

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// ==========================================
// 1. DATABASE CONNECTION
// ==========================================
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ DB Error:", err));

// ==========================================
// 2. NEW USER SCHEMA
// ==========================================
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    institution: { type: String, required: true }, // New Field
    department: { type: String, required: true },
    level: { type: String, required: true },       // Kept as requested
    password: { type: String, required: true },    // Will be Hashed
    role: { type: String, default: 'student' },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// PAPER SCHEMA (Unchanged)
const PaperSchema = new mongoose.Schema({
    courseCode: String,
    courseTitle: String,
    department: String,
    level: String,
    year: String,
    semester: String,
    type: String,
    fileData: String,
    uploadedAt: { type: Date, default: Date.now }
});
const Paper = mongoose.model('Paper', PaperSchema);

// ==========================================
// 3. AUTHENTICATION ROUTES
// ==========================================

// REGISTER
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, institution, department, level, password } = req.body;

        // Validation
        if (!username || !email || !institution || !department || !level || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Check Duplicates
        const existingUser = await User.findOne({ $or: [{email}, {username}] });
        if (existingUser) return res.status(400).json({ error: "Username or Email already exists" });

        // 🔐 ENCRYPT PASSWORD
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Save User
        const newUser = new User({
            username, 
            email, 
            institution, 
            department,
            level,
            password: hashedPassword 
        });

        await newUser.save();
        res.status(201).json({ message: "User registered successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { identifier, password } = req.body; // identifier = username OR email

        // Find user by Username OR Email
        const user = await User.findOne({ 
            $or: [{ username: identifier }, { email: identifier }] 
        });

        if (!user) return res.status(400).json({ error: "User not found" });

        // 🔐 VERIFY PASSWORD
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid Credentials" });

        // Send back Safe Data
        res.json({
            _id: user._id,
            username: user.username,
            dept: user.department,
            level: user.level,
            institution: user.institution,
            role: user.role
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

// ==========================================
// 4. PAPER ROUTES (Unchanged)
// ==========================================
app.get('/api/papers', async (req, res) => {
    try {
        const papers = await Paper.find();
        res.json(papers);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch papers" });
    }
});

app.post('/api/papers', async (req, res) => {
    try {
        const newPaper = new Paper(req.body);
        await newPaper.save();
        res.status(201).json({ message: "Paper Uploaded" });
    } catch (err) {
        res.status(500).json({ error: "Upload Failed" });
    }
});

app.delete('/api/papers/:id', async (req, res) => {
    try {
        await Paper.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: "Delete Failed" });
    }
});

// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));