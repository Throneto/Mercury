import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
    plugins: [
        glsl(),
        basicSsl()
    ],
    server: {
        host: true, // Allow network access for mobile testing
        port: 5173,
        https: true // Enable HTTPS for camera/sensors on Safari
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets'
    }
});
