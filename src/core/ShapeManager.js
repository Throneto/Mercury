/**
 * Shape Manager - Geometric shape sampling for particle targets
 * Samples points on basic shapes (sphere, cube, torus, heart) for particles to form
 */

export class ShapeManager {
    constructor(particleCount) {
        this.particleCount = particleCount;
        this.currentShape = 'sphere';
        this.targetPositions = new Float32Array(particleCount * 3);

        // Available shapes
        this.shapes = {
            sphere: this.sampleSphere.bind(this),
            cube: this.sampleCube.bind(this),
            torus: this.sampleTorus.bind(this),
            heart: this.sampleHeart.bind(this)
        };

        // Initialize with sphere
        this.updateShape('sphere');
    }

    /**
     * Sample points on a sphere surface
     */
    sampleSphere(count, radius = 0.6) {
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            // Fibonacci sphere sampling for uniform distribution
            const phi = Math.acos(1 - 2 * (i + 0.5) / count);
            const theta = Math.PI * (1 + Math.sqrt(5)) * i; // Golden angle

            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);

            positions[i * 3 + 0] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
        }

        return positions;
    }

    /**
     * Sample points on a cube surface
     */
    sampleCube(count, size = 0.8) {
        const positions = new Float32Array(count * 3);
        const half = size / 2;

        for (let i = 0; i < count; i++) {
            // Randomly choose a face (0-5)
            const face = Math.floor(Math.random() * 6);
            const u = Math.random() * 2 - 1; // -1 to 1
            const v = Math.random() * 2 - 1;

            let x, y, z;

            switch (face) {
                case 0: x = half; y = u * half; z = v * half; break;  // +X
                case 1: x = -half; y = u * half; z = v * half; break; // -X
                case 2: x = u * half; y = half; z = v * half; break;  // +Y
                case 3: x = u * half; y = -half; z = v * half; break; // -Y
                case 4: x = u * half; y = v * half; z = half; break;  // +Z
                case 5: x = u * half; y = v * half; z = -half; break; // -Z
            }

            positions[i * 3 + 0] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
        }

        return positions;
    }

    /**
     * Sample points on a torus surface
     */
    sampleTorus(count, majorRadius = 0.5, minorRadius = 0.2) {
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const u = Math.random() * Math.PI * 2;
            const v = Math.random() * Math.PI * 2;

            const x = (majorRadius + minorRadius * Math.cos(v)) * Math.cos(u);
            const y = (majorRadius + minorRadius * Math.cos(v)) * Math.sin(u);
            const z = minorRadius * Math.sin(v);

            positions[i * 3 + 0] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
        }

        return positions;
    }

    /**
     * Sample points on a heart shape
     */
    sampleHeart(count, scale = 0.15) {
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const t = Math.random() * Math.PI * 2;
            const s = Math.random() * Math.PI;

            // Parametric heart surface equation
            const x = scale * 16 * Math.pow(Math.sin(t), 3);
            const y = scale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
            const z = scale * 10 * Math.sin(s) * Math.sin(t);

            positions[i * 3 + 0] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
        }

        return positions;
    }

    /**
     * Update target shape
     */
    updateShape(shapeName) {
        if (!this.shapes[shapeName]) {
            console.warn(`[ShapeManager] Unknown shape: ${shapeName}`);
            return;
        }

        this.currentShape = shapeName;
        this.targetPositions = this.shapes[shapeName](this.particleCount);

        console.log(`[ShapeManager] Switched to shape: ${shapeName}`);
    }

    /**
     * Get current target positions
     */
    getTargetPositions() {
        return this.targetPositions;
    }

    /**
     * Create texture data for GPU upload
     */
    createTargetTexture() {
        const size = Math.ceil(Math.sqrt(this.particleCount));
        const data = new Float32Array(size * size * 4); // RGBA format

        for (let i = 0; i < this.particleCount; i++) {
            data[i * 4 + 0] = this.targetPositions[i * 3 + 0]; // R = x
            data[i * 4 + 1] = this.targetPositions[i * 3 + 1]; // G = y
            data[i * 4 + 2] = this.targetPositions[i * 3 + 2]; // B = z
            data[i * 4 + 3] = 1.0; // A = unused
        }

        return { data, size };
    }
}
