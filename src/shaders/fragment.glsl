precision highp float;

// Uniforms
uniform sampler2D uCameraTexture;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uGravity;
uniform float uFillLevel;
uniform vec3 uCameraPosition;

// Varyings
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying float vDisplacement;

// Mercury colors - highly reflective silver
const vec3 mercuryBase = vec3(0.85, 0.88, 0.92);
const vec3 mercuryDark = vec3(0.25, 0.28, 0.35);
const vec3 mercuryHighlight = vec3(1.0, 1.0, 1.0);
const vec3 mercuryTint = vec3(0.7, 0.75, 0.85);

// Environment colors
const vec3 envTop = vec3(0.6, 0.65, 0.75);
const vec3 envMid = vec3(0.3, 0.35, 0.45);
const vec3 envBottom = vec3(0.1, 0.12, 0.18);

// Schlick's Fresnel approximation for metals
float fresnelSchlick(float cosTheta, float F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

// GGX/Trowbridge-Reitz normal distribution
float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    
    float denom = NdotH2 * (a2 - 1.0) + 1.0;
    return a2 / (3.14159265 * denom * denom);
}

// Flowing caustic pattern for liquid metal
float caustic(vec2 uv, float time) {
    float c = 0.0;
    
    // Octave 0 (scale = 1.0, speed = 0.3)
    vec2 p0 = uv * 1.0 + time * 0.3 * vec2(0.3, 0.2);
    c += sin(p0.x * 3.0 + sin(p0.y * 2.5 + time)) * 
         sin(p0.y * 2.8 + sin(p0.x * 2.2 + time * 0.7));
    
    // Octave 1 (scale = 1.5, speed = 0.4)
    vec2 p1 = uv * 1.5 + time * 0.4 * vec2(0.3, 0.2);
    c += sin(p1.x * 3.0 + sin(p1.y * 2.5 + time)) * 
         sin(p1.y * 2.8 + sin(p1.x * 2.2 + time * 0.7));
    
    // Octave 2 (scale = 2.0, speed = 0.5)
    vec2 p2 = uv * 2.0 + time * 0.5 * vec2(0.3, 0.2);
    c += sin(p2.x * 3.0 + sin(p2.y * 2.5 + time)) * 
         sin(p2.y * 2.8 + sin(p2.x * 2.2 + time * 0.7));
    
    return c * 0.33;
}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    float NdotV = max(dot(normal, viewDir), 0.0);
    
    // Enhanced Fresnel for metal (mercury has F0 around 0.7-0.8)
    float fresnel = fresnelSchlick(NdotV, 0.75);
    
    // Calculate reflection UV with more distortion for liquid feel
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    
    // Animated distortion for flowing metal effect
    float flowTime = uTime * 0.5;
    vec2 flowOffset = vec2(
        sin(vPosition.y * 4.0 + flowTime) * 0.02,
        cos(vPosition.x * 4.0 + flowTime * 0.8) * 0.02
    );
    
    // Normal-based reflection distortion
    vec2 reflectOffset = normal.xy * 0.2 + flowOffset;
    vec2 reflectUV = screenUV + reflectOffset;
    reflectUV = clamp(reflectUV, 0.0, 1.0);
    reflectUV.x = 1.0 - reflectUV.x;
    
    // Sample camera texture
    vec4 cameraColor = texture2D(uCameraTexture, reflectUV);
    
    // Create rich environment gradient
    float envY = normal.y * 0.5 + 0.5;
    vec3 envColor;
    if (envY > 0.5) {
        envColor = mix(envMid, envTop, (envY - 0.5) * 2.0);
    } else {
        envColor = mix(envBottom, envMid, envY * 2.0);
    }
    
    // Add animated environment patterns for more visual interest
    float envPattern = sin(normal.x * 10.0 + uTime * 0.3) * 
                       sin(normal.y * 8.0 + uTime * 0.4) * 0.1 + 0.9;
    envColor *= envPattern;
    
    // Blend camera with environment
    float cameraBrightness = dot(cameraColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 reflectionColor = mix(envColor, cameraColor.rgb * 1.2, smoothstep(0.05, 0.4, cameraBrightness));
    
    // === MULTIPLE SPECULAR LIGHTS FOR METALLIC LUSTER ===
    
    // Primary key light - strong and sharp
    vec3 lightDir1 = normalize(vec3(0.8, 1.0, 0.6));
    vec3 halfDir1 = normalize(lightDir1 + viewDir);
    float spec1 = distributionGGX(normal, halfDir1, 0.05); // Very sharp
    
    // Secondary fill light
    vec3 lightDir2 = normalize(vec3(-0.6, 0.5, 0.8));
    vec3 halfDir2 = normalize(lightDir2 + viewDir);
    float spec2 = distributionGGX(normal, halfDir2, 0.1) * 0.6;
    
    // Rim light from behind
    vec3 lightDir3 = normalize(vec3(0.0, 0.3, -1.0));
    vec3 halfDir3 = normalize(lightDir3 + viewDir);
    float spec3 = distributionGGX(normal, halfDir3, 0.08) * 0.4;
    
    // Moving highlight for flowing effect
    vec3 movingLightDir = normalize(vec3(
        sin(uTime * 0.7) * 0.5,
        0.8,
        cos(uTime * 0.5) * 0.5
    ));
    vec3 movingHalfDir = normalize(movingLightDir + viewDir);
    float movingSpec = distributionGGX(normal, movingHalfDir, 0.06) * 0.5;
    
    // Combine all specular
    float totalSpec = spec1 + spec2 + spec3 + movingSpec;
    vec3 specularColor = mercuryHighlight * totalSpec;
    
    // === CAUSTIC PATTERNS FOR LIQUID METAL ===
    float causticPattern = caustic(vPosition.xy, uTime * 0.8);
    causticPattern = causticPattern * 0.5 + 0.5;
    causticPattern = pow(causticPattern, 2.0) * 0.15;
    
    // === AMBIENT OCCLUSION ===
    float ao = 1.0 - vDisplacement * 1.5;
    ao = clamp(ao, 0.4, 1.0);
    ao = pow(ao, 0.8);
    
    // === EDGE GLOW (opposite of edge darkening for metallic feel) ===
    float edgeGlow = pow(1.0 - NdotV, 3.0) * 0.4;
    
    // === COMBINE ALL LIGHTING ===
    
    // Base metallic color
    vec3 baseColor = mix(mercuryDark, mercuryBase, ao);
    baseColor = mix(baseColor, mercuryTint, 0.3);
    
    // Apply reflection with strong fresnel
    vec3 finalColor = mix(baseColor * 0.3, reflectionColor, fresnel);
    
    // Add specular highlights
    finalColor += specularColor * fresnel;
    
    // Add caustic patterns
    finalColor += mercuryHighlight * causticPattern * fresnel;
    
    // Add edge glow
    finalColor += mercuryHighlight * edgeGlow;
    
    // Subtle color variations based on position (iridescence)
    vec3 iridescence = vec3(
        0.5 + 0.5 * sin(vPosition.x * 8.0 + uTime * 0.4 + vPosition.z * 3.0),
        0.5 + 0.5 * sin(vPosition.y * 8.0 + uTime * 0.6 + vPosition.x * 3.0),
        0.5 + 0.5 * sin(vPosition.z * 8.0 + uTime * 0.5 + vPosition.y * 3.0)
    );
    finalColor += iridescence * 0.04 * (1.0 - NdotV);
    
    // Surface line highlight
    float surfaceHighlight = smoothstep(0.08, 0.0, abs(vPosition.y - uFillLevel));
    finalColor += mercuryHighlight * surfaceHighlight * 0.5;
    
    // Boost overall brightness for metallic feel
    finalColor *= 1.15;
    
    // Tone mapping (ACES approximation for better HDR handling)
    finalColor = finalColor / (finalColor + vec3(1.0));
    finalColor = pow(finalColor, vec3(1.0 / 2.2));
    
    gl_FragColor = vec4(finalColor, 1.0);
}
