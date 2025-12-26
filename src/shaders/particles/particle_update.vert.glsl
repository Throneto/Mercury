#version 300 es

// Input attributes (from current buffer)
in vec3 aPosition;
in vec3 aVelocity;
in float aId;

// Output attributes (to next buffer via Transform Feedback)
out vec3 vPosition;
out vec3 vVelocity;

// Uniforms
uniform float uTime;
uniform float uDeltaTime;
uniform vec3 uGravity;
uniform vec3 uBounds;
uniform float uDamping;
uniform float uBounce;
uniform vec4 uTouchPoints[5];

// Shape target uniforms
uniform sampler2D uTargetTexture;
uniform float uTextureSize;
uniform float uShapeAttraction; // 0.0 = free particles, 1.0 = locked to shape

// Simplex 3D Noise for randomness
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
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
    
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
    float n_ = 0.142857142857;
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

// Get target position from texture based on particle ID
vec3 getTargetPosition(float id) {
    float index = id;
    float y = floor(index / uTextureSize);
    float x = index - y * uTextureSize;
    vec2 uv = (vec2(x, y) + 0.5) / uTextureSize;
    vec4 data = texture(uTargetTexture, uv);
    return data.xyz;
}

void main() {
    // Start with current state
    vec3 position = aPosition;
    vec3 velocity = aVelocity;
    
    // Apply gravity force (check for zero vector to avoid NaN from normalize)
    float gravityMag = length(uGravity);
    if (gravityMag > 0.001) {
        vec3 gravityForce = normalize(uGravity) * 9.81 * uDeltaTime;
        velocity += gravityForce;
    }
    
    // Apply shape attraction force
    if (uShapeAttraction > 0.0) {
        vec3 targetPos = getTargetPosition(aId);
        vec3 toTarget = targetPos - position;
        float dist = length(toTarget);
        
        if (dist > 0.001) {
            // Spring-like attraction (stronger when farther away)
            float attractionStrength = uShapeAttraction * 10.0;
            vec3 attractionForce = normalize(toTarget) * attractionStrength * uDeltaTime;
            velocity += attractionForce;
        }
    }
    
    // Apply touch forces (magnetic attraction)
    for (int i = 0; i < 5; i++) {
        vec3 touchPos = uTouchPoints[i].xyz;
        float touchStrength = uTouchPoints[i].w;
        
        if (touchStrength > 0.0) {
            vec3 toTouch = touchPos - position;
            float dist = length(toTouch);
            
            if (dist > 0.001) {
                // Inverse square falloff
                float force = touchStrength * 2.0 / (dist * dist + 0.1);
                velocity += normalize(toTouch) * force * uDeltaTime;
            }
        }
    }
    
    // Add small turbulence for organic motion (DISABLED for testing)
    vec3 noisePos = position * 5.0 + uTime * 0.3;
    vec3 turbulence = vec3(
        snoise(noisePos),
        snoise(noisePos + vec3(123.456)),
        snoise(noisePos + vec3(789.012))
    ) * 0.0 * uDeltaTime; // Turbulence disabled
    velocity += turbulence;
    
    // Apply damping
    velocity *= uDamping;
    
    // Update position
    position += velocity * uDeltaTime;
    
    // Boundary collision (box bounds)
    vec3 halfBounds = uBounds * 0.5;
    
    // X boundary
    if (position.x < -halfBounds.x) {
        position.x = -halfBounds.x;
        velocity.x = abs(velocity.x) * uBounce;
    } else if (position.x > halfBounds.x) {
        position.x = halfBounds.x;
        velocity.x = -abs(velocity.x) * uBounce;
    }
    
    // Y boundary
    if (position.y < -halfBounds.y) {
        position.y = -halfBounds.y;
        velocity.y = abs(velocity.y) * uBounce;
    } else if (position.y > halfBounds.y) {
        position.y = halfBounds.y;
        velocity.y = -abs(velocity.y) * uBounce;
    }
    
    // Z boundary
    if (position.z < -halfBounds.z) {
        position.z = -halfBounds.z;
        velocity.z = abs(velocity.z) * uBounce;
    } else if (position.z > halfBounds.z) {
        position.z = halfBounds.z;
        velocity.z = -abs(velocity.z) * uBounce;
    }
    
    // Output to Transform Feedback buffers
    vPosition = position;
    vVelocity = velocity;
}
