#version 300 es
precision highp float;

// Input
in vec2 vTexCoord;

// Uniforms
uniform sampler2D uNormalTexture;
uniform sampler2D uDepthTexture;
uniform vec3 uCameraPosition;
uniform vec3 uLightDirection;
uniform float uFresnelMin;
uniform float uFresnelPower;
uniform vec3 uMetalColor;

// Output
out vec4 fragColor;

void main() {
    // DEBUG: Visualize depth texture
    float depth = texture(uDepthTexture, vTexCoord).r;
    
    // If depth > 0, show in red; otherwise blue background
    if (depth > 0.0) {
        fragColor = vec4(depth * 100.0, 0.0, 0.0, 1.0); // Red = has depth
    } else {
        fragColor = vec4(0.0, 0.0, 0.1, 1.0); // Blue = background
    }
    return;
    
    // Read normal from texture (convert from [0,1] to [-1,1])
    vec4 normalData = texture(uNormalTexture, vTexCoord);
    
    // Check if background
    if (normalData.a == 0.0) {
        discard;
    }
    
    vec3 normal = normalize(normalData.rgb * 2.0 - 1.0);
    
    // View direction (towards camera)
    vec3 viewDir = vec3(0.0, 0.0, 1.0); // In view space, camera looks down -Z
    
    // Calculate Fresnel effect (Schlick's approximation)
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), uFresnelPower);
    fresnel = mix(uFresnelMin, 1.0, fresnel);
    
    // Specular reflection
    vec3 reflectDir = reflect(-uLightDirection, normal);
    float specular = pow(max(dot(reflectDir, viewDir), 0.0), 128.0);
    
    // Base metal color with slight blue tint (mercury-like)
    vec3 baseColor = uMetalColor;
    
    // Add specular highlights
    vec3 highlightColor = vec3(1.0, 1.0, 1.0);
    vec3 color = mix(baseColor, highlightColor, specular * 0.5);
    
    // Apply Fresnel for edge glow
    color = mix(color, highlightColor, fresnel * 0.3);
    
    // Simple ambient occlusion approximation (darker in concave areas)
    float ao = 1.0 - abs(normal.z) * 0.2;
    color *= ao;
    
    fragColor = vec4(color, 1.0);
}
