#version 300 es
precision highp float;

// Particle attributes from Transform Feedback buffer
in vec3 aPosition;
in vec3 aVelocity;
in float aId;

// Uniforms
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform float uPointSize;

// Output to fragment shader
out vec3 vViewPosition;
out float vParticleRadius;

void main() {
    // Transform to view space
    vec4 viewPosition = uViewMatrix * vec4(aPosition, 1.0);
    vViewPosition = viewPosition.xyz;
    
    // Project to clip space
    gl_Position = uProjectionMatrix * viewPosition;
    
    // Calculate point size based on distance
    float dist = max(length(viewPosition.xyz), 0.1);
    float size = uPointSize * (2.0 / dist);
    gl_PointSize = clamp(size, 1.0, 100.0);
    
    // Particle radius in view space for fragment shader
    vParticleRadius = uPointSize * 0.01; // Approximate radius
}
