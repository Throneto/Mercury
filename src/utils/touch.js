/**
 * Touch interaction utilities
 * Handles multi-touch and converts to world coordinates
 */

export class TouchManager {
    constructor(maxTouchPoints = 5) {
        this.maxTouchPoints = maxTouchPoints;
        this.touchPoints = new Array(maxTouchPoints).fill(null).map(() => ({
            x: 0, y: 0, z: 0, active: false
        }));
        this.smoothingFactor = 0.3;
        this._element = null;
    }

    /**
     * Bind touch events to an element
     * @param {HTMLElement} element 
     */
    bind(element) {
        this._element = element;

        element.addEventListener('touchstart', this._onTouch.bind(this), { passive: false });
        element.addEventListener('touchmove', this._onTouch.bind(this), { passive: false });
        element.addEventListener('touchend', this._onTouchEnd.bind(this), { passive: false });
        element.addEventListener('touchcancel', this._onTouchEnd.bind(this), { passive: false });

        // Mouse fallback for desktop
        element.addEventListener('mousedown', this._onMouse.bind(this));
        element.addEventListener('mousemove', this._onMouse.bind(this));
        element.addEventListener('mouseup', this._onMouseUp.bind(this));
        element.addEventListener('mouseleave', this._onMouseUp.bind(this));
    }

    /**
     * Handle touch events
     * @param {TouchEvent} event 
     */
    _onTouch(event) {
        event.preventDefault();

        // Reset all points first
        this.touchPoints.forEach(p => p.active = false);

        // Update active touch points
        const touches = event.touches;
        const rect = this._element.getBoundingClientRect();

        for (let i = 0; i < Math.min(touches.length, this.maxTouchPoints); i++) {
            const touch = touches[i];
            const point = this.touchPoints[i];

            // Normalize to -1 to 1 range
            const targetX = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            const targetY = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

            // Smooth interpolation
            if (point.active) {
                point.x += (targetX - point.x) * this.smoothingFactor;
                point.y += (targetY - point.y) * this.smoothingFactor;
            } else {
                point.x = targetX;
                point.y = targetY;
            }

            point.z = 1.0; // Touch strength
            point.active = true;
        }
    }

    /**
     * Handle touch end
     * @param {TouchEvent} event 
     */
    _onTouchEnd(event) {
        const remainingTouches = new Set();
        for (let i = 0; i < event.touches.length; i++) {
            remainingTouches.add(event.touches[i].identifier);
        }

        // Fade out inactive points
        this.touchPoints.forEach((point, index) => {
            if (index >= event.touches.length) {
                point.z *= 0.8;
                if (point.z < 0.01) {
                    point.active = false;
                    point.z = 0;
                }
            }
        });
    }

    /**
     * Mouse fallback
     * @param {MouseEvent} event 
     */
    _onMouse(event) {
        if (event.type === 'mousemove' && !(event.buttons & 1)) return;

        const rect = this._element.getBoundingClientRect();
        const point = this.touchPoints[0];

        point.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        point.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        point.z = 1.0;
        point.active = true;
    }

    /**
     * Mouse up handler
     */
    _onMouseUp() {
        this.touchPoints[0].active = false;
        this.touchPoints[0].z = 0;
    }

    /**
     * Get touch points array for shader uniform
     * @returns {Float32Array}
     */
    getUniformData() {
        const data = new Float32Array(this.maxTouchPoints * 4);
        for (let i = 0; i < this.maxTouchPoints; i++) {
            const point = this.touchPoints[i];
            data[i * 4 + 0] = point.x;
            data[i * 4 + 1] = point.y;
            data[i * 4 + 2] = point.z;
            data[i * 4 + 3] = point.active ? 1.0 : 0.0;
        }
        return data;
    }

    /**
     * Update - call each frame to decay inactive touch points
     */
    update() {
        this.touchPoints.forEach(point => {
            if (!point.active && point.z > 0) {
                point.z *= 0.92;
                if (point.z < 0.01) point.z = 0;
            }
        });
    }
}
