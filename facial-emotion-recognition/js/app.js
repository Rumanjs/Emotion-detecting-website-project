// Main Application Controller
class EmotionApp {
    constructor() {
        this.video = document.getElementById('video');
        this.overlay = document.getElementById('overlay');
        this.canvas = this.overlay.getContext('2d');
        this.isDetecting = false;
        this.stream = null;
        this.modelsLoaded = false;
        this.emotionHistory = [];
        this.sessionStartTime = null;
        
        this.initializeElements();
        this.bindEvents();
        this.loadSettings();
    }

    initializeElements() {
        this.elements = {
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            captureBtn: document.getElementById('captureBtn'),
            emotionName: document.getElementById('emotionName'),
            emotionConfidence: document.getElementById('emotionConfidence'),
            emotionProgress: document.getElementById('emotionProgress'),
            emotionDescription: document.getElementById('emotionDescription'),
            emotionIcon: document.getElementById('emotionIcon'),
            faceIndicator: document.getElementById('faceIndicator'),
            totalDetections: document.getElementById('totalDetections'),
            sessionTime: document.getElementById('sessionTime'),
            themeToggle: document.getElementById('themeToggle'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsModal: document.getElementById('settingsModal'),
            closeSettings: document.getElementById('closeSettings'),
            sensitivitySlider: document.getElementById('sensitivitySlider'),
            sensitivityValue: document.getElementById('sensitivityValue'),
            uploadZone: document.getElementById('uploadZone'),
            fileInput: document.getElementById('fileInput'),
            previewImage: document.getElementById('previewImage'),
            uploadPreview: document.getElementById('uploadPreview'),
            uploadResults: document.getElementById('uploadResults')
        };
    }

    bindEvents() {
        this.elements.startBtn.addEventListener('click', () => this.startDetection());
        this.elements.stopBtn.addEventListener('click', () => this.stopDetection());
        this.elements.captureBtn.addEventListener('click', () => this.captureFrame());
        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.elements.settingsBtn.addEventListener('click', () => this.openSettings());
        this.elements.closeSettings.addEventListener('click', () => this.closeSettings());
        this.elements.sensitivitySlider.addEventListener('input', (e) => this.updateSensitivity(e));
        
        // Upload events
        this.elements.uploadZone.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        this.elements.uploadZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.elements.uploadZone.addEventListener('drop', (e) => this.handleDrop(e));
    }

    async loadModels() {
        const modelUrls = [
            'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights/',
            'https://unpkg.com/face-api.js@0.22.2/weights/',
            './models/'
        ];
        
        let lastError = null;
        
        for (const modelUrl of modelUrls) {
            try {
                console.log(`Attempting to load models from: ${modelUrl}`);
                
                // Check if it's a local path
                if (modelUrl.startsWith('./')) {
                    // Try local models first
                    await this.loadLocalModels();
                } else {
                    // Try CDN
                    await Promise.all([
                        faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
                        faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
                        faceapi.nets.faceExpressionNet.loadFromUri(modelUrl),
                        faceapi.nets.ageGenderNet.loadFromUri(modelUrl)
                    ]);
                }
                
                this.modelsLoaded = true;
                console.log('All models loaded successfully');
                return;
                
            } catch (error) {
                lastError = error;
                console.warn(`Failed to load from ${modelUrl}:`, error.message);
                
                // Check if it's a network error
                if (error.message.includes('network') || error.message.includes('fetch')) {
                    continue; // Try next URL
                } else {
                    break; // Stop on other errors
                }
            }
        }
        
        // All attempts failed
        console.error('All model loading attempts failed:', lastError);
        this.showDetailedError(lastError);
    }

    async loadLocalModels() {
        // Check if local models exist
        const localModelPath = './models/';
        const models = [
            'tiny_face_detector_model-weights_manifest.json',
            'face_landmark_68_model-weights_manifest.json',
            'face_expression_model-weights_manifest.json',
            'age_gender_model-weights_manifest.json'
        ];
        
        // Check if local models are available
        const modelChecks = await Promise.all(
            models.map(model => this.checkLocalModel(localModelPath + model))
        );
        
        if (modelChecks.every(check => check)) {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(localModelPath),
                faceapi.nets.faceLandmark68Net.loadFromUri(localModelPath),
                faceapi.nets.faceExpressionNet.loadFromUri(localModelPath),
                faceapi.nets.ageGenderNet.loadFromUri(localModelPath)
            ]);
        } else {
            throw new Error('Local models not found');
        }
    }

    async checkLocalModel(path) {
        try {
            const response = await fetch(path, { method: 'HEAD' });
            return response.ok;
        } catch {
            return false;
        }
    }

    showDetailedError(error) {
        let message = 'Failed to load AI models. ';
        
        if (error.message.includes('network') || error.message.includes('fetch')) {
            message += 'Please check your internet connection or try refreshing the page.';
        } else if (error.message.includes('404')) {
            message += 'Model files not found. Please contact support.';
        } else {
            message += 'An unexpected error occurred. Please try again later.';
        }
        
        this.showError(message);
    }

    async startDetection() {
        if (!this.modelsLoaded) {
            await this.loadModels();
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                } 
            });
            
            this.video.srcObject = this.stream;
            this.video.onloadedmetadata = () => {
                this.video.play();
                this.startEmotionDetection();
                this.sessionStartTime = Date.now();
                this.updateSessionTime();
                this.elements.startBtn.disabled = true;
                this.elements.stopBtn.disabled = false;
                this.elements.captureBtn.disabled = false;
            };
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.showError('Could not access camera. Please check permissions.');
        }
    }

    stopDetection() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.isDetecting = false;
        this.canvas.clearRect(0, 0, this.overlay.width, this.overlay.height);
        this.elements.startBtn.disabled = false;
        this.elements.stopBtn.disabled = true;
        this.elements.captureBtn.disabled = true;
        this.elements.faceIndicator.style.display = 'flex';
    }

    startEmotionDetection() {
        this.isDetecting = true;
        this.elements.faceIndicator.style.display = 'none';
        this.detectEmotions();
    }

    async detectEmotions() {
        if (!this.isDetecting) return;

        const displaySize = {
            width: this.video.videoWidth || this.video.width,
            height: this.video.videoHeight || this.video.height
        };

        faceapi.matchDimensions(this.overlay, displaySize);

        const detections = await faceapi
            .detectAllFaces(this.video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceExpressions()
            .withAgeAndGender();

        this.canvas.clearRect(0, 0, this.overlay.width, this.overlay.height);

        if (detections.length > 0) {
            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            
            // Draw face detection
            faceapi.draw.drawDetections(this.overlay, resizedDetections);
            faceapi.draw.drawFaceLandmarks(this.overlay, resizedDetections);

            // Process first face
            const detection = resizedDetections[0];
            const expressions = detection.expressions;
            const maxEmotion = Object.entries(expressions).reduce((max, curr) => 
                curr[1] > max[1] ? curr : max
            );

            this.updateEmotionDisplay(maxEmotion, detection);
            this.saveEmotionData(maxEmotion[0], maxEmotion[1]);
        }

        requestAnimationFrame(() => this.detectEmotions());
    }

    updateEmotionDisplay(emotion, detection) {
        const [emotionName, confidence] = emotion;
        const percentage = Math.round(confidence * 100);
        
        this.elements.emotionName.textContent = emotionName.charAt(0).toUpperCase() + emotionName.slice(1);
        this.elements.emotionConfidence.textContent = `${percentage}%`;
        this.elements.emotionProgress.style.width = `${percentage}%`;
        this.elements.emotionDescription.textContent = this.getEmotionDescription(emotionName);
        
        // Update icon based on emotion
        const iconMap = {
            happy: 'fas fa-smile',
            sad: 'fas fa-sad-tear',
            angry: 'fas fa-angry',
            surprised: 'fas fa-surprise',
            fearful: 'fas fa-frown',
            disgusted: 'fas fa-meh',
            neutral: 'fas fa-meh-blank'
        };
        
        this.elements.emotionIcon.innerHTML = `<i class="${iconMap[emotionName] || 'fas fa-question'}"></i>`;
        
        // Update color based on emotion
        const colorMap = {
            happy: '#10b981',
            sad: '#3b82f6',
            angry: '#ef4444',
            surprised: '#f59e0b',
            fearful: '#8b5cf6',
            disgusted: '#84cc16',
            neutral: '#6b7280'
        };
        
        this.elements.emotionIcon.style.color = colorMap[emotionName] || '#6b7280';
    }

    getEmotionDescription(emotion) {
        const descriptions = {
            happy: "You're radiating positivity! This emotion indicates joy and contentment.",
            sad: "You seem contemplative. This reflects feelings of melancholy or introspection.",
            angry: "Strong emotions detected. This shows frustration or displeasure.",
            surprised: "Unexpected reaction! This indicates surprise or amazement.",
            fearful: "Caution detected. This reflects worry or anxiety.",
            disgusted: "Disapproval sensed. This shows strong dislike or revulsion.",
            neutral: "Calm and composed. You're in a relaxed, balanced state."
        };
        return descriptions[emotion] || "Emotion detected.";
    }

    saveEmotionData(emotion, confidence) {
        const data = {
            emotion,
            confidence,
            timestamp: Date.now(),
            sessionId: this.sessionStartTime
        };
        
        this.emotionHistory.push(data);
        localStorage.setItem('emotionHistory', JSON.stringify(this.emotionHistory));
        
        // Update statistics
        this.updateStatistics();
    }

    updateStatistics() {
        const totalDetections = this.emotionHistory.length;
        this.elements.totalDetections.textContent = totalDetections;
    }

    updateSessionTime() {
        if (this.sessionStartTime) {
            const elapsed = Math.floor((Date.now() - this.sessionStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            this.elements.sessionTime.textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            if (this.isDetecting) {
                setTimeout(() => this.updateSessionTime(), 1000);
            }
        }
    }

    captureFrame() {
        if (!this.isDetecting) return;
        
        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);
        
        // Save to localStorage
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        const captures = JSON.parse(localStorage.getItem('emotionCaptures') || '[]');
        captures.push({
            image: imageData,
            emotion: this.elements.emotionName.textContent,
            confidence: this.elements.emotionConfidence.textContent,
            timestamp: Date.now()
        });
        localStorage.setItem('emotionCaptures', JSON.stringify(captures));
        
        // Show capture animation
        this.showCaptureAnimation();
    }

    showCaptureAnimation() {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            opacity: 0.3;
            pointer-events: none;
            z-index: 9999;
        `;
        document.body.appendChild(flash);
        
        setTimeout(() => {
            flash.remove();
        }, 200);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        const icon = this.elements.themeToggle.querySelector('i');
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    openSettings() {
        this.elements.settingsModal.style.display = 'block';
    }

    closeSettings() {
        this.elements.settingsModal.style.display = 'none';
    }

    updateSensitivity(e) {
        const value = e.target.value;
        this.elements.sensitivityValue.textContent = `${Math.round(value * 100)}%`;
        localStorage.setItem('sensitivity', value);
    }

    handleFileUpload(e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            this.processImage(file);
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        this.elements.uploadZone.classList.add('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        this.elements.uploadZone.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            this.processImage(files[0]);
        }
    }

    async processImage(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            this.elements.previewImage.src = e.target.result;
            this.elements.uploadPreview.style.display = 'block';
            
            // Process image for emotion detection
            const img = new Image();
            img.onload = async () => {
                const detections = await faceapi
                    .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks()
                    .withFaceExpressions()
                    .withAgeAndGender();
                
                if (detections.length > 0) {
                    const detection = detections[0];
                    const expressions = detection.expressions;
                    const maxEmotion = Object.entries(expressions).reduce((max, curr) => 
                        curr[1] > max[1] ? curr : max
                    );
                    
                    this.displayUploadResults(maxEmotion, detection);
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    displayUploadResults(emotion, detection) {
        const [emotionName, confidence] = emotion;
        const percentage = Math.round(confidence * 100);
        
        this.elements.uploadResults.innerHTML = `
            <div class="upload-result-card">
                <h4>Detected Emotion</h4>
                <p class="emotion-result">${emotionName.charAt(0).toUpperCase() + emotionName.slice(1)}</p>
                <p class="confidence-result">${percentage}% confidence</p>
                ${detection.age ? `<p class="age-result">Age: ${Math.round(detection.age)}</p>` : ''}
                ${detection.gender ? `<p class="gender-result">Gender: ${detection.gender}</p>` : ''}
            </div>
        `;
    }

    loadSettings() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        const icon = this.elements.themeToggle.querySelector('i');
        icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        
        const sensitivity = localStorage.getItem('sensitivity') || '0.75';
        this.elements.sensitivitySlider.value = sensitivity;
        this.elements.sensitivityValue.textContent = `${Math.round(sensitivity * 100)}%`;
        
        // Load emotion history
        this.emotionHistory = JSON.parse(localStorage.getItem('emotionHistory') || '[]');
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 1rem;
            border-radius: 0.5rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 10000;
        `;
        
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.emotionApp = new EmotionApp();
});
