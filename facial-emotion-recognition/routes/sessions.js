const express = require('express');
const Joi = require('joi');
const database = require('../database/database');

const router = express.Router();

// Validation schemas
const sessionSchema = Joi.object({
    sessionName: Joi.string().min(3).max(100).required(),
    deviceInfo: Joi.string().max(500).optional(),
    ipAddress: Joi.string().max(45).optional(),
    location: Joi.string().max(255).optional()
});

// Create new session
router.post('/', async (req, res) => {
    try {
        const { error } = sessionSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { sessionName, deviceInfo, ipAddress, location } = req.body;

        const result = await database.createSession({
            sessionName,
            deviceInfo,
            ipAddress,
            location
        });

        res.status(201).json({
            message: 'Session created successfully',
            session: {
                id: result.lastID,
                sessionName,
                deviceInfo,
                ipAddress,
                location
            }
        });

    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// Get all sessions
router.get('/', async (req, res) => {
    try {
        const sessions = await database.get(
            'SELECT * FROM sessions ORDER BY start_time DESC'
        );

        res.json({
            sessions
        });
    } catch (error) {
        console.error('Get sessions error:', error);
        res.status(500).json({ error: 'Failed to retrieve sessions' });
    }
});

// Get session by ID
router.get('/:id', async (req, res) => {
    try {
        const sessionId = parseInt(req.params.id);

        const session = await database.get(
            'SELECT * FROM sessions WHERE id = ?',
            [sessionId]
        );

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json({
            session
        });
    } catch (error) {
        console.error('Get session error:', error);
        res.status(404).json({ error: 'Session not found' });
    }
});

// Update session
router.put('/:id', async (req, res) => {
    try {
        const { error } = sessionSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { sessionName, deviceInfo, ipAddress, location } = req.body;

        const result = await database.run(
            'UPDATE sessions SET session_name = ?, device_info = ?, ip_address = ?, location = ? WHERE id = ?',
            [sessionName, deviceInfo, ipAddress, location, req.params.id]
        );

        res.json({
            message: 'Session updated successfully'
        });
    } catch (error) {
        console.error('Update session error:', error);
        res.status(500).json({ error: 'Failed to update session' });
    }
});

// Delete session
router.delete('/:id', async (req, res) => {
    try {
        const result = await database.run(
            'DELETE FROM sessions WHERE id = ?',
            [req.params.id]
        );

        res.json({ message: 'Session deleted successfully' });
    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// Get sessions by user
router.get('/user/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = parseInt(req.query.offset) || 0;

        const sessions = await database.all(
            'SELECT * FROM sessions WHERE user_id = ? ORDER BY start_time DESC LIMIT ? OFFSET ?',
            [userId, limit, offset]
        );

        res.json({
            sessions,
            pagination: {
                limit,
                offset,
                total: sessions.length
            }
        });
    } catch (error) {
        console.error('Get sessions by user error:', error);
        res.status(500).json({ error: 'Failed to retrieve sessions' });
    }
});

// End session
router.put('/:id/end', async (req, res) => {
    try {
        const sessionId = parseInt(req.params.id);
        const { endTime, duration, totalDetections, accuracy } = req.body;

        const result = await database.run(
            'UPDATE sessions SET end_time = ?, duration_seconds = ?, total_detections = ?, accuracy_score = ? WHERE id = ?',
            [endTime, duration, totalDetections, accuracy, sessionId]
        );

        res.json({ message: 'Session ended successfully' });
    } catch (error) {
        console.error('End session error:', error);
        res.status(500).json({ error: 'Failed to end session' });
    }
});

module.exports = router;
