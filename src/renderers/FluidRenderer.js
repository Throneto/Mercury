/**
 * Fluid Renderer - Screen Space Fluid Rendering (SSFR)
 * Converts particle system into smooth fluid surface using 4-pass pipeline:
 * 1. Depth rendering - render particles as sphere depths
 * 2. Bilateral filtering - smooth depth while preserving edges
 * 3. Normal reconstruction - calculate surface normals from depth
 * 4. Fluid shading - apply metallic material with Fresnel effect
 */

import { compileShader, createProgram } from '../utils/shaderUtils.js';

// Import shaders
import depthVertSource from '../shaders/fluid/depth_render.vert.glsl?raw';
import depthFragSource from '../shaders/fluid/depth_render.frag.glsl?raw';
import quadVertSource from '../shaders/fluid/fullscreen_quad.vert.glsl?raw';
import bilateralFragSource from '../shaders/fluid/bilateral_filter.frag.glsl?raw';
import normalFragSource from '../shaders/fluid/normal_reconstruction.frag.glsl?raw';
import shadingFragSource from '../shaders/fluid/fluid_shading.frag.glsl?raw';

export class FluidRenderer {
    constructor(gl, width, height) {
        this.gl = gl;
        this.width = width;
        this.height = height;

        console.log('[FluidRenderer] Initializing SSFR pipeline...');

        // Compile shader programs
        this._compilePrograms();

        // Create framebuffers for multi-pass rendering
        this._createFramebuffers();

        // Configuration parameters
        this.config = {
            filterRadius: 5.0,
            depthFalloff: 100.0,
            fresnelMin: 0.2,
            fresnelPower: 5.0,
            metalColor: [0.75, 0.78, 0.82], // Silver with slight blue
            lightDirection: [0.0, 0.0, 1.0]
        };

        console.log('[FluidRenderer] SSFR pipeline ready');
    }

    _compilePrograms() {
        const gl = this.gl;

        // Pass 1: Depth rendering program
        this.depthProgram = createProgram(
            gl,
            compileShader(gl, gl.VERTEX_SHADER, depthVertSource),
            compileShader(gl, gl.FRAGMENT_SHADER, depthFragSource)
        );

        // Pass 2: Bilateral filter program
        this.blurProgram = createProgram(
            gl,
            compileShader(gl, gl.VERTEX_SHADER, quadVertSource),
            compileShader(gl, gl.FRAGMENT_SHADER, bilateralFragSource)
        );

        // Pass 3: Normal reconstruction program
        this.normalProgram = createProgram(
            gl,
            compileShader(gl, gl.VERTEX_SHADER, quadVertSource),
            compileShader(gl, gl.FRAGMENT_SHADER, normalFragSource)
        );

        // Pass 4: Fluid shading program
        this.shadingProgram = createProgram(
            gl,
            compileShader(gl, gl.VERTEX_SHADER, quadVertSource),
            compileShader(gl, gl.FRAGMENT_SHADER, shadingFragSource)
        );

        console.log('[FluidRenderer] All shader programs compiled');
    }

    _createFramebuffers() {
        const gl = this.gl;

        // FBO for depth rendering
        this.depthFBO = this._createFloatFramebuffer(this.width, this.height);

        // FBOs for bilateral filtering (ping-pong)
        this.blurFBO1 = this._createFloatFramebuffer(this.width, this.height);
        this.blurFBO2 = this._createFloatFramebuffer(this.width, this.height);

        // FBO for normal map
        this.normalFBO = this._createFloatFramebuffer(this.width, this.height);

        console.log('[FluidRenderer] Framebuffers created');
    }

    _createFloatFramebuffer(width, height) {
        const gl = this.gl;

        // Create texture
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D, 0,
            gl.RGBA32F, // Float texture for precision
            width, height, 0,
            gl.RGBA, gl.FLOAT,
            null
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Create framebuffer
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0
        );

        // Create depth buffer
        const depthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
        gl.framebufferRenderbuffer(
            gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.RENDERBUFFER,
            depthBuffer
        );

