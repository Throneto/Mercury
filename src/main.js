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

        // Configuration
        this.config = {
            fillLevel: 0.33, // 2/3 filled means liquid level at -0.33
            waveIntensity: 0.08,
            sphereDetail: 128
        };

        // DOM elements
        this.canvas = document.getElementById('mercury-canvas');
        this.permissionOverlay = document.getElementById('permission-overlay');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.errorOverlay = document.getElementById('error-overlay');
        this.errorMessage = document.getElementById('error-message');
        this.startBtn = document.getElementById('start-btn');
        this.retryBtn = document.getElementById('retry-btn');

        this.bindEvents();
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.start());
        this.retryBtn.addEventListener('click', () => this.start());
        window.addEventListener('resize', () => this.onResize());
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

            // Bind touch events
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

        // Camera
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
        this.camera.position.z = 3;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    async createMercury() {
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
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
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
        if (!this.camera || !this.renderer) return;

        const width = window.innerWidth;
        const height = window.innerHeight;

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
