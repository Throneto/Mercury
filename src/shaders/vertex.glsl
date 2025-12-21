// Simplex 3D Noise
// by Ian McEwan, Ashima Arts
vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// Uniforms
uniform float uTime;
uniform vec3 uGravity;
uniform vec4 uTouchPoints[5];
uniform float uWaveIntensity;
uniform float uFillLevel;

// Varyings
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying float vDisplacement;

void main() {
    vec3 pos = position;
    
    // Fill level - only affect lower portion of sphere
    float fillMask = smoothstep(uFillLevel - 0.1, uFillLevel + 0.05, pos.y);
    float liquidMask = 1.0 - fillMask;
    
    // Enhanced wave parameters for more fluid motion
    float noiseScale = 2.0;
    float timeScale = 0.6;
    
    // Gravity-influenced wave direction
    vec3 gravityDir = normalize(uGravity + vec3(0.001));
    float gravityInfluence = dot(normalize(pos), gravityDir) * 0.5 + 0.5;
    
    // Multi-octave noise for organic, viscous look
    float wave1 = snoise(vec3(pos.xy * noiseScale + uGravity.xy * 0.8, uTime * timeScale));
    float wave2 = snoise(vec3(pos.yz * noiseScale * 1.5 + uGravity.yz * 0.5, uTime * timeScale * 0.8)) * 0.4;
    float wave3 = snoise(vec3(pos.xz * noiseScale * 2.0 + uGravity.xz * 0.3, uTime * timeScale * 1.2)) * 0.2;
    float wave4 = snoise(vec3(pos.xyz * noiseScale * 3.0, uTime * timeScale * 1.5)) * 0.1;
    
    float totalWave = (wave1 + wave2 + wave3 + wave4) * uWaveIntensity;
    
    // Stronger gravity influence for viscous flow
    totalWave *= (1.0 + gravityInfluence * 0.8);
    
    // Surface wave at liquid surface - more pronounced
    float surfaceWave = snoise(vec3(pos.xz * 4.0, uTime * 1.2)) * 0.03;
    surfaceWave *= smoothstep(uFillLevel - 0.2, uFillLevel, pos.y) * smoothstep(uFillLevel + 0.2, uFillLevel, pos.y);
    
    // Touch point magnetic attraction
    vec3 touchDisplacement = vec3(0.0);
    for (int i = 0; i < 5; i++) {
        if (uTouchPoints[i].w > 0.0) {
            // Convert touch point from 2D to 3D
            vec3 touchPos = vec3(uTouchPoints[i].xy * 2.0, 0.5);
            
            // Distance from vertex to touch point (projected)
            float dist = distance(pos.xy, touchPos.xy);
            
            // Gaussian falloff for smooth attraction
            float strength = uTouchPoints[i].z * exp(-dist * dist * 4.0) * 0.3;
            
            // Pull toward touch point (magnetic effect)
            vec3 pullDir = normalize(touchPos - pos);
            touchDisplacement += pullDir * strength;
            
            // Also create a local bulge
            touchDisplacement += normal * strength * 0.5;
        }
    }
    
    // Combine all displacements
    float displacement = totalWave * liquidMask + surfaceWave;
    pos += normal * displacement;
    pos += touchDisplacement * liquidMask;
    
    // Calculate perturbed normal for lighting
    // Using finite differences for normal estimation
    float eps = 0.01;
    float dx = snoise(vec3((position.xy + vec2(eps, 0.0)) * noiseScale, uTime * timeScale)) - 
               snoise(vec3((position.xy - vec2(eps, 0.0)) * noiseScale, uTime * timeScale));
    float dy = snoise(vec3((position.xy + vec2(0.0, eps)) * noiseScale, uTime * timeScale)) - 
               snoise(vec3((position.xy - vec2(0.0, eps)) * noiseScale, uTime * timeScale));
    
    vec3 perturbedNormal = normalize(normal + vec3(dx, dy, 0.0) * uWaveIntensity * 2.0);
    
    // Output
    vNormal = normalize(normalMatrix * perturbedNormal);
    vPosition = pos;
    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    vDisplacement = displacement + length(touchDisplacement);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
