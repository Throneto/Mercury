/**
 * Particle Renderer - Point Cloud rendering for particles
 * Handles rendering particles as point sprites with depth
 */

import * as THREE from 'three';

export class ParticleRenderer {
    constructor(particleSystem) {
        this.particleSystem = particleSystem;
        this.gl = null;
        this.program = null;

        // Shader uniforms
        this.uniforms = {
            uProjectionMatrix: new THREE.Matrix4(),
            uModelViewMatrix: new THREE.Matrix4(),
            uPointSize: 3.5,
            uColor: new THREE.Vector3(0.7, 0.75, 0.8), // Silver color
            uResolution: new THREE.Vector2(800, 600)
        };
    }

    /**
     * Initialize renderer
     */
    init(renderer, vertexShader, fragmentShader) {
        this.gl = renderer.getContext();

        // Compile shaders
        this.program = this.createProgram(vertexShader, fragmentShader);

        console.log('[ParticleRenderer] Initialized');

        return this;
    }

    /**
     * Create shader program
     */
    createProgram(vertexSource, fragmentSource) {
        const gl = this.gl;

        // Compile vertex shader
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexSource);
        gl.compileShader(vertexShader);

        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            console.error('[ParticleRenderer] Vertex shader error:', gl.getShaderInfoLog(vertexShader));
            throw new Error('Vertex shader compilation failed');
        }

        // Compile fragment shader
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentSource);
        gl.compileShader(fragmentShader);

        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            console.error('[ParticleRenderer] Fragment shader error:', gl.getShaderInfoLog(fragmentShader));
            throw new Error('Fragment shader compilation failed');
        }

        // Link program
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('[ParticleRenderer] Program link error:', gl.getProgramInfoLog(program));
            throw new Error('Program linking failed');
        }

        // Clean up shaders (no longer needed after linking)
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        return program;
    }

    /**
     * Render particles
     */
    render(camera) {
        const gl = this.gl;

        // Use program
        gl.useProgram(this.program);

        // Update matrices from camera
        this.uniforms.uProjectionMatrix.copy(camera.projectionMatrix);
        this.uniforms.uModelViewMatrix.copy(camera.matrixWorldInverse);

        // Set uniforms
        this.updateUniforms(gl, this.program);

        // Get current particle buffer
        const buffer = this.particleSystem.getCurrentBuffer();

        if (!buffer || !buffer.vao) {
            console.error('[ParticleRenderer] Invalid buffer or VAO');
            return;
        }

        // Bind VAO for rendering (contains all vertex attribute state)
        gl.bindVertexArray(buffer.vao);

        // Setup rendering state
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);

        // Ensure RASTERIZER_DISCARD is OFF (might be on from TF pass)
        gl.disable(gl.RASTERIZER_DISCARD);

        // Draw particles as points
        gl.drawArrays(gl.POINTS, 0, this.particleSystem.particleCount);

        // Check for errors
        const error = gl.getError();
        if (error !== 0) {
            console.error('[ParticleRenderer] WebGL error during render:', error);
        }

        // Cleanup
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
    }

    /**
     * Update shader uniforms
     */
    updateUniforms(gl, program) {
        // Projection matrix
        const uProjectionMatrixLocation = gl.getUniformLocation(program, 'uProjectionMatrix');
        gl.uniformMatrix4fv(uProjectionMatrixLocation, false, this.uniforms.uProjectionMatrix.toArray());

        // ModelView matrix
        const uModelViewMatrixLocation = gl.getUniformLocation(program, 'uModelViewMatrix');
        gl.uniformMatrix4fv(uModelViewMatrixLocation, false, this.uniforms.uModelViewMatrix.toArray());

        // Point size
        const uPointSizeLocation = gl.getUniformLocation(program, 'uPointSize');
        gl.uniform1f(uPointSizeLocation, this.uniforms.uPointSize);

        // Color
        const uColorLocation = gl.getUniformLocation(program, 'uColor');
        gl.uniform3f(uColorLocation,
            this.uniforms.uColor.x,
            this.uniforms.uColor.y,
            this.uniforms.uColor.z
        );

        // Resolution
        const uResolutionLocation = gl.getUniformLocation(program, 'uResolution');
        gl.uniform2f(uResolutionLocation,
            this.uniforms.uResolution.x,
            this.uniforms.uResolution.y
        );
    }

    /**
     * Set resolution
     */
    setResolution(width, height) {
        this.uniforms.uResolution.set(width, height);
    }

    /**
     * Set point size
     */
    setPointSize(size) {
        this.uniforms.uPointSize = size;
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.program) {
            this.gl.deleteProgram(this.program);
        }
    }
}
