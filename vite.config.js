import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
    plugins: [
        glsl()
    ],
    server: {
        host: true, // Allow network access for mobile testing
        port: 5173,
        https: false // Set to true if you need HTTPS for camera/sensors
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets'
    }
});
