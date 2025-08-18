/**
 * Smart Image Cropper - Modern interface with real-time preview
 */

class SmartImageCropper {
    constructor() {
        this.cropper = null;
        this.originalImage = null;
        this.currentShape = 'rectangle';
        this.outputQuality = 0.92;
        this.croppedData = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.hideLoading();
    }

    setupEventListeners() {
        // File upload
        const uploadZone = document.getElementById('upload-zone');
        const fileInput = document.getElementById('image-input');

        uploadZone.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) this.handleImageUpload(files[0]);
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleImageUpload(e.target.files[0]);
            }
        });

        // Shape selection
        document.querySelectorAll('.shape-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.shape-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                this.currentShape = card.dataset.shape;
                this.updateShapeDisplay();
                this.updatePreview();
            });
        });

        // Aspect ratio
        document.getElementById('aspect-ratio').addEventListener('change', (e) => {
            const ratio = e.target.value;
            if (this.cropper) {
                if (ratio === 'free') {
                    this.cropper.setAspectRatio(NaN);
                } else {
                    this.cropper.setAspectRatio(parseFloat(ratio));
                }
            }
        });

        // Output size
        document.getElementById('output-width').addEventListener('input', () => this.updatePreview());
        document.getElementById('output-height').addEventListener('input', () => this.updatePreview());

        // Quality slider
        const qualitySlider = document.getElementById('quality-slider');
        qualitySlider.addEventListener('input', (e) => {
            this.outputQuality = e.target.value / 100;
            document.getElementById('quality-value').textContent = e.target.value + '%';
            this.updatePreview();
        });

        // Action buttons
        document.getElementById('crop-button').addEventListener('click', () => this.cropImage());
        document.getElementById('reset-button').addEventListener('click', () => this.resetCrop());
        document.getElementById('download-button').addEventListener('click', () => this.downloadImage());
    }

    async handleImageUpload(file) {
        try {
            // Validate file
            if (!file.type.startsWith('image/')) {
                this.showNotification('Please select a valid image file', 'error');
                return;
            }

            if (file.size > 50 * 1024 * 1024) { // 50MB limit
                this.showNotification('File too large. Please select an image under 50MB', 'error');
                return;
            }

            this.showLoading('Processing image...');

            // Read file
            const imageUrl = await this.readFileAsDataURL(file);
            this.originalImage = file;

            // Setup cropper
            await this.initializeCropper(imageUrl);

            // Show UI sections
            document.getElementById('shape-section').style.display = 'block';
            document.getElementById('controls-section').style.display = 'block';
            document.getElementById('preview-section').style.display = 'block';

            // Update stats
            this.updateImageStats();

            this.hideLoading();
            this.showNotification('Image loaded successfully!', 'success');

        } catch (error) {
            console.error('Error handling image upload:', error);
            this.hideLoading();
            this.showNotification('Failed to load image', 'error');
        }
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async initializeCropper(imageUrl) {
        const cropImage = document.getElementById('crop-image');
        const container = document.getElementById('cropper-container');

        // Clear existing cropper
        if (this.cropper) {
            this.cropper.destroy();
        }

        // Set image source and show
        cropImage.src = imageUrl;
        cropImage.style.display = 'block';
        container.innerHTML = '';
        container.appendChild(cropImage);

        // Wait for image to load
        await new Promise((resolve) => {
            cropImage.onload = resolve;
        });

        // Initialize Cropper.js
        this.cropper = new Cropper(cropImage, {
            aspectRatio: NaN,
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 0.8,
            movable: true,
            rotatable: true,
            scalable: true,
            zoomable: true,
            wheelZoomRatio: 0.1,
            ready: () => {
                this.updatePreview();
            },
            crop: () => {
                this.updatePreview();
            }
        });
    }

    updatePreview() {
        if (!this.cropper) return;

        try {
            // Get crop data
            const canvas = this.cropper.getCroppedCanvas({
                width: this.getOutputWidth(),
                height: this.getOutputHeight(),
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            if (!canvas) return;

            // Apply shape mask
            const maskedCanvas = this.applyShapeMask(canvas);

            // Update preview
            const previewCanvas = document.getElementById('preview-canvas');
            const ctx = previewCanvas.getContext('2d');
            
            // Resize preview canvas to fit
            const maxSize = 200;
            const scale = Math.min(maxSize / maskedCanvas.width, maxSize / maskedCanvas.height);
            previewCanvas.width = maskedCanvas.width * scale;
            previewCanvas.height = maskedCanvas.height * scale;

            ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            ctx.drawImage(maskedCanvas, 0, 0, previewCanvas.width, previewCanvas.height);

            // Store cropped data
            this.croppedData = maskedCanvas;

            // Enable download button
            document.getElementById('download-button').disabled = false;

            // Update size stats
            this.updateCropStats(maskedCanvas);

        } catch (error) {
            console.error('Error updating preview:', error);
        }
    }

    applyShapeMask(canvas) {
        const maskedCanvas = document.createElement('canvas');
        maskedCanvas.width = canvas.width;
        maskedCanvas.height = canvas.height;
        const ctx = maskedCanvas.getContext('2d');

        // Create shape mask
        ctx.save();
        this.createShapePath(ctx, maskedCanvas.width, maskedCanvas.height);
        ctx.clip();

        // Draw image within mask
        ctx.drawImage(canvas, 0, 0);
        ctx.restore();

        return maskedCanvas;
    }

    createShapePath(ctx, width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2;

        ctx.beginPath();

        switch (this.currentShape) {
            case 'circle':
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                break;

            case 'rounded':
                const cornerRadius = Math.min(width, height) * 0.1;
                this.roundedRect(ctx, 0, 0, width, height, cornerRadius);
                break;

            case 'heart':
                this.heartPath(ctx, centerX, centerY, radius);
                break;

            case 'star':
                this.starPath(ctx, centerX, centerY, radius);
                break;

            case 'diamond':
                ctx.moveTo(centerX, 0);
                ctx.lineTo(width, centerY);
                ctx.lineTo(centerX, height);
                ctx.lineTo(0, centerY);
                ctx.closePath();
                break;

            default: // rectangle
                ctx.rect(0, 0, width, height);
        }
    }

    roundedRect(ctx, x, y, width, height, radius) {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    heartPath(ctx, x, y, size) {
        const width = size;
        const height = size * 0.8;
        
        ctx.moveTo(x, y + height / 4);
        ctx.quadraticCurveTo(x, y, x + width / 4, y);
        ctx.quadraticCurveTo(x + width / 2, y, x + width / 2, y + height / 4);
        ctx.quadraticCurveTo(x + width / 2, y, x + 3 * width / 4, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + height / 4);
        ctx.quadraticCurveTo(x + width, y + height / 2, x + 3 * width / 4, y + 3 * height / 4);
        ctx.lineTo(x + width / 2, y + height);
        ctx.lineTo(x + width / 4, y + 3 * height / 4);
        ctx.quadraticCurveTo(x, y + height / 2, x, y + height / 4);
        ctx.closePath();
    }

    starPath(ctx, x, y, radius) {
        const spikes = 5;
        const outerRadius = radius;
        const innerRadius = radius * 0.4;

        let rot = Math.PI / 2 * 3;
        const step = Math.PI / spikes;

        ctx.moveTo(x, y - outerRadius);

        for (let i = 0; i < spikes; i++) {
            ctx.lineTo(x + Math.cos(rot) * outerRadius, y + Math.sin(rot) * outerRadius);
            rot += step;
            ctx.lineTo(x + Math.cos(rot) * innerRadius, y + Math.sin(rot) * innerRadius);
            rot += step;
        }

        ctx.lineTo(x, y - outerRadius);
        ctx.closePath();
    }

    getOutputWidth() {
        const widthInput = document.getElementById('output-width');
        return widthInput.value ? parseInt(widthInput.value) : null;
    }

    getOutputHeight() {
        const heightInput = document.getElementById('output-height');
        return heightInput.value ? parseInt(heightInput.value) : null;
    }

    updateImageStats() {
        if (!this.originalImage) return;

        // Original size
        const img = new Image();
        img.onload = () => {
            document.getElementById('original-size').textContent = `${img.width} × ${img.height}`;
        };
        img.src = URL.createObjectURL(this.originalImage);

        // File size
        const sizeKB = Math.round(this.originalImage.size / 1024);
        const sizeMB = (this.originalImage.size / (1024 * 1024)).toFixed(1);
        document.getElementById('file-size').textContent = sizeKB > 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
    }

    updateCropStats(canvas) {
        if (canvas) {
            document.getElementById('crop-size').textContent = `${canvas.width} × ${canvas.height}`;
        }
    }

    updateShapeDisplay() {
        document.getElementById('current-shape').textContent = 
            this.currentShape.charAt(0).toUpperCase() + this.currentShape.slice(1);
    }

    cropImage() {
        if (!this.cropper) {
            this.showNotification('Please upload an image first', 'error');
            return;
        }

        this.updatePreview();
        this.showNotification('Image cropped successfully!', 'success');
    }

    resetCrop() {
        if (this.cropper) {
            this.cropper.reset();
            this.updatePreview();
            this.showNotification('Crop reset', 'info');
        }
    }

    downloadImage() {
        if (!this.croppedData) {
            this.showNotification('No cropped image to download', 'error');
            return;
        }

        try {
            // Convert to blob with quality
            this.croppedData.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `cropped-${this.currentShape}-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.showNotification('Image downloaded!', 'success');
            }, 'image/png', this.outputQuality);

        } catch (error) {
            console.error('Error downloading image:', error);
            this.showNotification('Failed to download image', 'error');
        }
    }

    showLoading(message = 'Loading...') {
        // You can implement a loading overlay here
        console.log('Loading:', message);
    }

    hideLoading() {
        // Hide loading overlay
        console.log('Loading complete');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info-circle'} mr-2"></i>
            ${message}
        `;

        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Hide notification
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.smartCropper = new SmartImageCropper();
});
