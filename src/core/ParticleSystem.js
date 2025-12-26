/**
 * GPU Particle System - Transform Feedback based particle engine
 * Manages particle state using ping-pong buffer technique
 */

import * as THREE from 'three';

export class ParticleSystem {
    constructor(particleCount = 30000) {
        this.particleCount = particleCount;

        // Ping-Pong buffers for Transform Feedback
        this.bufferA = null;
        this.bufferB = null;
        this.currentBuffer = 0; // 0 = A, 1 = B

        // Transform Feedback objects
        this.transformFeedbackA = null;
        this.transformFeedbackB = null;

        // Programs
        this.updateProgram = null;
        this.renderProgram = null;

        // WebGL2 context
        this.gl = null;

        // Uniforms
        this.uniforms = {
            uTime: 0,
            uDeltaTime: 0,
            uGravity: new THREE.Vector3(0, -1, 0),
            uBounds: new THREE.Vector3(1.2, 1.8, 1.2), // Container bounds
            uDamping: 0.98,
            uBounce: 0.3,
            uTouchPoints: new Array(5).fill(new THREE.Vector4(0, 0, 0, 0)),

            // Shape target uniforms
            uTargetTexture: null,
            uTextureSize: 0,
            uShapeAttraction: 0.0 // 0 = free, 1 = locked to shape
        };
    }

    /**
     * Initialize particle system with WebGL2 context
     */
    init(renderer) {
        const gl = renderer.getContext();

        // Check WebGL2 support
        if (!(gl instanceof WebGL2RenderingContext)) {
            throw new Error('WebGL 2.0 is required for GPU particle system');
        }

        this.gl = gl;

        // Initialize particle data
        this.initParticles();

        console.log(`[ParticleSystem] Initialized with ${this.particleCount} particles`);

        return this;
    }

    /**
     * Initialize particle positions and velocities
     */
    initParticles() {
        const positions = new Float32Array(this.particleCount * 3);
        const velocities = new Float32Array(this.particleCount * 3);
        const ids = new Float32Array(this.particleCount);

        // Initialize particles in a sphere shape centered at origin (visible to camera)
        for (let i = 0; i < this.particleCount; i++) {
            // Sphere sampling
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.pow(Math.random(), 1 / 3) * 0.5; // Radius 0.5 for visibility

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            positions[i * 3 + 0] = x;
            positions[i * 3 + 1] = y; // Centered at origin, not offset
            positions[i * 3 + 2] = z;

            // Initial velocity
            velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.05;
            velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
            velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;

            // Particle ID
            ids[i] = i;
        }

        // Store initial data
        this.initialPositions = positions;
        this.initialVelocities = velocities;
        this.initialIds = ids;
    }

