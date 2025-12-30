require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// --- IMPORTS ---
const Paper = require('./models/Paper');
const User = require('./models/User'); 

const app = express();

// --- MIDDLEWARE ---
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors()); 

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connected to QPrep Database"))
    .catch(err => console.error("❌ Database Connection Error:", err));


// ==========================================
// 1. PAPER ROUTES (Dashboard)
// ==========================================

// ✅ GET ALL PAPERS (Fixed: Filters out "Garbage Data")
app.get('/api/papers', async (req, res) => {
    try {
        // 1. DATABASE FILTER: Only fetch papers with a valid department
        // We strictly exclude "Select", null, or missing departments
        const papers = await Paper.find({
            department: { $exists: true, $ne: "Select", $ne: "" } 
        }).sort({ createdAt: -1 });

        res.json(papers);
    } catch (err) {
        console.error("GET Error:", err); // Log the real error to the server console
        res.status(500).json({ error: "Failed to fetch papers" });
    }
});

// SAVE NEW PAPER
app.post('/api/papers', async (req, res) => {
    try {
        const newPaper = new Paper(req.body);
        const savedPaper = await newPaper.save();
        res.status(201).json(savedPaper);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE PAPER
app.delete('/api/papers/:id', async (req, res) => {
    try {
        await Paper.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});


// ==========================================
// 2. AUTHENTICATION ROUTES (Login/Register)
// ==========================================

// REGISTER
app.post('/api/auth/register', async (req, res) => {
    try {
        const { firstName, lastName, username, matricNumber, email, department, level, password, role } = req.body;

        const existing = await User.findOne({ 
            $or: [{ username }, { email }, { matricNumber }] 
        });
        if (existing) return res.status(400).json({ error: "User already exists with that Username, Email, or Matric Number" });

        const newUser = new User({ firstName, lastName, username, matricNumber, email, department, level, password, role });
        await newUser.save();
        
        res.status(201).json({ message: "Registration successful! Please sign in." });
    } catch (err) {
        console.error("Registration Error:", err);
        res.status(500).json({ error: "Error registering user. Please check your inputs." });
    }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { identifier, password, department, level } = req.body;

        const user = await User.findOne({
            $or: [
                { username: identifier },
                { email: identifier.toLowerCase() },
                { matricNumber: identifier }
            ]
        });

        if (!user || user.password !== password) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        if (user.role === 'student' && (user.department !== department || user.level !== level)) {
             return res.status(400).json({ error: `Our records show you belong to ${user.department} ${user.level}L. Please use those details.` });
        }

        res.json({
            id: user._id,
            username: user.username,
            firstName: user.firstName,
            role: user.role,
            dept: user.department,
            level: user.level
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Server error during login" });
    }
});


// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 10000; 
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));