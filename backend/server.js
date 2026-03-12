// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());

// JWT Secret (add to .env: JWT_SECRET=your_secret_key)
const JWT_SECRET = process.env.JWT_SECRET || 'taskmanager_secret_key_2024';

// Auth Middleware
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token invalid' });
    }
};

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/taskmanager')
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Create Task Schema
const taskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['work', 'personal', 'urgent', 'later'],
        default: 'personal'
    },
    tags: [{
        type: String
    }],
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    dueDate: {
        type: Date
    },
    completed: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Task = mongoose.model('Task', taskSchema);

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'User already exists' });
        
        user = new User({ email, password });
        await user.save();
        
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: user._id, email: user.email } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: user._id, email: user.email } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// API Routes - Protected
app.get('/api/tasks', async (req, res) => {
    try {
        const { filter, search, sort, category } = req.query;
        let query = {};
        
        if (filter === 'active') query.completed = false;
        if (filter === 'completed') query.completed = true;
        if (search) query.title = { $regex: search, $options: 'i' };
        if (category) query.category = category;
        
        let sortOptions = { createdAt: -1 };
        if (sort === 'dueDate') sortOptions.dueDate = 1;
        if (sort === 'priority') sortOptions.priority = 1;
        if (sort === 'alpha') sortOptions.title = 1;
        
        const tasks = await Task.find(query).sort(sortOptions);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET stats
app.get('/api/stats', async (req, res) => {
    try {
        const total = await Task.countDocuments();
        const completed = await Task.countDocuments({ completed: true });
        const byPriority = await Task.aggregate([
            { $group: { _id: '$priority', count: { $sum: 1 } } }
        ]);
        res.json({ total, completed, progress: Math.round((completed/total)*100) || 0, byPriority });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST create new task
app.post('/api/tasks', async (req, res) => {
    try {
        const { title, priority, dueDate, category } = req.body;
        if (!title) {
            return res.status(400).json({ message: 'Title is required' });
        }
        
        const task = new Task({
            title,
            priority: priority || 'medium',
            dueDate: dueDate || null,
            category: category || 'personal'
        });
        
        const savedTask = await task.save();
        res.status(201).json(savedTask);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE task
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT toggle complete
app.put('/api/tasks/:id/toggle', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        
        task.completed = !task.completed;
        const updatedTask = await task.save();
        res.json(updatedTask);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT edit task details
app.put('/api/tasks/:id', async (req, res) => {
    try {
        const { title, priority, dueDate, category } = req.body;
        const task = await Task.findByIdAndUpdate(
            req.params.id,
            { title, priority, dueDate, category },
            { new: true, runValidators: true }
        );
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.json(task);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
