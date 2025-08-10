const express = require('express');
const Joi = require('joi');
const database = require('../database/database');

const router = express.Router();

// Validation schemas
const emotionSchema = Joi.object({
    sessionId: Joi.number().integer().required(),
    emotionType: Joi.string().valid(
        'happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted', 'neutral'
    ).required(),
    confidenceScore: Joi.number().min(0).max(1).required(),
    faceCoordinates: Joi.object().optional(),
    ageEstimate: Joi.number().integer().min(0).max(120).optional(),
    genderEstimate: Joi.string().valid('male', 'female').optional(),
    imageId: Joi.number().integer().optional(),
    processingTimeMs: Joi.number().integer().min(0).optional(),
    rawData: Joi.object().optional()
});

const querySchema = Joi.object({
    sessionId: Joi.number().integer().optional(),
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    emotionType: Joi.string().optional()
});

// Create new emotion detection record
router.post('/', async (req, res) => {
    try {
        const { error } = emotionSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const {
            sessionId,
            emotionType,
            confidenceScore,
            faceCoordinates,
            ageEstimate,
            genderEstimate,
            imageId,
            processingTimeMs,
            rawData
        } = req.body;

        // Verify session exists
        const session = await database.get(
            'SELECT id FROM sessions WHERE id = ?',
            [sessionId]
        );
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Create emotion record
        const result = await database.createEmotion({
            sessionId,
            emotionType,
            confidenceScore,
            faceCoordinates: JSON.stringify(faceCoordinates),
            ageEstimate,
            genderEstimate,
            imageId,
            processingTimeMs,
            rawData: JSON.stringify(rawData)
        });

        // Update session detection count
        await database.run(
            'UPDATE sessions SET total_detections = total_detections + 1 WHERE id = ?',
            [sessionId]
        );

        res.status(201).json({
            message: 'Emotion detection recorded successfully',
            emotionId: result.lastID,
            data: {
                id: result.lastID,
                sessionId,
                emotionType,
                confidenceScore,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Create emotion error:', error);
        res.status(500).json({ error: 'Failed to record emotion detection' });
    }
});

// Get emotions by session
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { error } = querySchema.validate(req.query);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const sessionId = parseInt(req.params.sessionId);
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        // Verify session exists
        const session = await database.get(
            'SELECT id FROM sessions WHERE id = ?',
            [sessionId]
        );
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const emotions = await database.getEmotionsBySession(sessionId, limit, offset);

        res.json({
            emotions,
            pagination: {
                limit,
                offset,
                total: emotions.length
            }
        });

    } catch (error) {
        console.error('Get emotions by session error:', error);
        res.status(500).json({ error: 'Failed to retrieve emotions' });
    }
});

// Get emotion summary for a session
router.get('/summary/session/:sessionId', async (req, res) => {
    try {
        const sessionId = parseInt(req.params.sessionId);

        // Verify session exists
        const session = await database.get(
            'SELECT id FROM sessions WHERE id = ?',
            [sessionId]
        );
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const summary = await database.getEmotionSummary(sessionId);

        res.json({
            summary,
            sessionId
        });

    } catch (error) {
        console.error('Get emotion summary error:', error);
        res.status(500).json({ error: 'Failed to retrieve emotion summary' });
    }
});

// Get emotions by user
router.get('/user/:userId', async (req, res) => {
    try {
        const { error } = querySchema.validate(req.query);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const userId = parseInt(req.params.userId);
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const emotionType = req.query.emotionType;

        let sql = `
            SELECT e.*, s.session_name, s.start_time as session_start
            FROM emotions e
            JOIN sessions s ON e.session_id = s.id
            WHERE s.user_id = ?
        `;
        
        const params = [userId];

        if (startDate) {
            sql += ' AND DATE(e.timestamp) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            sql += ' AND DATE(e.timestamp) <= ?';
            params.push(endDate);
        }

        if (emotionType) {
            sql += ' AND e.emotion_type = ?';
            params.push(emotionType);
        }

        sql += ' ORDER BY e.timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const emotions = await database.all(sql, params);

        res.json({
            emotions,
            pagination: {
                limit,
                offset,
                total: emotions.length
            }
        });

    } catch (error) {
        console.error('Get emotions by user error:', error);
        res.status(500).json({ error: 'Failed to retrieve emotions' });
    }
});

// Get emotion statistics
router.get('/stats', async (req, res) => {
    try {
        const { startDate, endDate, userId } = req.query;

        let sql = `
            SELECT 
                emotion_type,
                COUNT(*) as count,
                AVG(confidence_score) as avg_confidence,
                MIN(confidence_score) as min_confidence,
                MAX(confidence_score) as max_confidence,
                COUNT(DISTINCT session_id) as unique_sessions
            FROM emotions e
            JOIN sessions s ON e.session_id = s.id
            WHERE 1=1
        `;
        
        const params = [];

        if (userId) {
            sql += ' AND s.user_id = ?';
            params.push(parseInt(userId));
        }

        if (startDate) {
            sql += ' AND DATE(e.timestamp) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            sql += ' AND DATE(e.timestamp) <= ?';
            params.push(endDate);
        }

        sql += ' GROUP BY emotion_type ORDER BY count DESC';

        const stats = await database.all(sql, params);

        res.json({
            stats,
            filters: {
                userId: userId || null,
                startDate: startDate || null,
                endDate: endDate || null
            }
        });

    } catch (error) {
        console.error('Get emotion stats error:', error);
        res.status(500).json({ error: 'Failed to retrieve emotion statistics' });
    }
});

// Get real-time emotion data (last N detections)
router.get('/realtime', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);

        const emotions = await database.all(
            `SELECT e.*, s.session_name, u.username 
             FROM emotions e
             JOIN sessions s ON e.session_id = s.id
             JOIN users u ON s.user_id = u.id
             ORDER BY e.timestamp DESC 
             LIMIT ?`,
            [limit]
        );

        res.json({
            emotions,
            count: emotions.length
        });

    } catch (error) {
        console.error('Get real-time emotions error:', error);
        res.status(500).json({ error: 'Failed to retrieve real-time emotions' });
    }
});

// Delete emotion record
router.delete('/:id', async (req, res) => {
    try {
        const emotionId = parseInt(req.params.id);

        // Check if emotion exists
        const emotion = await database.get(
            'SELECT id, session_id FROM emotions WHERE id = ?',
            [emotionId]
        );

        if (!emotion) {
            return res.status(404).json({ error: 'Emotion not found' });
        }

        // Delete emotion
        await database.run(
            'DELETE FROM emotions WHERE id = ?',
            [emotionId]
        );

        // Update session detection count
        await database.run(
            'UPDATE sessions SET total_detections = total_detections - 1 WHERE id = ?',
            [emotion.session_id]
        );

        res.json({ message: 'Emotion deleted successfully' });

    } catch (error) {
        console.error('Delete emotion error:', error);
        res.status(500).json({ error: 'Failed to delete emotion' });
    }
});

module.exports = router;
