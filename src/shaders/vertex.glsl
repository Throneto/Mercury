precision highp float;
precision highp int;

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
uniform vec3 uGravity;          // Current gravity (with inertia applied from JS)
uniform vec3 uTargetGravity;    // Target gravity direction
uniform vec4 uTouchPoints[5];
uniform float uFillLevel;
uniform float uFlowSpeed;       // Flow speed multiplier (0.0 - 1.0)
uniform vec3 uVelocity;         // Velocity from spring physics for stretching

// Varyings
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying float vDisplacement;
varying float vLiquidMask;      // Pass liquid mask to fragment shader

// === METABALL FUSION FUNCTIONS ===

// Smooth minimum for metaball blending - creates organic fusion
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Signed distance function for a sphere
float sdSphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

// Compute metaball field value at a point
// Multiple blob centers create organic fusion effect
float metaballField(vec3 p, vec3 gravityDir, float time, vec3 velocity) {
    // Main liquid pool at gravity direction
    vec3 poolCenter = gravityDir * 0.55;
    float poolRadius = 0.8;
    float mainPool = sdSphere(p, poolCenter, poolRadius);
    
    // Inertia lag effect: blobs trail behind movement
    vec3 lagOffset = -velocity * 0.3;
    
    // Secondary blobs for organic feel - positioned around the pool
    vec3 blobOffset1 = gravityDir * 0.3 + lagOffset * 1.2 + vec3(
        sin(time * 0.3) * 0.15,
        cos(time * 0.25) * 0.1,
        sin(time * 0.35) * 0.12
    );
    float blob1 = sdSphere(p, poolCenter + blobOffset1, 0.35);
    
    vec3 blobOffset2 = gravityDir * 0.25 + lagOffset * 0.8 + vec3(
        cos(time * 0.28) * 0.12,
        sin(time * 0.32) * 0.15,
        cos(time * 0.22) * 0.1
    );
    float blob2 = sdSphere(p, poolCenter + blobOffset2, 0.3);
    
    // Tertiary small blobs for surface detail - more sensitive to velocity
    vec3 blobOffset3 = gravityDir * 0.15 + lagOffset * 1.5 + vec3(
        sin(time * 0.4 + 1.0) * 0.1,
        cos(time * 0.35 + 0.5) * 0.08,
        sin(time * 0.45) * 0.12
    );
    float blob3 = sdSphere(p, poolCenter + blobOffset3, 0.2);
    
    // Smooth blend all blobs together - dynamic k based on speed
    // Higher speed = less fusion (blobs separate slightly)
    float speed = length(velocity);
    float blendK = max(0.25, 0.4 - speed * 0.5);
    
    float field = smin(mainPool, blob1, blendK);
    field = smin(field, blob2, blendK);
    field = smin(field, blob3, blendK * 0.8);
    
    return field;
}

