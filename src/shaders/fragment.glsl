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
varying float vLiquidMask;

// Real mercury colors - pure silver with strong contrast (based on reference photo)
const vec3 mercuryBright = vec3(0.92, 0.92, 0.90);     // Pure warm silver highlight
const vec3 mercuryDark = vec3(0.12, 0.12, 0.14);       // Deep shadow (visible in lower half of droplets)
const vec3 mercuryHighlight = vec3(1.0, 1.0, 0.98);    // Slightly warm white for top highlights
const vec3 mercuryMid = vec3(0.45, 0.45, 0.48);        // Mid-tone grey
const vec3 mercuryBase = vec3(0.75, 0.75, 0.78);       // Base reflective silver

// Environment colors - simulating real lighting conditions from photo
const vec3 envTop = vec3(0.95, 0.95, 0.93);            // Bright overhead light source
const vec3 envMid = vec3(0.25, 0.25, 0.28);            // Grey ambient
const vec3 envBottom = vec3(0.08, 0.08, 0.10);         // Dark ground reflection

// Schlick's Fresnel approximation for highly reflective metals
float fresnelSchlick(float cosTheta, float F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// GGX/Trowbridge-Reitz normal distribution - optimized for sharp reflections
float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    
    float denom = NdotH2 * (a2 - 1.0) + 1.0;
    return a2 / (3.14159265 * denom * denom);
}

