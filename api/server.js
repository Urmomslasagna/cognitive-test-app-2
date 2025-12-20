// api/server.js - Fixed for Vercel Serverless with Proper Session Management
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============= MONGODB CONNECTION FOR SERVERLESS =============
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cognitive_tests';

// Set mongoose options for serverless
mongoose.set('strictQuery', false);

// Connection options optimized for serverless
const mongooseOptions = {
    bufferCommands: false,
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
};

// Global promise for connection
let isConnected = false;

const connectDB = async () => {
    if (isConnected) {
        console.log('=> Using existing database connection');
        return;
    }

    try {
        console.log('=> Creating new database connection...');
        const db = await mongoose.connect(MONGODB_URI, mongooseOptions);
        isConnected = db.connections[0].readyState === 1;
        console.log('=> Database connected');
    } catch (error) {
        console.error('Database connection error:', error);
        // Don't throw - let the app continue without DB
        isConnected = false;
    }
};

// ============= MODELS =============
const userSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    demographics: {
        ageRange: String,
        language: String,
        educationLevel: String
    },
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

const testResultSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true }, // Add index for faster queries
    testType: { 
        type: String, 
        required: true, 
        enum: ['memory', 'trail', 'fluency', 'attention', 'complete_battery'] 
    },
    language: { type: String, default: 'en' },
    scores: {
        raw: mongoose.Schema.Types.Mixed,
        normalized: Number,
        percentile: Number
    },
    testData: {
        responses: mongoose.Schema.Types.Mixed,
        timeTaken: Number,
        completionRate: Number
    },
    interpretation: {
        passed: Boolean,
        flagsForConcern: [String],
        recommendations: [String]
    },
    metadata: {
        testVersion: { type: String, default: '1.0' },
        browserInfo: String,
        screenSize: String
    },
    createdAt: { type: Date, default: Date.now }
});

// Create models only if they don't exist
const User = mongoose.models.User || mongoose.model('User', userSchema);
const TestResult = mongoose.models.TestResult || mongoose.model('TestResult', testResultSchema);

// ============= HELPER FUNCTIONS =============
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function generateToken(sessionId) {
    return jwt.sign(
        { sessionId }, 
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
    );
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        req.user = { sessionId: 'anonymous_' + Date.now() };
        return next();
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.user = decoded;
        next();
    } catch (err) {
        req.user = { sessionId: 'anonymous_' + Date.now() };
        next();
    }
}

// ============= SCORING ALGORITHMS =============
class CognitiveTestScorer {
    static scoreMemoryTest(recalled, original, language = 'en') {
        const wordLists = {
            en: ['apple', 'table', 'penny', 'garden', 'pencil', 'house', 'car', 'book', 'tree', 'shoe'],
            es: ['manzana', 'mesa', 'moneda', 'jardín', 'lápiz', 'casa', 'carro', 'libro', 'árbol', 'zapato'],
            zh: ['苹果', '桌子', '硬币', '花园', '铅笔', '房子', '汽车', '书', '树', '鞋子']
        };

        const targetWords = wordLists[language] || wordLists.en;
        const recalledWords = recalled.map(w => w.toLowerCase().trim());
        
        const correctRecalls = recalledWords.filter(w => 
            targetWords.some(target => target.toLowerCase() === w)
        ).length;
        
        const falsePositives = recalledWords.filter(w => 
            !targetWords.some(target => target.toLowerCase() === w)
        ).length;
        
        const score = {
            correct: correctRecalls,
            total: targetWords.length,
            falsePositives: falsePositives,
            percentage: (correctRecalls / targetWords.length) * 100,
            passed: correctRecalls >= 4
        };

        const interpretation = {
            passed: score.passed,
            flagsForConcern: [],
            recommendations: []
        };

        if (correctRecalls < 4) {
            interpretation.flagsForConcern.push('Below expected recall range');
            interpretation.recommendations.push('Consider comprehensive memory assessment');
        }
        
        if (falsePositives > 2) {
            interpretation.flagsForConcern.push('Elevated false positive responses');
            interpretation.recommendations.push('May indicate confusion or confabulation');
        }

        return { score, interpretation };
    }

