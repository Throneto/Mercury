/**
 * Mercury - Liquid Metal WebGL Experience
 * Main application entry point
 */

import '../styles.css';
import * as THREE from 'three';
import { getCameraStream, createVideoElement, stopCameraStream } from './utils/camera.js';
import { SensorManager } from './utils/sensors.js';
import { TouchManager } from './utils/touch.js';

// Shader sources (loaded via vite-plugin-glsl)
import vertexShader from './shaders/vertex.glsl';
import fragmentShader from './shaders/fragment.glsl';

class MercuryApp {
    constructor() {
        // ... (existing constructor code)

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
        this.mesh = null;
        this.material = null;

        this.cameraStream = null;
        this.videoTexture = this.createFallbackTexture(); // Start with fallback
        this.sensorManager = new SensorManager();
        this.touchManager = new TouchManager(5);

        this.clock = new THREE.Clock();
        this.isRunning = false;

        // Drag state
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.cardPosition = { x: 0, y: 0 };

        // Configuration
        // Configuration
        this.config = {
            fillLevel: 0.33,        // Mercury fills bottom 1/3 of the sphere
            waveIntensity: 0.18,
            sphereDetail: 96,
            springStrength: 0.15,   // Spring stiffness for wobble
            damping: 0.85           // Damping factor (0-1)
        };

        // Physics state for wobble effect
        this.currentGravity = new THREE.Vector3(0, -1, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);

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

        this.bindEvents();
        this.initDrag();
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.start());
        this.retryBtn.addEventListener('click', () => this.start());
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
        // Don't drag if clicking on canvas (for mercury interaction)
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
            // Initialize Three.js first so we have something to show
            this.initThree();
            await this.createMercury(); // Create mercury with fallback texture

            // Try to request permissions, but don't fade out if failed
            try {
                await this.requestPermissions();
            } catch (permError) {
                console.warn('Permissions denied, running in fallback mode:', permError);
                // Don't show error overlay, just run with fallback
            }

            // Bind touch events to canvas for mercury interaction
            this.touchManager.bind(this.canvas);

            // Start sensors (if allowed)
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

    createFallbackTexture() {
        // Create a simple gradient canvas as fallback environment
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Simple silver/grey gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 512);
        gradient.addColorStop(0.0, '#ffffff');
        gradient.addColorStop(0.5, '#808080');
        gradient.addColorStop(1.0, '#202020');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    async requestPermissions() {
        // Request camera
        this.cameraStream = await getCameraStream(true);
        const video = await createVideoElement(this.cameraStream);

        // iOS Safari fix: Video must be in DOM to play reliably
        video.style.position = 'absolute';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        video.style.zIndex = '-1';
        document.body.appendChild(video);

        // Create video texture
        const newTexture = new THREE.VideoTexture(video);
        newTexture.minFilter = THREE.LinearFilter;
        newTexture.magFilter = THREE.LinearFilter;
        newTexture.format = THREE.RGBAFormat;

        // Update texture reference
        this.videoTexture = newTexture;

        // Update material if already created
        if (this.material) {
            this.material.uniforms.uCameraTexture.value = this.videoTexture;
        }

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

        // Camera - adjust for phone card aspect ratio
        const aspect = width / height;
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        this.camera.position.z = 2.5;

        // Renderer - sized to canvas container
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    async createMercury() {
        // Get container dimensions for resolution uniform
        const width = this.canvasContainer.clientWidth;
        const height = this.canvasContainer.clientHeight;

        // Create sphere geometry with high detail for smooth deformation
        const geometry = new THREE.SphereGeometry(1, this.config.sphereDetail, this.config.sphereDetail);

        // Custom shader material with transparency for collapsed areas
        this.material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            uniforms: {
                uTime: { value: 0 },
                uGravity: { value: new THREE.Vector3(0, -1, 0) },
                uTouchPoints: { value: new Array(5).fill(new THREE.Vector4(0, 0, 0, 0)) },
                uCameraTexture: { value: this.videoTexture },
                uResolution: { value: new THREE.Vector2(width, height) },
                uWaveIntensity: { value: this.config.waveIntensity },
                uFillLevel: { value: this.config.fillLevel },
                uVelocity: { value: new THREE.Vector3(0, 0, 0) }, // For stretching effect
                uDeviceTilt: { value: new THREE.Vector3(0, 0, 0) }, // For parallax effect
                uCameraPosition: { value: this.camera.position }
            }
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.scene.add(this.mesh);
    }

    animate() {
        if (!this.isRunning) return;

        requestAnimationFrame(() => this.animate());

        const elapsed = this.clock.getElapsedTime();

        // Update uniforms
        this.material.uniforms.uTime.value = elapsed;

        // Update gravity from sensors
        const targetGravity = this.sensorManager.getGravity();
        const rawGravity = this.sensorManager.getRawGravity();

        // Update device tilt for parallax (no inertia)
        this.material.uniforms.uDeviceTilt.value.set(
            rawGravity.x,
            rawGravity.y,
            rawGravity.z
        );

        // Spring Physics System for Jelly-like Wobble
        const targetVec = new THREE.Vector3(targetGravity.x, targetGravity.y, targetGravity.z);

        // Calculate spring force: (target - current) * strength
        const force = new THREE.Vector3()
            .subVectors(targetVec, this.currentGravity)
            .multiplyScalar(this.config.springStrength);

        // Apply force to velocity and apply damping
        this.velocity.add(force).multiplyScalar(this.config.damping);

        // Apply velocity to current position (Euler integration)
        this.currentGravity.add(this.velocity);

        // Normalize to keep it a direction vector, but magnitude matters for wobble
        // We pass the raw "wobbly" gravity to shader for position calculation

        // Update uniforms
        this.material.uniforms.uGravity.value.copy(this.currentGravity);

        // Pass velocity for dynamic stretching (motion blur/deformation)
        // Scale it up to make the effect visible
        this.material.uniforms.uVelocity.value.copy(this.velocity).multiplyScalar(1.5);

        // Update touch points
        this.touchManager.update();
        const touchData = this.touchManager.getUniformData();
        for (let i = 0; i < 5; i++) {
            this.material.uniforms.uTouchPoints.value[i] = new THREE.Vector4(
                touchData[i * 4 + 0],
                touchData[i * 4 + 1],
                touchData[i * 4 + 2],
                touchData[i * 4 + 3]
            );
        }

        // Subtle rotation for visual interest
        this.mesh.rotation.y = Math.sin(elapsed * 0.1) * 0.05;
        this.mesh.rotation.x = Math.cos(elapsed * 0.15) * 0.03;

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        if (!this.camera || !this.renderer || !this.canvasContainer) return;

        const width = this.canvasContainer.clientWidth;
        const height = this.canvasContainer.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);

        if (this.material) {
            this.material.uniforms.uResolution.value.set(width, height);
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

        if (this.renderer) {
            this.renderer.dispose();
        }

        if (this.material) {
            this.material.dispose();
        }

        if (this.mesh && this.mesh.geometry) {
            this.mesh.geometry.dispose();
        }
    }
}

// Initialize app
const app = new MercuryApp();