// Geometry function for chrome-like specular
float geometrySchlickGGX(float NdotV, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

// Flowing caustic pattern - subtle for chrome, more visible during movement
float caustic(vec2 uv, float time) {
    float c = 0.0;
    
    // Slower, more elegant flow for chrome
    vec2 p0 = uv * 1.2 + time * 0.2 * vec2(0.2, 0.15);
    c += sin(p0.x * 2.5 + sin(p0.y * 2.0 + time * 0.8)) * 
         sin(p0.y * 2.2 + sin(p0.x * 1.8 + time * 0.6));
    
    vec2 p1 = uv * 1.8 + time * 0.25 * vec2(0.25, 0.18);
    c += sin(p1.x * 2.8 + sin(p1.y * 2.2 + time * 0.7)) * 
         sin(p1.y * 2.5 + sin(p1.x * 2.0 + time * 0.5)) * 0.5;
    
    return c * 0.4;
}

// Smooth flowing distortion for liquid chrome effect
vec2 liquidFlow(vec3 pos, float time) {
    float flow1 = sin(pos.y * 3.0 + time * 0.4) * cos(pos.x * 2.5 + time * 0.3);
    float flow2 = sin(pos.x * 2.8 + time * 0.35) * cos(pos.z * 2.2 + time * 0.45);
    return vec2(flow1, flow2) * 0.015;
}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    float NdotV = max(dot(normal, viewDir), 0.0);
    
    // Chrome has extremely high reflectivity (F0 = 0.95+)
    float fresnel = fresnelSchlick(NdotV, 0.95);
    
    // Calculate reflection UV with liquid flow distortion
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    
    // Liquid flow animation - smooth and elegant
    vec2 flowOffset = liquidFlow(vPosition, uTime);
    
    // Add subtle wave-like distortion for mercury-like fluidity
    float waveDistort = sin(vPosition.x * 5.0 + uTime * 0.6) * 
                        sin(vPosition.y * 4.0 + uTime * 0.5) * 0.008;
    flowOffset += vec2(waveDistort, waveDistort * 0.7);
    
    // Normal-based reflection with reduced distortion for sharper reflections
    vec2 reflectOffset = normal.xy * 0.12 + flowOffset;
    vec2 reflectUV = screenUV + reflectOffset;
    reflectUV = clamp(reflectUV, 0.0, 1.0);
    reflectUV.x = 1.0 - reflectUV.x;
    
    // Sample camera texture
    vec4 cameraColor = texture2D(uCameraTexture, reflectUV);
    
    // Create high-contrast environment gradient for chrome
    float envY = normal.y * 0.5 + 0.5;
    vec3 envColor;
    
    // Sharper transition for chrome-like reflections
    if (envY > 0.6) {
        envColor = mix(envMid, envTop, (envY - 0.6) * 2.5);
    } else if (envY > 0.3) {
        envColor = mix(envBottom, envMid, (envY - 0.3) / 0.3);
    } else {
        envColor = envBottom;
    }
    
    // Subtle flowing environment pattern
    float envFlow = sin(normal.x * 8.0 + uTime * 0.25) * 
                    sin(normal.y * 6.0 + uTime * 0.3) * 0.08;
    envColor *= (1.0 + envFlow);
    
    // Blend camera with environment - stronger camera influence for chrome
    float cameraBrightness = dot(cameraColor.rgb, vec3(0.299, 0.587, 0.114));
    float cameraInfluence = smoothstep(0.02, 0.35, cameraBrightness);
    vec3 reflectionColor = mix(envColor, cameraColor.rgb * 1.3, cameraInfluence);
    
    // Boost contrast in reflections for chrome effect
    reflectionColor = pow(reflectionColor, vec3(0.9)) * 1.1;
    
    // === MULTIPLE SPECULAR LIGHTS FOR CHROME LUSTER ===
    
    // Primary key light - extremely sharp for chrome
    vec3 lightDir1 = normalize(vec3(0.7, 1.0, 0.5));
    vec3 halfDir1 = normalize(lightDir1 + viewDir);
    float spec1 = distributionGGX(normal, halfDir1, 0.015) * 1.5; // Ultra-sharp
    
    // Secondary fill light - also sharp
    vec3 lightDir2 = normalize(vec3(-0.5, 0.6, 0.7));
    vec3 halfDir2 = normalize(lightDir2 + viewDir);
    float spec2 = distributionGGX(normal, halfDir2, 0.025) * 0.8;
    
    // Rim light - sharp edge highlights
    vec3 lightDir3 = normalize(vec3(0.0, 0.2, -1.0));
    vec3 halfDir3 = normalize(lightDir3 + viewDir);
    float spec3 = distributionGGX(normal, halfDir3, 0.02) * 0.6;
    
    // Bottom bounce light for chrome depth
    vec3 lightDir4 = normalize(vec3(0.3, -0.8, 0.4));
    vec3 halfDir4 = normalize(lightDir4 + viewDir);
    float spec4 = distributionGGX(normal, halfDir4, 0.04) * 0.3;
    
    // Flowing highlight - creates liquid metal movement effect
    vec3 flowingLightDir = normalize(vec3(
        sin(uTime * 0.5) * 0.4,
        0.85 + sin(uTime * 0.3) * 0.1,
        cos(uTime * 0.4) * 0.4
    ));
    vec3 flowingHalfDir = normalize(flowingLightDir + viewDir);
    float flowingSpec = distributionGGX(normal, flowingHalfDir, 0.02) * 0.7;
    
    // Combine all specular with geometry term
    float geom = geometrySchlickGGX(NdotV, 0.02);
    float totalSpec = (spec1 + spec2 + spec3 + spec4 + flowingSpec) * geom;
    vec3 specularColor = mercuryHighlight * totalSpec;
    
    // === SUBTLE CAUSTIC PATTERNS FOR LIQUID FLOW ===
    float causticPattern = caustic(vPosition.xy, uTime * 0.6);
    causticPattern = causticPattern * 0.5 + 0.5;
    causticPattern = pow(causticPattern, 2.5) * 0.08; // More subtle for chrome
    
    // === AMBIENT OCCLUSION - subtle for chrome ===
    float ao = 1.0 - vDisplacement * 1.2;
    ao = clamp(ao, 0.5, 1.0);
    ao = pow(ao, 0.7);
    
    // === EDGE FRESNEL - strong bright edges for chrome ===
    float edgeFresnel = pow(1.0 - NdotV, 4.0) * 0.6;
    
    // === COMBINE ALL LIGHTING ===
    
    // Base mercury color - strong contrast like real mercury droplets
    vec3 baseColor = mix(mercuryDark, mercuryBase, ao);
    baseColor = mix(baseColor, mercuryBright, 0.3);
    
    // Apply reflection with very strong fresnel (chrome is almost 100% reflective)
    vec3 finalColor = mix(baseColor * 0.15, reflectionColor, fresnel);
    
    // Add powerful specular highlights
    finalColor += specularColor;
    
    // Add subtle caustic patterns for liquid feel
    finalColor += mercuryHighlight * causticPattern * fresnel * 0.5;
    
    // Add bright edge fresnel like real mercury
    finalColor += mercuryHighlight * edgeFresnel;
    
    // Very subtle color variation for liquid depth (reduced iridescence)
    vec3 liquidVariation = vec3(
        0.5 + 0.5 * sin(vPosition.x * 6.0 + uTime * 0.3),
        0.5 + 0.5 * sin(vPosition.y * 6.0 + uTime * 0.35),
        0.5 + 0.5 * sin(vPosition.z * 6.0 + uTime * 0.4 + 1.0)
    );
    finalColor += liquidVariation * 0.015 * (1.0 - NdotV);
    
    // Flowing light streaks for liquid metal movement
    float streak = sin(vPosition.x * 12.0 + vPosition.y * 8.0 + uTime * 1.2) * 0.5 + 0.5;
    streak = pow(streak, 8.0) * 0.15 * (0.5 + 0.5 * sin(uTime * 0.8));
    finalColor += mercuryHighlight * streak * fresnel;
    
    // Boost brightness for chrome brilliance
    finalColor *= 1.25;
    
    // ACES-like tone mapping for HDR handling
    vec3 a = finalColor * (finalColor + 0.0245786) - 0.000090537;
    vec3 b = finalColor * (0.983729 * finalColor + 0.4329510) + 0.238081;
    finalColor = a / b;
    
    // Gamma correction
    finalColor = pow(finalColor, vec3(1.0 / 2.2));
    
    // Use liquid mask for smoother edge blending
    // Discard fully collapsed vertices
    if (vLiquidMask < 0.05) {
        discard;
    }
    
    // Smooth edge transition using liquid mask
    float edgeAlpha = smoothstep(0.0, 0.25, vLiquidMask);
    float collapseAlpha = 1.0 - smoothstep(0.5, 0.8, vDisplacement);
    float alpha = min(edgeAlpha, collapseAlpha);
    
    gl_FragColor = vec4(finalColor, alpha);
}