    static scoreTrailTest(part, connections, errors, completed, timeTaken) {
        const norms = {
            'A': { mean: 31.78, sd: 9.93 },
            'B': { mean: 63.76, sd: 14.42 }
        };

        const norm = norms[part] || norms['A'];
        let score = 100;
        
        if (!completed) {
            score = 0;
        } else {
            const zScore = (timeTaken - norm.mean) / norm.sd;
            score = Math.max(0, Math.min(100, 75 - (zScore * 15)));
        }
        
        score -= errors * 5;
        score = Math.max(0, score);
        
        const passed = completed && score >= 50 && errors <= 3;
        
        const rawScore = {
            part: part,
            time: timeTaken,
            errors: errors,
            completed: completed,
            connectionsCount: connections ? connections.length : 0,
            score: Math.round(score)
        };

        const interpretation = {
            passed: passed,
            flagsForConcern: [],
            recommendations: []
        };

        if (!completed) {
            interpretation.flagsForConcern.push('Test not completed');
            interpretation.recommendations.push('May indicate significant processing difficulties');
        }
        
        if (errors > 3) {
            interpretation.flagsForConcern.push('Multiple errors made');
            interpretation.recommendations.push('May indicate attention or sequencing difficulties');
        }

        return { score: rawScore, interpretation };
    }

    static scoreFluencyTest(animals, timeInSeconds = 60) {
        const uniqueAnimals = [...new Set(animals.map(a => a.toLowerCase().trim()))];
        const validAnimals = uniqueAnimals.filter(a => a.length > 0);
        
        const score = {
            count: validAnimals.length,
            uniqueCount: validAnimals.length,
            averagePerMinute: (validAnimals.length / timeInSeconds) * 60,
            passed: validAnimals.length >= 11
        };

        const interpretation = {
            passed: score.passed,
            flagsForConcern: [],
            recommendations: []
        };

        if (validAnimals.length < 11) {
            interpretation.flagsForConcern.push('Below expected range for category fluency');
            interpretation.recommendations.push('May indicate word-finding difficulties');
        }

        return { score, interpretation };
    }
}

// ============= API ROUTES =============

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        mongodb: isConnected ? 'connected' : 'disconnected'
    });
});

// Session creation - FIXED to ensure proper session storage
app.post('/api/session/create', async (req, res) => {
    try {
        await connectDB();
        
        const sessionId = generateSessionId();
        const { demographics } = req.body || {};
        
        // Try to save to database
        if (isConnected) {
            try {
                // Check if session already exists
                const existingUser = await User.findOne({ sessionId });
                if (!existingUser) {
                    const user = new User({
                        sessionId,
                        demographics
                    });
                    await user.save();
                    console.log('New user created:', sessionId);
                }
            } catch (dbError) {
                console.error('DB save error (non-fatal):', dbError.message);
            }
        }
        
        const token = generateToken(sessionId);
        
        res.json({ 
            success: true, 
            sessionId,
            token,
            message: 'Session created successfully'
        });
        
    } catch (error) {
        console.error('Session create error:', error);
        // Still return a session even if DB fails
        const sessionId = generateSessionId();
        res.json({ 
            success: true,
            sessionId,
            token: generateToken(sessionId),
            warning: 'Session created without database'
        });
    }
});

