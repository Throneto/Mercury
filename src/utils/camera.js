/**
 * Camera stream utilities
 * Handles webcam access and VideoTexture creation
 */

/**
 * Get camera stream with fallback options
 * @param {boolean} preferFront - Prefer front camera (default: true for mirror effect)
 * @returns {Promise<MediaStream>}
 */
export async function getCameraStream(preferFront = true) {
    const constraints = {
        video: {
            facingMode: preferFront ? 'user' : 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    };

    try {
        return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
        // Fallback to any available camera
        console.warn('Preferred camera not available, trying fallback:', error);
        try {
            return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (fallbackError) {
            throw new Error('无法访问摄像头: ' + fallbackError.message);
        }
    }
}

/**
 * Create video element from camera stream
 * @param {MediaStream} stream 
 * @returns {HTMLVideoElement}
 */
export function createVideoElement(stream) {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', ''); // Required for iOS
    video.setAttribute('muted', '');
    video.muted = true;
    video.autoplay = true;
    
    return new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
            video.play()
                .then(() => resolve(video))
                .catch(reject);
        };
        video.onerror = reject;
    });
}

/**
 * Stop camera stream
 * @param {MediaStream} stream 
 */
export function stopCameraStream(stream) {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}
