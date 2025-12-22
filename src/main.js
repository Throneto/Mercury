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
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.mesh = null;
        this.material = null;

        this.cameraStream = null;
        this.videoTexture = null;
        this.sensorManager = new SensorManager();
        this.touchManager = new TouchManager(5);

        this.clock = new THREE.Clock();
        this.isRunning = false;

        // Drag state
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.cardPosition = { x: 0, y: 0 };

        // Configuration
        this.config = {
            fillLevel: -0.5, // Mercury fills lower portion
            waveIntensity: 0.18,
            sphereDetail: 96
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
            // Request permissions
            await this.requestPermissions();

            // Initialize Three.js
            this.initThree();

            // Create mercury sphere
            await this.createMercury();

            // Bind touch events to canvas for mercury interaction
            this.touchManager.bind(this.canvas);

            // Start sensors
            this.sensorManager.start();

            // Hide overlays and start animation
            this.hideOverlays();
            this.isRunning = true;
            this.animate();

        } catch (error) {
            console.error('Initialization error:', error);
            this.showError(error.message);
        }
    }

    async requestPermissions() {
        // Request camera
        this.cameraStream = await getCameraStream(true);
        const video = await createVideoElement(this.cameraStream);

        // Create video texture
        this.videoTexture = new THREE.VideoTexture(video);
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;
        this.videoTexture.format = THREE.RGBAFormat;

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

        // Custom shader material
        this.material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uGravity: { value: new THREE.Vector3(0, -1, 0) },
                uTouchPoints: { value: new Array(5).fill(new THREE.Vector4(0, 0, 0, 0)) },
                uCameraTexture: { value: this.videoTexture },
                uResolution: { value: new THREE.Vector2(width, height) },
                uWaveIntensity: { value: this.config.waveIntensity },
                uFillLevel: { value: this.config.fillLevel },
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
        const gravity = this.sensorManager.getGravity();
        this.material.uniforms.uGravity.value.set(gravity.x, gravity.y, gravity.z);

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
