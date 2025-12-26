#version 300 es
precision highp float;

// Input from vertex shader
in vec3 vVelocity;
in float vId;

// Uniforms
uniform vec3 uColor;
uniform vec2 uResolution;

// Output
out vec4 fragColor;

void main() {
    // Calculate distance from center of point sprite
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    
    // Discard pixels outside circle (create round particles)
    if (dist > 0.5) {
        discard;
    }
    
    // Soft edge falloff for smooth appearance
    float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
    
    // Calculate brightness based on velocity (faster = brighter)
    float speed = length(vVelocity);
    float brightness = 2.5 + speed * 0.5;
    
    // Bright silver/mercury color - much more visible
    vec3 baseColor = vec3(0.9, 0.95, 1.0); // Bright bluish silver
    vec3 color = baseColor * brightness;
    
    // Add strong specular highlight at center
    float highlight = 1.0 - smoothstep(0.0, 0.3, dist);
    color += vec3(1.5) * highlight;
    
    // Output final color with high opacity
    fragColor = vec4(color, alpha);
}