void main() {
    vec3 pos = position;
    
    // === GRAVITY-BASED MERCURY POOLING WITH METABALL FUSION ===
    vec3 gravityDir = normalize(uGravity + vec3(0.001));
    
    // Alignment with gravity direction
    float gravityAlignment = dot(normalize(pos), gravityDir);
    
    // START DYNAMIC STRETCHING
    // Stretch the domain space along velocity direction to simulate motion blur/elongation
    vec3 p = pos;
    float speed = length(uVelocity);
    if (speed > 0.01) {
        vec3 velDir = normalize(uVelocity);
        float stretchFactor = speed * 0.5;
        // Compress along motion
        float proj = dot(p, velDir);
        p -= velDir * proj * stretchFactor; 
    }
    
    // Calculate metaball field influence
    float metaField = metaballField(p, gravityDir, uTime * uFlowSpeed * 0.5, uVelocity);
    
    // Convert fill level to threshold
    float collapseThreshold = uFillLevel * 2.0 - 1.0;
    
    // Combine gravity alignment with metaball field for organic shape
    float combinedField = -gravityAlignment + metaField * 0.25;
    
    // Smooth transition for liquid surface
    float aboveLiquid = smoothstep(collapseThreshold - 0.2, collapseThreshold + 0.1, combinedField);
    
    // === ORGANIC COLLAPSE WITH SURFACE TENSION ===
    
    // Surface tension: liquid tries to minimize surface area
    // Creates rounded edges and bulges
    float surfaceTension = smoothstep(0.0, 0.4, aboveLiquid) * smoothstep(0.8, 0.3, aboveLiquid);
    float tensionBulge = surfaceTension * 0.12;
    
    // Collapse target - vertices above liquid surface move toward the pool
    vec3 poolCenter = gravityDir * (1.0 - uFillLevel) * 0.6;
    
    // Calculate collapse with smooth falloff
    float collapseAmount = aboveLiquid * 0.9;
    vec3 collapsedPos = mix(pos, poolCenter, collapseAmount);
    
    // Add surface tension bulge at the liquid edge
    vec3 edgeNormal = normalize(pos - poolCenter);
    collapsedPos += edgeNormal * tensionBulge * (1.0 - collapseAmount);
    
    pos = collapsedPos;
    
    // === LIQUID SURFACE MASK ===
    float liquidMask = 1.0 - aboveLiquid;
    vLiquidMask = liquidMask;
    
    // === VISCOUS WAVE ANIMATION ===
    // Slower, more viscous movement for mercury-like feel
    float noiseScale = 1.8;
    float timeScale = 0.3 * uFlowSpeed;  // Slower flow
    
    // Gravity-influenced wave direction
    float gravityInfluence = gravityAlignment * 0.5 + 0.5;
    
    // Multi-octave noise for organic, viscous look
    float wave1 = snoise(vec3(pos.xy * noiseScale + uGravity.xy * 0.6, uTime * timeScale));
    float wave2 = snoise(vec3(pos.yz * noiseScale * 1.3 + uGravity.yz * 0.4, uTime * timeScale * 0.7)) * 0.35;
    float wave3 = snoise(vec3(pos.xz * noiseScale * 1.6 + uGravity.xz * 0.25, uTime * timeScale * 0.9)) * 0.18;
    float wave4 = snoise(vec3(pos.xy * noiseScale * 2.2, uTime * timeScale * 1.1)) * 0.08;
    
    float totalWave = (wave1 + wave2 + wave3 + wave4) * uWaveIntensity * 0.7;
    totalWave *= (1.0 + gravityInfluence * 0.6);
    
    // === SURFACE TENSION BULGE AT LIQUID EDGE ===
    float surfaceEdge = smoothstep(0.0, 0.35, liquidMask) * smoothstep(0.55, 0.25, liquidMask);
    float surfaceBulge = surfaceEdge * 0.18;
    
    // Gentle surface ripple at liquid edge
    float surfaceWave = snoise(vec3(pos.xz * 3.5, uTime * timeScale * 0.8)) * 0.025;
    surfaceWave *= surfaceEdge;
    
    // === SLOW FLOWING EFFECT ===
    // Creates viscous "dripping" feel
    float flowNoise = snoise(vec3(
        pos.x * 2.0 + gravityDir.x * uTime * 0.15,
        pos.y * 2.0 + gravityDir.y * uTime * 0.15,
        pos.z * 2.0 + uTime * 0.1
    ));
    float flowDisplacement = flowNoise * 0.04 * liquidMask * uFlowSpeed;
    
    // === TOUCH INTERACTION ===
    vec3 touchDisplacement = vec3(0.0);
    for (int i = 0; i < 5; i++) {
        if (uTouchPoints[i].w > 0.0) {
            vec3 touchPos = vec3(uTouchPoints[i].xy * 2.0, 0.5);
            float dist = distance(pos.xy, touchPos.xy);
            float strength = uTouchPoints[i].z * exp(-dist * dist * 4.0) * 0.3;
            vec3 pullDir = normalize(touchPos - pos);
            touchDisplacement += pullDir * strength;
            touchDisplacement += normal * strength * 0.5;
        }
    }
    
    // === COMBINE ALL DISPLACEMENTS ===
    float displacement = (totalWave + surfaceBulge + surfaceWave + flowDisplacement) * liquidMask;
    pos += normal * displacement;
    pos += touchDisplacement * liquidMask;
    
    // === CALCULATE PERTURBED NORMAL ===
    float eps = 0.01;
    float dx = snoise(vec3((position.xy + vec2(eps, 0.0)) * noiseScale, uTime * timeScale)) - 
               snoise(vec3((position.xy - vec2(eps, 0.0)) * noiseScale, uTime * timeScale));
    float dy = snoise(vec3((position.xy + vec2(0.0, eps)) * noiseScale, uTime * timeScale)) - 
               snoise(vec3((position.xy - vec2(0.0, eps)) * noiseScale, uTime * timeScale));
    
    vec3 perturbedNormal = normalize(normal + vec3(dx, dy, 0.0) * uWaveIntensity * 1.5);
    
    // === OUTPUT ===
    vNormal = normalize(normalMatrix * perturbedNormal);
    vPosition = pos;
    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    vDisplacement = displacement + length(touchDisplacement) + aboveLiquid;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
