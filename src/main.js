/**
 * Mercury - GPU Particle Fluid System
 * Main application entry point - Refactored for particle-based rendering
 */

import '../styles.css';
import * as THREE from 'three';
import { getCameraStream, createVideoElement, stopCameraStream } from './utils/camera.js';
import { SensorManager } from './utils/sensors.js';
import { TouchManager } from './utils/touch.js';
import { ParticleSystem } from './core/ParticleSystem.js';
import { ParticleRenderer } from './renderers/ParticleRenderer.js';
import { FluidRenderer } from './renderers/FluidRenderer.js'; // Added FluidRenderer import
import { ShapeManager } from './core/ShapeManager.js';

// Load shaders as raw text
import particleUpdateShader from './shaders/particles/particle_update.vert.glsl?raw';
import particleUpdateFragShader from './shaders/particles/particle_update.frag.glsl?raw';
import particleRenderVert from './shaders/rendering/particle_render.vert.glsl?raw';
import particleRenderFrag from './shaders/rendering/particle_render.frag.glsl?raw';

class MercuryApp {
    constructor() {
        // Global error handler for mobile debugging
        window.onerror = (msg, url, lineNo, columnNo, error) => {
            const string = msg.toLowerCase();
            const substring = "script error";
            if (string.indexOf(substring) > -1) {
                this.showError('Script Error: See Console for details');
            } else {
                this.showError(`${msg}\nLine: ${lineNo}`);
            }
            return false;
        };

        window.onunhandledrejection = (event) => {
            this.showError(`Async Error: ${event.reason}`);
        };

        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // GPU Particle System
        this.particleSystem = null;
        this.particleRenderer = null;
        this.fluidRenderer = null; // Added fluidRenderer declaration
        this.updateProgram = null;
        this.shapeManager = null;

        // Shape morphing state
        this.currentShapeIndex = 0;
        this.shapes = ['sphere', 'cube', 'torus', 'heart'];
        this.shapeAttractionTarget = 0.8; // Target attraction strength

        this.cameraStream = null;
        this.sensorManager = new SensorManager();
        this.touchManager = new TouchManager(5);

        this.clock = new THREE.Clock();
        this.isRunning = false;
        this.lastTime = 0;

        // Drag state
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.cardPosition = { x: 0, y: 0 };

        // Configuration
        this.config = {
            particleCount: 30000,
            pointSize: 8.0,  // Increased for visibility
            damping: 0.98,
            bounce: 0.3
        };

        // DOM elements
        this.phoneCard = document.getElementById('phone-card');
        this.canvasContainer = document.getElementById('canvas-container');
        this.canvas = document.getElementById('mercury-canvas');
        this.permissionOverlay = document.getElementById('permission-overlay');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.errorOverlay = document.getElementById('error-overlay');
        this.errorMessage = document.getElementById('error-message');
        this.startBtn = document.getElementById('start-btn');
        this.retryBtn = document.getElementById('retry-btn');
        this.shapeSwitchBtn = document.getElementById('shape-switch-btn');

        this.bindEvents();
        this.initDrag();
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.start());
        this.retryBtn.addEventListener('click', () => this.start());
        this.shapeSwitchBtn.addEventListener('click', () => this.switchToNextShape());
        window.addEventListener('resize', () => this.onResize());
    }

    initDrag() {
        const card = this.phoneCard;

        // Mouse events
        card.addEventListener('mousedown', (e) => this.onDragStart(e));
        document.addEventListener('mousemove', (e) => this.onDragMove(e));
        document.addEventListener('mouseup', () => this.onDragEnd());

        // Touch events
        card.addEventListener('touchstart', (e) => this.onDragStart(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.onDragMove(e), { passive: false });
        document.addEventListener('touchend', () => this.onDragEnd());
    }

    onDragStart(e) {
        if (e.target === this.canvas) return;

        this.isDragging = true;
        this.phoneCard.classList.add('dragging');

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const rect = this.phoneCard.getBoundingClientRect();
        this.dragStart.x = clientX - rect.left - rect.width / 2;
        this.dragStart.y = clientY - rect.top - rect.height / 2;
    }

    onDragMove(e) {
        if (!this.isDragging) return;

        e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x = clientX - this.dragStart.x - this.phoneCard.offsetWidth / 2;
        const y = clientY - this.dragStart.y - this.phoneCard.offsetHeight / 2;

        this.cardPosition.x = x;
        this.cardPosition.y = y;

        this.phoneCard.style.left = `${x}px`;
        this.phoneCard.style.top = `${y}px`;
        this.phoneCard.style.transform = 'none';
    }

    onDragEnd() {
        this.isDragging = false;
        this.phoneCard.classList.remove('dragging');
    }

    async start() {
        this.showLoading();

        try {
            // Initialize Three.js first
            this.initThree();

            // Create GPU particle system
            await this.createParticleSystem();

            // Try to request permissions (optional)
            try {
                await this.requestPermissions();
            } catch (permError) {
                console.warn('Permissions denied, running in fallback mode:', permError);
            }

            // Bind touch events to canvas
            this.touchManager.bind(this.canvas);

            // Start sensors
            this.sensorManager.start();

            // Hide overlays and start animation
            this.hideOverlays();
            this.isRunning = true;
            this.animate();

        } catch (error) {
            console.error('Critical initialization error:', error);
            this.showError(error.message);
        }
    }

    async requestPermissions() {
        // Request camera (for future environment mapping)
        this.cameraStream = await getCameraStream(true);
        const video = await createVideoElement(this.cameraStream);

        video.style.position = 'absolute';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        video.style.zIndex = '-1';
        document.body.appendChild(video);

        // Request orientation permission (iOS)
        await this.sensorManager.requestPermission();
    }

    initThree() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0f);

        // Get canvas container dimensions
        const container = this.canvasContainer;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Camera
        const aspect = width / height;
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        this.camera.position.z = 2.5;

        // Renderer - WebGL 2.0 required
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            context: this.canvas.getContext('webgl2')
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        console.log('[Mercury] Three.js initialized with WebGL 2.0');
    }

    async createParticleSystem() {
        console.log('[Mercury] Creating GPU particle system...');

        // Create particle system
        this.particleSystem = new ParticleSystem(this.config.particleCount);
        this.particleSystem.init(this.renderer);

        // Compile update program with Transform Feedback
        this.updateProgram = this.compileUpdateProgram();

        // Setup Transform Feedback
        this.particleSystem.setupTransformFeedback(this.updateProgram);

        // Create particle renderer (kept as fallback)
        this.particleRenderer = new ParticleRenderer(this.particleSystem);
        this.particleRenderer.init(this.renderer, particleRenderVert, particleRenderFrag);
        this.particleRenderer.setPointSize(this.config.pointSize);
        this.particleRenderer.setResolution(
            this.canvasContainer.clientWidth,
            this.canvasContainer.clientHeight
        );

        // Create fluid renderer (SSFR pipeline)
        const gl = this.renderer.getContext();
        this.fluidRenderer = new FluidRenderer(
            gl,
            this.canvasContainer.clientWidth,
            this.canvasContainer.clientHeight
        );

        // Create shape manager
        this.shapeManager = new ShapeManager(this.config.particleCount);

        // Set initial shape (sphere)
        const { data, size } = this.shapeManager.createTargetTexture();
        this.particleSystem.setShapeTarget(data, size);
        this.particleSystem.setShapeAttraction(0.0); // Start with free particles

        console.log('[Mercury] GPU particle system with SSFR created successfully');
    }

    compileUpdateProgram() {
        const gl = this.renderer.getContext();

        // Compile vertex shader
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, particleUpdateShader);
        gl.compileShader(vertexShader);

        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            console.error('[Mercury] Update shader error:', gl.getShaderInfoLog(vertexShader));
            throw new Error('Update shader compilation failed');
        }

        // Compile fragment shader (required for linking, even with RASTERIZER_DISCARD)
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, particleUpdateFragShader);
        gl.compileShader(fragmentShader);

        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            console.error('[Mercury] Update fragment shader error:', gl.getShaderInfoLog(fragmentShader));
            throw new Error('Update fragment shader compilation failed');
        }

        // Create program
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);

        // Specify Transform Feedback varyings BEFORE linking
        gl.transformFeedbackVaryings(program, ['vPosition', 'vVelocity'], gl.SEPARATE_ATTRIBS);

        // Link program
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('[Mercury] Update program link error:', gl.getProgramInfoLog(program));
            throw new Error('Update program linking failed');
        }

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        return program;
    }

    animate() {
        if (!this.isRunning) return;

        requestAnimationFrame(() => this.animate());

        const currentTime = this.clock.getElapsedTime();
        const deltaTime = Math.min(currentTime - this.lastTime, 0.033); // Cap at 30 FPS
        this.lastTime = currentTime;

        // Update particle system uniforms
        this.particleSystem.uniforms.uTime = currentTime;

        // Update gravity from sensors
        const gravity = this.sensorManager.getGravity();
        this.particleSystem.setGravity(gravity.x, gravity.y, gravity.z);

        // Update touch points
        this.touchManager.update();
        const touchData = this.touchManager.getUniformData();
        const touchPoints = [];
        for (let i = 0; i < 5; i++) {
            touchPoints.push(new THREE.Vector4(
                touchData[i * 4 + 0],
                touchData[i * 4 + 1],
                touchData[i * 4 + 2],
                touchData[i * 4 + 3]
            ));
        }
        this.particleSystem.setTouchPoints(touchPoints);

        // Gradually increase shape attraction (smooth morph)
        const currentAttraction = this.particleSystem.uniforms.uShapeAttraction;
        if (currentAttraction < this.shapeAttractionTarget) {
            const newAttraction = Math.min(
                currentAttraction + deltaTime * 0.5, // Speed: 0.5/sec
                this.shapeAttractionTarget
            );
            this.particleSystem.setShapeAttraction(newAttraction);
        }

        // Update particles using Transform Feedback
        this.particleSystem.update(deltaTime, this.updateProgram);

        // Update camera matrices (required for custom rendering)
        this.camera.updateMatrixWorld();
        this.camera.updateProjectionMatrix();

        // Clear canvas before rendering fluid
        const gl = this.renderer.getContext();
        gl.clearColor(0.039, 0.039, 0.059, 1.0); // #0a0a0f - dark background
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Render fluid surface using SSFR
        this.renderer.autoClear = false;
        this.fluidRenderer.render(
            this.particleSystem.getCurrentBuffer(),
            this.config.particleCount,
            this.camera
        );

        // Note: particleRenderer disabled to show pure SSFR fluid effect
        // Uncomment below line to show debug particles
        // this.particleRenderer.render(this.camera);
    }

    /**
     * Switch to next shape
     */
    switchToNextShape() {
        if (!this.shapeManager) return;

        this.currentShapeIndex = (this.currentShapeIndex + 1) % this.shapes.length;
        const shapeName = this.shapes[this.currentShapeIndex];

        // Update shape
        this.shapeManager.updateShape(shapeName);
        const { data, size } = this.shapeManager.createTargetTexture();
        this.particleSystem.setShapeTarget(data, size);

        // Reset attraction to animate morph
        this.particleSystem.setShapeAttraction(0.0);

        console.log(`[Mercury] Morphing to: ${shapeName}`);
    }

    onResize() {
        if (!this.camera || !this.renderer || !this.canvasContainer) return;

        const width = this.canvasContainer.clientWidth;
        const height = this.canvasContainer.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);

        if (this.particleRenderer) {
            this.particleRenderer.setResolution(width, height);
        }

        // Resize fluid renderer framebuffers
        if (this.fluidRenderer) {
            this.fluidRenderer.resize(width, height);
        }
    }

    showLoading() {
        this.permissionOverlay.classList.add('hidden');
        this.errorOverlay.classList.add('hidden');
        this.loadingOverlay.classList.remove('hidden');
    }

    hideOverlays() {
        this.permissionOverlay.classList.add('hidden');
        this.loadingOverlay.classList.add('hidden');
        this.errorOverlay.classList.add('hidden');
    }

    showError(message) {
        this.loadingOverlay.classList.add('hidden');
        this.permissionOverlay.classList.add('hidden');
        this.errorMessage.textContent = message;
        this.errorOverlay.classList.remove('hidden');
    }

    dispose() {
        this.isRunning = false;

        if (this.cameraStream) {
            stopCameraStream(this.cameraStream);
        }

        this.sensorManager.stop();

        if (this.particleSystem) {
            this.particleSystem.dispose();
        }

        if (this.particleRenderer) {
            this.particleRenderer.dispose();
        }

        if (this.updateProgram) {
            this.renderer.getContext().deleteProgram(this.updateProgram);
        }

        if (this.renderer) {
            this.renderer.dispose();
        }
    }
}

// Initialize app
const app = new MercuryApp();
