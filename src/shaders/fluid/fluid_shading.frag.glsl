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
    // Read normal from texture (convert from [0,1] to [-1,1])
    vec4 normalData = texture(uNormalTexture, vTexCoord);
    
    // Check if background
    if (normalData.a == 0.0) {
        discard;
    }
    
    vec3 normal = normalize(normalData.rgb * 2.0 - 1.0);
    
    // View direction (approximate, since we are in screen space and assuming orthographic-ish projection for the fluid surface)
    // For better effects, we should pass the actual view ray, but typically for SSFR facing +Z is "ok"
    // However, to make reflections interesting, we need a world-space normal.
    // The normal texture is likely in View Space.
    // Let's assume view space normal for now.
    
    vec3 viewDir = vec3(0.0, 0.0, 1.0); // Facing camera
    
    // --- PBR / Studio Lighting Setup ---
    
    // 1. Calculate Reflection Vector
    // We reflect the view vector off the normal
    vec3 reflectDir = reflect(-viewDir, normal);
    
    // 2. Procedural Studio Environment Map
    // We simulate a "Softbox" setup:
    // - Top light (large softbox)
    // - Two Rim lights (left/right)
    // - Dark floor/ambient
    
    float envLight = 0.0;
    
    // Top Softbox
    float topLight = smoothstep(0.4, 1.0, reflectDir.y);
    envLight += topLight * 2.0;
    
    // Rim Lights (Left/Right)
    float rimLight = smoothstep(0.6, 1.0, abs(reflectDir.x));
    envLight += rimLight * 1.5;
    
    // Horizon / Front fill (adds volume)
    float frontLight = smoothstep(0.8, 1.0, reflectDir.z);
    envLight += frontLight * 0.5;
    
    // Darken bottom (absorption/floor)
    float bottomDarkness = smoothstep(-0.2, -1.0, reflectDir.y);
    envLight *= (1.0 - bottomDarkness * 0.8);
    
    // 3. Fresnel Effect (Schlick)
    // Graphite/Chrome F0 is approx 0.5-1.0
    float F0 = 0.8; 
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), uFresnelPower);
    float F = mix(F0, 1.0, fresnel);
    
    // 4. Combine
    // Liquid metal is purely specular (metallic workflow), very little diffuse.
    vec3 reflectionColor = vec3(envLight);
    
    // Add "Chromatic Aberration" at edges for "thick glass/liquid" feel
    // We just tint the reflection slightly at grazing angles
    vec3 dispersion = vec3(0.0);
    dispersion.r = smoothstep(0.0, 1.0, fresnel) * 0.1;
    dispersion.b = smoothstep(0.0, 1.0, fresnel) * -0.1;
    
    vec3 finalColor = uMetalColor * reflectionColor + dispersion;
    
    // Apply Fresnel intensity
    finalColor = mix(uMetalColor * 0.1, finalColor, F); // Base color at normal incidence, Reflection at grazing
    
    // Boost highlights for "sparkle"
    finalColor += pow(envLight, 3.0) * 0.5;

    // Ambient Occlusion approximation (from normal Z)
    // Edges (low Z) get darkened slightly less, deep crevices get dark
    float ao = smoothstep(0.0, 1.0, normal.z);
    finalColor *= (0.2 + 0.8 * ao);

    fragColor = vec4(finalColor, 1.0);
}
