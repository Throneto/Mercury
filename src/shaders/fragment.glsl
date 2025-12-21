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

// Mercury base color (silvery with slight blue tint)
const vec3 mercuryBase = vec3(0.78, 0.80, 0.85);
const vec3 mercuryDark = vec3(0.15, 0.17, 0.22);
const vec3 mercuryHighlight = vec3(0.95, 0.97, 1.0);

// Environment colors for when camera is not available
const vec3 envTop = vec3(0.4, 0.45, 0.55);
const vec3 envBottom = vec3(0.1, 0.12, 0.15);

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    
    // Fresnel effect - more reflection at glancing angles
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
    fresnel = mix(0.2, 1.0, fresnel);
    
    // Calculate reflection UV from normal perturbation
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    
    // Distort UV based on normal for reflection effect
    vec2 reflectOffset = normal.xy * 0.15;
    vec2 reflectUV = screenUV + reflectOffset;
    reflectUV = clamp(reflectUV, 0.0, 1.0);
    
    // Flip UV for mirror effect (front camera is mirrored)
    reflectUV.x = 1.0 - reflectUV.x;
    
    // Sample camera texture
    vec4 cameraColor = texture2D(uCameraTexture, reflectUV);
    
    // Fallback gradient if camera is dark/unavailable
    vec3 envColor = mix(envBottom, envTop, screenUV.y + normal.y * 0.3);
    
    // Mix camera with environment based on brightness
    float cameraBrightness = dot(cameraColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 reflectionColor = mix(envColor, cameraColor.rgb, smoothstep(0.05, 0.3, cameraBrightness));
    
    // Specular highlights
    vec3 lightDir1 = normalize(vec3(1.0, 1.0, 1.0));
    vec3 lightDir2 = normalize(vec3(-0.5, 0.8, 0.5));
    
    vec3 halfDir1 = normalize(lightDir1 + viewDir);
    vec3 halfDir2 = normalize(lightDir2 + viewDir);
    
    float spec1 = pow(max(dot(normal, halfDir1), 0.0), 128.0);
    float spec2 = pow(max(dot(normal, halfDir2), 0.0), 64.0) * 0.5;
    
    vec3 specular = mercuryHighlight * (spec1 + spec2);
    
    // Ambient occlusion from displacement
    float ao = 1.0 - vDisplacement * 2.0;
    ao = clamp(ao, 0.3, 1.0);
    
    // Edge darkening for depth
    float edgeDark = pow(1.0 - abs(dot(viewDir, normal)), 2.0) * 0.3;
    
    // Combine all lighting components
    vec3 baseColor = mix(mercuryDark, mercuryBase, ao);
    
    // Mix base with reflection based on fresnel
    vec3 finalColor = mix(baseColor, reflectionColor, fresnel * 0.7);
    
    // Add specular highlights
    finalColor += specular * fresnel;
    
    // Subtle color shift based on gravity (iridescence)
    vec3 iridescence = vec3(
        0.5 + 0.5 * sin(vPosition.x * 5.0 + uTime * 0.5),
        0.5 + 0.5 * sin(vPosition.y * 5.0 + uTime * 0.7),
        0.5 + 0.5 * sin(vPosition.z * 5.0 + uTime * 0.6)
    );
    finalColor += iridescence * 0.03 * fresnel;
    
    // Apply edge darkening
    finalColor *= (1.0 - edgeDark);
    
    // Liquid surface highlight at fill line
    float surfaceHighlight = smoothstep(0.1, 0.0, abs(vPosition.y - uFillLevel));
    finalColor += mercuryHighlight * surfaceHighlight * 0.3;
    
    // Gamma correction
    finalColor = pow(finalColor, vec3(1.0 / 2.2));
    
    gl_FragColor = vec4(finalColor, 1.0);
}
