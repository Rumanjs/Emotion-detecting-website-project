-- Facial Emotion Recognition Database Schema

-- Users table for authentication and user management
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    avatar_url VARCHAR(500),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    last_login DATETIME
);

-- Sessions table for tracking emotion detection sessions
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    session_name VARCHAR(255),
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    duration_seconds INTEGER,
    total_detections INTEGER DEFAULT 0,
    accuracy_score REAL,
    device_info VARCHAR(500),
    ip_address VARCHAR(45),
    location VARCHAR(255),
    is_completed BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Emotions table for storing individual emotion detection results
CREATE TABLE IF NOT EXISTS emotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    emotion_type VARCHAR(50) NOT NULL,
    confidence_score REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    face_coordinates TEXT, -- JSON string of bounding box
    age_estimate INTEGER,
    gender_estimate VARCHAR(10),
    image_id INTEGER,
    processing_time_ms INTEGER,
    raw_data TEXT, -- JSON string of raw face-api results
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE SET NULL
);

-- Images table for storing captured/uploaded images
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    session_id INTEGER,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(50),
    width INTEGER,
    height INTEGER,
    upload_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_processed BOOLEAN DEFAULT 0,
    processing_status VARCHAR(50) DEFAULT 'pending',
    metadata TEXT, -- JSON string for additional metadata
    thumbnail_path VARCHAR(500),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Analytics table for aggregated statistics
CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    session_id INTEGER,
    metric_type VARCHAR(50) NOT NULL,
    metric_value REAL NOT NULL,
    calculation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    time_period VARCHAR(50), -- daily, weekly, monthly
    additional_data TEXT, -- JSON string for context
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Emotion summary table for quick statistics
CREATE TABLE IF NOT EXISTS emotion_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    session_id INTEGER,
    emotion_type VARCHAR(50) NOT NULL,
    count INTEGER DEFAULT 0,
    average_confidence REAL,
    first_detected DATETIME,
    last_detected DATETIME,
    percentage_of_total REAL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE(user_id, session_id, emotion_type)
);

-- Settings table for user preferences
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    data_type VARCHAR(20) DEFAULT 'string',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, setting_key)
);

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    request_size INTEGER,
    response_size INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    error_message TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_emotions_session_id ON emotions(session_id);
CREATE INDEX IF NOT EXISTS idx_emotions_timestamp ON emotions(timestamp);
CREATE INDEX IF NOT EXISTS idx_emotions_type ON emotions(emotion_type);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id);
CREATE INDEX IF NOT EXISTS idx_images_session_id ON images(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_metric_type ON analytics(metric_type);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);

-- Triggers for automatic updates
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
    AFTER UPDATE ON users
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_sessions_duration
    AFTER UPDATE ON sessions
    FOR EACH ROW
    WHEN NEW.end_time IS NOT NULL AND OLD.end_time IS NULL
BEGIN
    UPDATE sessions 
    SET duration_seconds = (julianday(NEW.end_time) - julianday(NEW.start_time)) * 86400
    WHERE id = NEW.id;
END;

-- Views for common queries
CREATE VIEW IF NOT EXISTS user_emotion_stats AS
SELECT 
    u.id as user_id,
    u.username,
    e.emotion_type,
    COUNT(e.id) as detection_count,
    AVG(e.confidence_score) as avg_confidence,
    MIN(e.timestamp) as first_detection,
    MAX(e.timestamp) as last_detection
FROM users u
JOIN sessions s ON u.id = s.user_id
JOIN emotions e ON s.id = e.session_id
GROUP BY u.id, e.emotion_type;

CREATE VIEW IF NOT EXISTS daily_emotion_summary AS
SELECT 
    DATE(e.timestamp) as detection_date,
    e.emotion_type,
    COUNT(e.id) as count,
    AVG(e.confidence_score) as avg_confidence
FROM emotions e
GROUP BY DATE(e.timestamp), e.emotion_type
ORDER BY detection_date DESC, count DESC;
