const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, 'emotion_recognition.db');
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    resolve();
                }
            });
        });
    }

    async initialize() {
        try {
            await this.connect();
            await this.createTables();
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    async createTables() {
        const fs = require('fs');
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        
        return new Promise((resolve, reject) => {
            this.db.exec(schema, (err) => {
                if (err) {
                    console.error('Error creating tables:', err);
                    reject(err);
                } else {
                    console.log('Database tables created successfully');
                    resolve();
                }
            });
        });
    }

    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Database connection closed');
                    resolve();
                }
            });
        });
    }

    // Helper methods for specific operations
    async createUser(userData) {
        const sql = `
            INSERT INTO users (username, email, password_hash, full_name)
            VALUES (?, ?, ?, ?)
        `;
        return this.run(sql, [
            userData.username,
            userData.email,
            userData.passwordHash,
            userData.fullName
        ]);
    }

    async findUserByEmail(email) {
        const sql = 'SELECT * FROM users WHERE email = ? AND is_active = 1';
        return this.get(sql, [email]);
    }

    async findUserByUsername(username) {
        const sql = 'SELECT * FROM users WHERE username = ? AND is_active = 1';
        return this.get(sql, [username]);
    }

    async createSession(sessionData) {
        const sql = `
            INSERT INTO sessions (user_id, session_name, device_info, ip_address, location)
            VALUES (?, ?, ?, ?, ?)
        `;
        return this.run(sql, [
            sessionData.userId,
            sessionData.sessionName,
            sessionData.deviceInfo,
            sessionData.ipAddress,
            sessionData.location
        ]);
    }

    async updateSessionEnd(sessionId, endTime, duration, totalDetections, accuracy) {
        const sql = `
            UPDATE sessions 
            SET end_time = ?, duration_seconds = ?, total_detections = ?, 
                accuracy_score = ?, is_completed = 1
            WHERE id = ?
        `;
        return this.run(sql, [endTime, duration, totalDetections, accuracy, sessionId]);
    }

    async createEmotion(emotionData) {
        const sql = `
            INSERT INTO emotions (
                session_id, emotion_type, confidence_score, face_coordinates,
                age_estimate, gender_estimate, image_id, processing_time_ms, raw_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        return this.run(sql, [
            emotionData.sessionId,
            emotionData.emotionType,
            emotionData.confidenceScore,
            JSON.stringify(emotionData.faceCoordinates),
            emotionData.ageEstimate,
            emotionData.genderEstimate,
            emotionData.imageId,
            emotionData.processingTime,
            JSON.stringify(emotionData.rawData)
        ]);
    }

    async getEmotionsBySession(sessionId, limit = 100, offset = 0) {
        const sql = `
            SELECT * FROM emotions 
            WHERE session_id = ? 
            ORDER BY timestamp DESC 
            LIMIT ? OFFSET ?
        `;
        return this.all(sql, [sessionId, limit, offset]);
    }

    async getEmotionSummary(sessionId) {
        const sql = `
            SELECT 
                emotion_type,
                COUNT(*) as count,
                AVG(confidence_score) as avg_confidence,
                MIN(timestamp) as first_detection,
                MAX(timestamp) as last_detection
            FROM emotions 
            WHERE session_id = ?
            GROUP BY emotion_type
            ORDER BY count DESC
        `;
        return this.all(sql, [sessionId]);
    }

    async getUserSessions(userId, limit = 20, offset = 0) {
        const sql = `
            SELECT * FROM sessions 
            WHERE user_id = ? 
            ORDER BY start_time DESC 
            LIMIT ? OFFSET ?
        `;
        return this.all(sql, [userId, limit, offset]);
    }

    async createImage(imageData) {
        const sql = `
            INSERT INTO images (
                user_id, session_id, filename, original_filename, file_path,
                file_size, mime_type, width, height, thumbnail_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        return this.run(sql, [
            imageData.userId,
            imageData.sessionId,
            imageData.filename,
            imageData.originalFilename,
            imageData.filePath,
            imageData.fileSize,
            imageData.mimeType,
            imageData.width,
            imageData.height,
            imageData.thumbnailPath
        ]);
    }

    async getImagesBySession(sessionId, limit = 50, offset = 0) {
        const sql = `
            SELECT * FROM images 
            WHERE session_id = ? 
            ORDER BY upload_timestamp DESC 
            LIMIT ? OFFSET ?
        `;
        return this.all(sql, [sessionId, limit, offset]);
    }

    async getUserAnalytics(userId, days = 30) {
        const sql = `
            SELECT 
                DATE(timestamp) as date,
                COUNT(*) as total_detections,
                AVG(confidence_score) as avg_confidence,
                emotion_type,
                COUNT(*) as emotion_count
            FROM emotions e
            JOIN sessions s ON e.session_id = s.id
            WHERE s.user_id = ? AND DATE(e.timestamp) >= DATE('now', '-${days} days')
            GROUP BY DATE(timestamp), emotion_type
            ORDER BY date DESC
        `;
        return this.all(sql, [userId]);
    }

    async getGlobalStats() {
        const sql = `
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM sessions) as total_sessions,
                (SELECT COUNT(*) FROM emotions) as total_detections,
                (SELECT AVG(confidence_score) FROM emotions) as avg_confidence,
                (SELECT COUNT(DISTINCT emotion_type) FROM emotions) as unique_emotions
        `;
        return this.get(sql);
    }
}

module.exports = new Database();
