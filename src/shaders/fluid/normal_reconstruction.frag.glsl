#version 300 es
precision highp float;

// Input
in vec2 vTexCoord;

// Uniforms
uniform sampler2D uDepthTexture;
uniform vec2 uTexelSize;
uniform mat4 uProjectionMatrix;

// Output
out vec4 fragColor;

// Reconstruct view-space position from depth
vec3 reconstructViewPosition(float depth, vec2 texCoord) {
    // Convert texCoord to NDC xy
    vec2 ndc = texCoord * 2.0 - 1.0;
    
    // Reconstruct clip space position
    vec4 clipPos = vec4(ndc, depth * 2.0 - 1.0, 1.0);
    
    // Inverse projection
    mat4 invProj = inverse(uProjectionMatrix);
    vec4 viewPos = invProj * clipPos;
    
    // Perspective divide
    return viewPos.xyz / viewPos.w;
}

void main() {
    float depth = texture(uDepthTexture, vTexCoord).r;
    
    // Skip background
    if (depth == 0.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    
    // Sample neighboring depths
    float depthRight = texture(uDepthTexture, vTexCoord + vec2(uTexelSize.x, 0.0)).r;
    float depthLeft = texture(uDepthTexture, vTexCoord - vec2(uTexelSize.x, 0.0)).r;
    float depthUp = texture(uDepthTexture, vTexCoord + vec2(0.0, uTexelSize.y)).r;
    float depthDown = texture(uDepthTexture, vTexCoord - vec2(0.0, uTexelSize.y)).r;
    
    // Use center depth as fallback for background neighbors
    if (depthRight == 0.0) depthRight = depth;
    if (depthLeft == 0.0) depthLeft = depth;
    if (depthUp == 0.0) depthUp = depth;
    if (depthDown == 0.0) depthDown = depth;
    
    // Reconstruct positions
    vec3 posCenter = reconstructViewPosition(depth, vTexCoord);
    vec3 posRight = reconstructViewPosition(depthRight, vTexCoord + vec2(uTexelSize.x, 0.0));
    vec3 posLeft = reconstructViewPosition(depthLeft, vTexCoord - vec2(uTexelSize.x, 0.0));
    vec3 posUp = reconstructViewPosition(depthUp, vTexCoord + vec2(0.0, uTexelSize.y));
    vec3 posDown = reconstructViewPosition(depthDown, vTexCoord - vec2(0.0, uTexelSize.y));
    
    // Calculate derivatives
    vec3 ddx = (posRight - posLeft) * 0.5;
    vec3 ddy = (posUp - posDown) * 0.5;
    
    // Calculate normal via cross product
    vec3 normal = normalize(cross(ddx, ddy));
    
    // Ensure normal points toward camera (negative Z in view space)
    if (normal.z > 0.0) {
        normal = -normal;
    }
    
    // Store normal in [0,1] range for texture
    fragColor = vec4(normal * 0.5 + 0.5, 1.0);
}
