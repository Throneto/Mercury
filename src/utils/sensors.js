/**
 * Device orientation (gyroscope) utilities
 * Handles gravity vector from device tilt
 */

/**
 * Sensor manager for device orientation
 */
export class SensorManager {
    constructor() {
        this.gravity = { x: 0, y: -1, z: 0 };
        this.smoothedGravity = { x: 0, y: -1, z: 0 };
        this.smoothingFactor = 0.1;
        this.isSupported = false;
        this.hasPermission = false;
        this._handler = null;
    }

    /**
     * Request permission for device orientation (required on iOS 13+)
     * @returns {Promise<boolean>}
     */
    async requestPermission() {
        // Check if API exists
        if (!window.DeviceOrientationEvent) {
            console.warn('DeviceOrientation not supported');
            return false;
        }

        // iOS 13+ requires permission
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                this.hasPermission = permission === 'granted';
                return this.hasPermission;
            } catch (error) {
                console.error('Orientation permission error:', error);
                return false;
            }
        }

        // Android and older iOS don't need permission
        this.hasPermission = true;
        return true;
    }

    /**
     * Start listening for orientation changes
     */
    start() {
        if (this._handler) return;

        this._handler = (event) => this._onOrientation(event);
        window.addEventListener('deviceorientation', this._handler, true);
        this.isSupported = true;
    }

    /**
     * Stop listening
     */
    stop() {
        if (this._handler) {
            window.removeEventListener('deviceorientation', this._handler, true);
            this._handler = null;
        }
    }

    /**
     * Handle orientation event
     * @param {DeviceOrientationEvent} event 
     */
    _onOrientation(event) {
        const { alpha, beta, gamma } = event;

        if (beta === null || gamma === null) return;

        // Convert degrees to radians
        const betaRad = (beta * Math.PI) / 180;
        const gammaRad = (gamma * Math.PI) / 180;

        // Calculate gravity vector from device orientation
        // Beta: front-to-back tilt (-180 to 180)
        // Gamma: left-to-right tilt (-90 to 90)
        this.gravity.x = Math.sin(gammaRad);
        this.gravity.y = -Math.cos(betaRad) * Math.cos(gammaRad);
        this.gravity.z = Math.sin(betaRad) * Math.cos(gammaRad);

        // Smooth the values to reduce jitter
        this.smoothedGravity.x += (this.gravity.x - this.smoothedGravity.x) * this.smoothingFactor;
        this.smoothedGravity.y += (this.gravity.y - this.smoothedGravity.y) * this.smoothingFactor;
        this.smoothedGravity.z += (this.gravity.z - this.smoothedGravity.z) * this.smoothingFactor;
    }

    /**
     * Get current smoothed gravity vector
     * @returns {{x: number, y: number, z: number}}
     */
    getGravity() {
        return this.smoothedGravity;
    }

    /**
     * Get raw gravity vector (no smoothing) for reactive effects
     * @returns {{x: number, y: number, z: number}}
     */
    getRawGravity() {
        return this.gravity;
    }
}