    /**
     * Create VAO with particle attributes
     */
    createVAO(gl, positions, velocities, ids, isBufferA) {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        // Position buffer
        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_COPY);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        // Velocity buffer
        const velBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, velBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, velocities, gl.DYNAMIC_COPY);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        // ID buffer
        const idBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, idBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, ids, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);

        // Store buffer references
        const bufferData = {
            vao,
            posBuffer,
            velBuffer,
            idBuffer
        };

        if (isBufferA) {
            this.bufferA = bufferData;
        } else {
            this.bufferB = bufferData;
        }

        return bufferData;
    }

    /**
     * Setup Transform Feedback
     */
    setupTransformFeedback(updateShader) {
        const gl = this.gl;

        // Create VAOs for ping-pong
        this.createVAO(gl, this.initialPositions, this.initialVelocities, this.initialIds, true);
        this.createVAO(gl, this.initialPositions, this.initialVelocities, this.initialIds, false);

        // Create transform feedback objects
        this.transformFeedbackA = gl.createTransformFeedback();
        this.transformFeedbackB = gl.createTransformFeedback();

        // Bind transform feedback buffers
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedbackA);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.bufferA.posBuffer);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, this.bufferA.velBuffer);

        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedbackB);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.bufferB.posBuffer);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, this.bufferB.velBuffer);

        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

        console.log('[ParticleSystem] Transform Feedback setup complete');
    }

    /**
     * Update particles using Transform Feedback
     */
    update(deltaTime, updateProgram) {
        const gl = this.gl;

        // Get current and target buffers
        const readBuffer = this.currentBuffer === 0 ? this.bufferA : this.bufferB;
        const writeBuffer = this.currentBuffer === 0 ? this.bufferB : this.bufferA;
        const writeTF = this.currentBuffer === 0 ? this.transformFeedbackB : this.transformFeedbackA;

        // Use update program
        gl.useProgram(updateProgram);

        // Update uniforms
        this.uniforms.uDeltaTime = deltaTime;
        this.updateUniforms(gl, updateProgram);

        // Bind read VAO
        gl.bindVertexArray(readBuffer.vao);

        // Bind transform feedback for writing
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, writeTF);

        // Disable rasterization (we only want transform feedback)
        gl.enable(gl.RASTERIZER_DISCARD);

        // Run transform feedback
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, this.particleCount);
        gl.endTransformFeedback();

        // Re-enable rasterization
        gl.disable(gl.RASTERIZER_DISCARD);

        // Unbind
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        gl.bindVertexArray(null);

        // Swap buffers
        this.currentBuffer = 1 - this.currentBuffer;
    }

    /**
     * Update shader uniforms
     */
    updateUniforms(gl, program) {
        // Time
        const uTimeLocation = gl.getUniformLocation(program, 'uTime');
        gl.uniform1f(uTimeLocation, this.uniforms.uTime);

        const uDeltaTimeLocation = gl.getUniformLocation(program, 'uDeltaTime');
        gl.uniform1f(uDeltaTimeLocation, this.uniforms.uDeltaTime);

        // Gravity
        const uGravityLocation = gl.getUniformLocation(program, 'uGravity');
        gl.uniform3f(uGravityLocation,
            this.uniforms.uGravity.x,
            this.uniforms.uGravity.y,
            this.uniforms.uGravity.z
        );

        // Bounds
        const uBoundsLocation = gl.getUniformLocation(program, 'uBounds');
        gl.uniform3f(uBoundsLocation,
            this.uniforms.uBounds.x,
            this.uniforms.uBounds.y,
            this.uniforms.uBounds.z
        );

        // Damping
        const uDampingLocation = gl.getUniformLocation(program, 'uDamping');
        gl.uniform1f(uDampingLocation, this.uniforms.uDamping);

        // Bounce
        const uBounceLocation = gl.getUniformLocation(program, 'uBounce');
        gl.uniform1f(uBounceLocation, this.uniforms.uBounce);

        // Touch points
        const uTouchPointsLocation = gl.getUniformLocation(program, 'uTouchPoints');
        if (uTouchPointsLocation) {
            const touchData = new Float32Array(20); // 5 points * 4 components
            for (let i = 0; i < 5; i++) {
                const tp = this.uniforms.uTouchPoints[i];
                touchData[i * 4 + 0] = tp.x;
                touchData[i * 4 + 1] = tp.y;
                touchData[i * 4 + 2] = tp.z;
                touchData[i * 4 + 3] = tp.w;
            }
            gl.uniform4fv(uTouchPointsLocation, touchData);
        }

        // Shape target texture
        if (this.uniforms.uTargetTexture) {
            const uTargetTextureLocation = gl.getUniformLocation(program, 'uTargetTexture');
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.uniforms.uTargetTexture);
            gl.uniform1i(uTargetTextureLocation, 0);

            const uTextureSizeLocation = gl.getUniformLocation(program, 'uTextureSize');
            gl.uniform1f(uTextureSizeLocation, this.uniforms.uTextureSize);
        }

        // Shape attraction
        const uShapeAttractionLocation = gl.getUniformLocation(program, 'uShapeAttraction');
        gl.uniform1f(uShapeAttractionLocation, this.uniforms.uShapeAttraction);
    }

    /**
     * Get current buffer for rendering
     */
    getCurrentBuffer() {
        return this.currentBuffer === 0 ? this.bufferA : this.bufferB;
    }

    /**
     * Set gravity direction
     */
    setGravity(x, y, z) {
        this.uniforms.uGravity.set(x, y, z);
    }

    /**
     * Set touch points
     */
    setTouchPoints(touchPoints) {
        this.uniforms.uTouchPoints = touchPoints;
    }

    /**
     * Set shape target (from Shape Manager)
     */
    setShapeTarget(textureData, textureSize) {
        const gl = this.gl;

        // Create native WebGL texture
        if (!this.uniforms.uTargetTexture) {
            this.uniforms.uTargetTexture = gl.createTexture();
        }

        // CRITICAL: Unbind PIXEL_UNPACK_BUFFER to upload from client memory
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);

        gl.bindTexture(gl.TEXTURE_2D, this.uniforms.uTargetTexture);

        // Upload texture data (Float32Array from ShapeManager)
        // Use RGBA32F for full precision float storage
        gl.texImage2D(
            gl.TEXTURE_2D,
            0, // mipmap level
            gl.RGBA32F, // internal format
            textureSize, textureSize,
            0, // border
            gl.RGBA, // format
            gl.FLOAT, // type
            textureData
        );

        // Set texture parameters (no mipmaps, clamp to edge)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindTexture(gl.TEXTURE_2D, null);

        this.uniforms.uTextureSize = textureSize;

        console.log(`[ParticleSystem] Shape target texture updated (${textureSize}x${textureSize})`);
    }

    /**
     * Set shape attraction strength (0-1)
     */
    setShapeAttraction(strength) {
        this.uniforms.uShapeAttraction = Math.max(0, Math.min(1, strength));
    }

    /**
     * Clean up resources
     */
    dispose() {
        const gl = this.gl;

        if (this.bufferA) {
            gl.deleteBuffer(this.bufferA.posBuffer);
            gl.deleteBuffer(this.bufferA.velBuffer);
            gl.deleteBuffer(this.bufferA.idBuffer);
            gl.deleteVertexArray(this.bufferA.vao);
        }

        if (this.bufferB) {
            gl.deleteBuffer(this.bufferB.posBuffer);
            gl.deleteBuffer(this.bufferB.velBuffer);
            gl.deleteBuffer(this.bufferB.idBuffer);
            gl.deleteVertexArray(this.bufferB.vao);
        }

        if (this.transformFeedbackA) gl.deleteTransformFeedback(this.transformFeedbackA);
        if (this.transformFeedbackB) gl.deleteTransformFeedback(this.transformFeedbackB);
    }
}