        // Check framebuffer status
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('[FluidRenderer] Framebuffer incomplete:', status);
        }

        // Unbind
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        return { fbo, texture, depthBuffer };
    }

    /**
     * Render fluid surface from particle system
     */
    render(particleBuffer, particleCount, camera) {
        const gl = this.gl;

        // Pass 1: Render depth
        this._renderDepth(particleBuffer, particleCount, camera);

        // Pass 2: Bilateral filtering (2 passes: horizontal + vertical)
        this._bilateralFilter();

        // Pass 3: Reconstruct normals
        this._reconstructNormals(camera);

        // Pass 4: Render fluid surface with shading
        this._renderFluidSurface(camera);
    }

    _renderDepth(particleBuffer, particleCount, camera) {
        const gl = this.gl;

        // Bind depth FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFBO.fbo);
        gl.viewport(0, 0, this.width, this.height);

        // Clear
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Enable depth test for depth rendering
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.depthFunc(gl.LESS);

        // Use depth program
        gl.useProgram(this.depthProgram);

        // Set uniforms
        const uProjectionMatrix = gl.getUniformLocation(this.depthProgram, 'uProjectionMatrix');
        const uViewMatrix = gl.getUniformLocation(this.depthProgram, 'uViewMatrix');
        const uPointSize = gl.getUniformLocation(this.depthProgram, 'uPointSize');

        gl.uniformMatrix4fv(uProjectionMatrix, false, camera.projectionMatrix.elements);
        gl.uniformMatrix4fv(uViewMatrix, false, camera.matrixWorldInverse.elements);
        gl.uniform1f(uPointSize, 3.0); // Particle radius

        // Bind particle VAO (particleBuffer is an object with {vao, posBuffer, velBuffer})
        gl.bindVertexArray(particleBuffer.vao);

        // Render particles as points
        gl.drawArrays(gl.POINTS, 0, particleCount);

        // Cleanup - disable depth test for subsequent 2D passes
        gl.bindVertexArray(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.disable(gl.DEPTH_TEST);
    }

    _bilateralFilter() {
        const gl = this.gl;

        gl.useProgram(this.blurProgram);
        gl.disable(gl.DEPTH_TEST);

        const uDepthTexture = gl.getUniformLocation(this.blurProgram, 'uDepthTexture');
        const uTexelSize = gl.getUniformLocation(this.blurProgram, 'uTexelSize');
        const uFilterDirection = gl.getUniformLocation(this.blurProgram, 'uFilterDirection');
        const uFilterRadius = gl.getUniformLocation(this.blurProgram, 'uFilterRadius');
        const uDepthFalloff = gl.getUniformLocation(this.blurProgram, 'uDepthFalloff');

        gl.uniform2f(uTexelSize, 1.0 / this.width, 1.0 / this.height);
        gl.uniform1f(uFilterRadius, this.config.filterRadius);
        gl.uniform1f(uDepthFalloff, this.config.depthFalloff);

        // Horizontal pass: depthFBO -> blurFBO1
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO1.fbo);
        gl.viewport(0, 0, this.width, this.height);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.depthFBO.texture);
        gl.uniform1i(uDepthTexture, 0);
        gl.uniform2f(uFilterDirection, 1.0, 0.0); // Horizontal

        this._drawFullscreenQuad();

        // Vertical pass: blurFBO1 -> blurFBO2
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO2.fbo);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.bindTexture(gl.TEXTURE_2D, this.blurFBO1.texture);
        gl.uniform2f(uFilterDirection, 0.0, 1.0); // Vertical

        this._drawFullscreenQuad();

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    _reconstructNormals(camera) {
        const gl = this.gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.normalFBO.fbo);
        gl.viewport(0, 0, this.width, this.height);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.normalProgram);

        const uDepthTexture = gl.getUniformLocation(this.normalProgram, 'uDepthTexture');
        const uTexelSize = gl.getUniformLocation(this.normalProgram, 'uTexelSize');
        const uProjectionMatrix = gl.getUniformLocation(this.normalProgram, 'uProjectionMatrix');

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.blurFBO2.texture);
        gl.uniform1i(uDepthTexture, 0);
        gl.uniform2f(uTexelSize, 1.0 / this.width, 1.0 / this.height);
        gl.uniformMatrix4fv(uProjectionMatrix, false, camera.projectionMatrix.elements);

        this._drawFullscreenQuad();

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    _renderFluidSurface(camera) {
        const gl = this.gl;

        // Render to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);

        // Disable depth test for final composite
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);

        // Enable alpha blending
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(this.shadingProgram);

        const uNormalTexture = gl.getUniformLocation(this.shadingProgram, 'uNormalTexture');
        const uDepthTexture = gl.getUniformLocation(this.shadingProgram, 'uDepthTexture');
        const uLightDirection = gl.getUniformLocation(this.shadingProgram, 'uLightDirection');
        const uFresnelMin = gl.getUniformLocation(this.shadingProgram, 'uFresnelMin');
        const uFresnelPower = gl.getUniformLocation(this.shadingProgram, 'uFresnelPower');
        const uMetalColor = gl.getUniformLocation(this.shadingProgram, 'uMetalColor');

        // Bind textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.normalFBO.texture);
        gl.uniform1i(uNormalTexture, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.blurFBO2.texture);
        gl.uniform1i(uDepthTexture, 1);

        // Set material parameters
        gl.uniform3fv(uLightDirection, this.config.lightDirection);
        gl.uniform1f(uFresnelMin, this.config.fresnelMin);
        gl.uniform1f(uFresnelPower, this.config.fresnelPower);
        gl.uniform3fv(uMetalColor, this.config.metalColor);

        this._drawFullscreenQuad();
    }

    _drawFullscreenQuad() {
        const gl = this.gl;
        // Draw fullscreen triangle (no VAO needed, uses gl_VertexID)
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /**
     * Update resolution (call on window resize)
     */
    resize(width, height) {
        this.width = width;
        this.height = height;

        // Recreate framebuffers with new size
        this._destroyFramebuffers();
        this._createFramebuffers();

        console.log(`[FluidRenderer] Resized to ${width}x${height}`);
    }

    _destroyFramebuffers() {
        const gl = this.gl;

        const fbos = [this.depthFBO, this.blurFBO1, this.blurFBO2, this.normalFBO];
        fbos.forEach(fbo => {
            if (fbo) {
                gl.deleteTexture(fbo.texture);
                gl.deleteRenderbuffer(fbo.depthBuffer);
                gl.deleteFramebuffer(fbo.fbo);
            }
        });
    }

    /**
     * Cleanup resources
     */
    dispose() {
        const gl = this.gl;

        this._destroyFramebuffers();

        gl.deleteProgram(this.depthProgram);
        gl.deleteProgram(this.blurProgram);
        gl.deleteProgram(this.normalProgram);
        gl.deleteProgram(this.shadingProgram);

        console.log('[FluidRenderer] Resources disposed');
    }
}
