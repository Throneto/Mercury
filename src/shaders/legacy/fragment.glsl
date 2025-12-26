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

// Schlick's Fresnel approximation for highly reflective metals
float fresnelSchlick(float cosTheta, float F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Smooth flowing distortion for liquid chrome effect
vec2 liquidFlow(vec3 pos, float time) {
    float flow1 = sin(pos.y * 3.0 + time * 0.4) * cos(pos.x * 2.5 + time * 0.3);
    float flow2 = sin(pos.x * 2.8 + time * 0.35) * cos(pos.z * 2.2 + time * 0.45);
    return vec2(flow1, flow2) * 0.015;
}

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
    // Discard only truly collapsed vertices
    if (vDisplacement > 0.9) {
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
