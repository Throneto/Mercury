#version 300 es
precision highp float;

// Input attributes
in vec3 aPosition;
in vec3 aVelocity;
in float aId;

// Uniforms
uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;
uniform float uPointSize;

// Output to fragment shader
out vec3 vVelocity;
out float vId;

void main() {
    // Transform position to clip space
    vec4 mvPosition = uModelViewMatrix * vec4(aPosition, 1.0);
    gl_Position = uProjectionMatrix * mvPosition;
    
    // Calculate point size with distance attenuation
    // Keep size reasonable (hardware limit is usually 255)
    float dist = max(length(mvPosition.xyz), 0.1);
    float size = uPointSize * (2.0 / dist);
    gl_PointSize = clamp(size, 1.0, 100.0); // Clamp to safe range
    
    // Pass data to fragment shader
    vVelocity = aVelocity;
    vId = aId;
}
