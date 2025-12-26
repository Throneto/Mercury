#version 300 es
precision highp float;

// Input from vertex shader
in vec3 vViewPosition;
in float vParticleRadius;

// Uniforms
uniform mat4 uProjectionMatrix;

// Output
out vec4 fragColor;

void main() {
    // Calculate normal from point sprite coordinate
    vec3 normal;
    normal.xy = gl_PointCoord * 2.0 - 1.0;
    
    // Calculate radius squared
    float r2 = dot(normal.xy, normal.xy);
    
    // Discard pixels outside circle (create spherical particles)
    if (r2 > 1.0) discard;
    
    // Calculate z component of normal (sphere equation: x² + y² + z² = 1)
    normal.z = sqrt(1.0 - r2);
    
    // Calculate pixel position in view space (sphere surface)
    vec3 pixelViewPos = vViewPosition + normal * vParticleRadius;
    
    // Project to clip space to get depth
    vec4 clipPos = uProjectionMatrix * vec4(pixelViewPos, 1.0);
    
    // Calculate normalized device coordinate depth
    float depth = clipPos.z / clipPos.w;
    
    // Write depth to gl_FragDepth (convert from [-1,1] to [0,1])
    gl_FragDepth = depth * 0.5 + 0.5;
    
    // Output eye-space depth for bilateral filtering
    // Store as color for easy texture read in next pass
    fragColor = vec4(pixelViewPos.z, 0.0, 0.0, 1.0);
}