// Submit test results - FIXED to ensure proper storage
app.post('/api/test/submit', authenticateToken, async (req, res) => {
    try {
        await connectDB();
        
        const { testType, responses, timeTaken, language, metadata } = req.body;
        const sessionId = req.user.sessionId;
        
        console.log('Submitting test for session:', sessionId);
        
        let scoringResult;
        let normalizedScore;
        
        switch(testType) {
            case 'memory':
                scoringResult = CognitiveTestScorer.scoreMemoryTest(
                    responses.recalled, 
                    responses.original, 
                    language
                );
                normalizedScore = scoringResult.score.percentage;
                break;
                
            case 'fluency':
                scoringResult = CognitiveTestScorer.scoreFluencyTest(
                    responses.animals, 
                    timeTaken
                );
                normalizedScore = Math.min(100, (scoringResult.score.count / 15) * 100);
                break;
                
            case 'trail':
                scoringResult = CognitiveTestScorer.scoreTrailTest(
                    responses.part,
                    responses.connections,
                    responses.errors,
                    responses.completed,
                    timeTaken
                );
                normalizedScore = scoringResult.score.score;
                break;
                
            default:
                throw new Error('Unknown test type');
        }
        
        const testResult = new TestResult({
            sessionId: sessionId,
            testType,
            language: language || 'en',
            scores: {
                raw: scoringResult.score,
                normalized: normalizedScore || 0,
                percentile: null
            },
            testData: {
                responses,
                timeTaken,
                completionRate: 100
            },
            interpretation: scoringResult.interpretation,
            metadata
        });
        
        if (isConnected) {
            await testResult.save();
            console.log('Test saved to database for session:', sessionId);
        }
        
        res.json({
            success: true,
            result: {
                score: scoringResult.score,
                interpretation: scoringResult.interpretation,
                testId: testResult._id,
                sessionId: sessionId
            }
        });
    } catch (error) {
        console.error('Test submit error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to save test',
            details: error.message
        });
    }
});

// Get test results - FIXED to properly retrieve by session
app.get('/api/test/results/:sessionId', authenticateToken, async (req, res) => {
    try {
        await connectDB();
        
        const sessionId = req.params.sessionId;
        console.log('Fetching results for session:', sessionId);
        
        if (!isConnected) {
            return res.json({
                success: true,
                results: [],
                message: 'Database not connected'
            });
        }
        
        const results = await TestResult.find({ 
            sessionId: sessionId 
        }).sort({ createdAt: -1 });
        
        console.log(`Found ${results.length} results for session ${sessionId}`);
        
        res.json({
            success: true,
            sessionId: sessionId,
            results: results.map(r => ({
                testId: r._id,
                testType: r.testType,
                scores: r.scores,
                interpretation: r.interpretation,
                date: r.createdAt
            }))
        });
    } catch (error) {
        console.error('Get results error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get results',
            details: error.message
        });
    }
});

// Get all results - for testing
app.get('/api/test/all-results', async (req, res) => {
    try {
        await connectDB();
        
        if (!isConnected) {
            return res.json({
                success: true,
                count: 0,
                results: [],
                message: 'Database not connected'
            });
        }
        
        const results = await TestResult.find()
            .sort({ createdAt: -1 })
            .limit(20);
            
        res.json({
            success: true,
            count: results.length,
            results: results.map(r => ({
                testType: r.testType,
                sessionId: r.sessionId,
                scores: r.scores,
                interpretation: r.interpretation,
                date: r.createdAt
            }))
        });
    } catch (error) {
        console.error('All results error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get all results',
            details: error.message
        });
    }
});

// Verify session endpoint
app.get('/api/session/verify/:sessionId', async (req, res) => {
    try {
        await connectDB();
        
        const sessionId = req.params.sessionId;
        
        if (isConnected) {
            const user = await User.findOne({ sessionId });
            const testCount = await TestResult.countDocuments({ sessionId });
            
            res.json({
                success: true,
                exists: !!user,
                sessionId: sessionId,
                testCount: testCount,
                created: user?.createdAt
            });
        } else {
            res.json({
                success: true,
                exists: false,
                sessionId: sessionId,
                testCount: 0,
                message: 'Database not connected'
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message
        });
    }
});

// Catch-all for undefined routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        error: 'API endpoint not found',
        path: req.originalUrl,
        method: req.method
    });
});

// Export for Vercel
module.exports = app;

// Local development server
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}