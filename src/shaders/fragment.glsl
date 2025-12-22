precision highp float;

// Uniforms
uniform sampler2D uCameraTexture;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uGravity;
uniform float uFillLevel;

uniform vec3 uCameraPosition;
uniform vec3 uDeviceTilt; // Raw device tilt for parallax

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
    // Normalize the interpolated normal
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    float NdotV = max(dot(normal, viewDir), 0.0);
    
    // Chrome has extremely high reflectivity (F0 = 0.95+)
    float fresnel = fresnelSchlick(NdotV, 0.95);
    
    // CHROMATIC ABERRATION (Dispersion)
    // Simulate slight lens dispersion at edges for realism
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    
    // Calculate 3 separate lookup UVs for RGB channels
    float aberrationStrength = 0.005 * (1.0 + fresnel * 2.0); // Stronger at edges
    vec2 uvRed = screenUV + aberrationStrength * vec2(1.0, 0.0);
    vec2 uvGreen = screenUV; // Center
    vec2 uvBlue = screenUV - aberrationStrength * vec2(1.0, 0.0);
    
    // Liquid flow animation - smooth and elegant
    vec2 flowOffset = liquidFlow(vPosition, uTime);
    
    // Add subtle wave-like distortion for mercury-like fluidity
    float waveDistort = sin(vPosition.x * 5.0 + uTime * 0.6) * 
                        sin(vPosition.y * 4.0 + uTime * 0.5) * 0.008;
    flowOffset += vec2(waveDistort, waveDistort * 0.7);
    
    // PARALLAX EFFECT
    // Shift reflection based on device tilt to create depth illusion
    vec2 parallaxOffset = uDeviceTilt.xy * 0.15;
    
    // Normal-based reflection with reduced distortion for sharper reflections
    vec2 reflectOffset = normal.xy * 0.12 + flowOffset + parallaxOffset;
    vec2 reflectUV = screenUV + reflectOffset;
    reflectUV = clamp(reflectUV, 0.0, 1.0);
    reflectUV.x = 1.0 - reflectUV.x;
    
    // Sample camera texture with dispersion
    // Normal-based distortion for reflection
    vec2 reflectDistort = normal.xy * 0.12;
    float rChannel = texture2D(uCameraTexture, clamp(uvRed + reflectDistort, 0.0, 1.0)).r;
    float gChannel = texture2D(uCameraTexture, clamp(uvGreen + reflectDistort, 0.0, 1.0)).g;
    float bChannel = texture2D(uCameraTexture, clamp(uvBlue + reflectDistort, 0.0, 1.0)).b;
    vec4 cameraColor = vec4(rChannel, gChannel, bChannel, 1.0);
    
// Procedural Studio Lighting Environment
// Generates a high-contrast environment map with softbox look
vec3 getStudioEnvironment(vec3 dir) {
    // Top light (Softbox) - Brighter and sharper
    float topLight = smoothstep(0.65, 0.85, dir.y);
    
    // Horizon line (sharp contrast)
    float horizon = smoothstep(-0.05, 0.05, dir.y) * 
                  (1.0 - smoothstep(0.05, 0.15, dir.y));
    
    // Rim lights (sides) - crisper
    float rim = pow(1.0 - abs(dir.y), 4.0) * 
                smoothstep(0.6, 0.9, abs(dir.x));
                
    // Bottom reflection (pitch black ground for contrast)
    float bottom = smoothstep(-0.8, -0.4, -dir.y) * 0.05;
    
    vec3 color = vec3(0.0); // PURE BLACK AMBIENT
    color += vec3(2.0) * topLight; // Overexposed overhead
    color += vec3(1.2) * horizon;  // Bright horizon
    color += vec3(0.8) * rim;      // Side rims
    color += vec3(0.2) * bottom;   // Subtle ground
    
    // Cold, sterile tint for "Medical/Sci-Fi" Mercury
    return color * vec3(0.95, 0.98, 1.0);
}

void main() {
    // HARD DISCARD for clean edges
    if (vLiquidMask < 0.5 || vDisplacement > 0.5) {
        discard;
    }

    // Normalize the interpolated normal
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    float NdotV = max(dot(normal, viewDir), 0.0);
    
    // --- ENVIRONMENT MAPPING ---
    vec3 reflectDir = reflect(-viewDir, normal);
    vec3 parallax = uDeviceTilt * 0.3; // Increased parallax for depth
    vec3 correctedReflectDir = normalize(reflectDir + parallax);
    
    // Sample Camera (Sphere mapping)
    vec2 envMapUV = vec2(
        0.5 + atan(correctedReflectDir.z, correctedReflectDir.x) / (2.0 * 3.14159),
        0.5 - asin(correctedReflectDir.y) / 3.14159
    );
    
    vec2 flow = liquidFlow(vPosition, uTime);
    envMapUV += flow * 1.5;
    
    vec3 cameraColor = texture2D(uCameraTexture, envMapUV).rgb;
    
    // EXTREME Contrast process for camera feed
    float luminance = dot(cameraColor, vec3(0.299, 0.587, 0.114));
    // Make darks darker (black) and lights brighter
    cameraColor = mix(vec3(0.0), cameraColor, smoothstep(0.3, 0.7, luminance)); 
    cameraColor = pow(cameraColor, vec3(1.2)) * 1.5; // Boost exposure
    
    // Desaturate slightly
    float grey = dot(cameraColor, vec3(0.299, 0.587, 0.114));
    cameraColor = mix(cameraColor, vec3(grey), 0.5); 
    
    // Sample Studio Environment
    vec3 studioColor = getStudioEnvironment(correctedReflectDir);
    
    // Mix: Favor studio for "guaranteed" shine, use camera for detail
    vec3 envColor = mix(studioColor, cameraColor, 0.35); // 35% Camera, 65% Studio
    
    // --- FRESNEL EFFECT ---
    // Metal fresnel: Reflectivity goes from High (0.6) to Perfect (1.0)
    float fresnel = fresnelSchlick(NdotV, 0.7); 
    
    // --- SPECULAR HIGHLIGHTS ---
    // Multiple sharp lights for "jewelry" look
    vec3 lightDir1 = normalize(vec3(0.5, 1.0, 1.0));
    vec3 halfVec1 = normalize(lightDir1 + viewDir);
    float specular1 = pow(max(dot(normal, halfVec1), 0.0), 256.0) * 3.0; // Point light
    
    vec3 lightDir2 = normalize(vec3(-0.8, 0.2, 0.5));
    vec3 halfVec2 = normalize(lightDir2 + viewDir);
    float specular2 = pow(max(dot(normal, halfVec2), 0.0), 128.0) * 1.5;
    
    // --- FINAL COMPOSITION ---
    // BASE COLOR IS BLACK. PURE REFLECTION.
    vec3 finalColor = vec3(0.0);
    
    // Add Reflections
    finalColor += envColor * fresnel;
    
    // Add Highlights
    finalColor += vec3(1.0) * (specular1 + specular2);
    
    // Tone mapping (ACEs approximate)
    finalColor *= 1.2; // Exposure boost
    vec3 x = max(vec3(0.0), finalColor - 0.004);
    vec3 retColor = (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
    finalColor = retColor;
    
    // Gamma
    finalColor = pow(finalColor, vec3(1.0 / 2.2));
    
    // --- EDGE HANDLING ---
    // No soft fade transparency. It's metal. It's either there or it's not.
    // We already discarded, so set alpha to 1.0 for solid look.
    gl_FragColor = vec4(finalColor, 1.0);
}

