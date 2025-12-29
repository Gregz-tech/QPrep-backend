require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// --- IMPORTS ---
const Paper = require('./models/Paper');
const User = require('./models/User'); // The new User model for Auth

const app = express();

// --- MIDDLEWARE ---
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Allows large PDF uploads

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connected to QPrep Database"))
    .catch(err => console.error("❌ Database Connection Error:", err));


// ==========================================
// 1. PAPER ROUTES (Dashboard)
// ==========================================

// GET ALL PAPERS
app.get('/api/papers', async (req, res) => {
    try {
        const papers = await Paper.find().sort({ createdAt: -1 });
        res.json(papers);
    } catch (err) {
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
        // Destructure all needed fields from body
        const { firstName, lastName, username, matricNumber, email, department, level, password, role } = req.body;

        // Basic check if user exists (by username, email, or matric)
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

        // 1. Find user by Username OR Email OR Matric Number
        const user = await User.findOne({
            $or: [
                { username: identifier },
                { email: identifier.toLowerCase() },
                { matricNumber: identifier }
            ]
        });

        // 2. Basic Credential Check
        if (!user || user.password !== password) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        // 3. Context Check (Verify department/level match)
        if (user.role === 'student' && (user.department !== department || user.level !== level)) {
             return res.status(400).json({ error: `Our records show you belong to ${user.department} ${user.level}L. Please use those details.` });
        }

        // 4. Success: Return safe user data
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
// START SERVER (Always at the bottom)
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));