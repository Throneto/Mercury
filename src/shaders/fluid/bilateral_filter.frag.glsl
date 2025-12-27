#version 300 es
precision highp float;

// Input
in vec2 vTexCoord;

// Uniforms
uniform sampler2D uDepthTexture;
uniform vec2 uTexelSize; // 1.0 / textureSize
uniform vec2 uFilterDirection; // (1,0) for horizontal, (0,1) for vertical
uniform float uFilterRadius; // Number of samples on each side
uniform float uDepthFalloff; // Controls edge preservation strength

// Output
out vec4 fragColor;

// Gaussian function
float gaussian(float x, float sigma) {
    return exp(-(x * x) / (2.0 * sigma * sigma));
}

void main() {
    // Read center depth
    float centerDepth = texture(uDepthTexture, vTexCoord).r;
    
    // Skip background pixels (depth = 0)
    if (centerDepth == 0.0) {
        fragColor = vec4(0.0);
        return;
    }
    
    float totalWeight = 1.0;
    float filteredDepth = centerDepth;
    
    // Dynamic kernel based on filter radius quality
    // We iterate more samples for a smoother "VDB-like" surface
    const int iterations = 10;
    
    // Sigma for spatial weight (controls blur strength)
    float sigma = uFilterRadius / 2.0; 
    
    // Sample along filter direction
    for (int i = 1; i <= iterations; i++) {
        // Spatial offset
        vec2 offset = float(i) * uFilterDirection * uTexelSize;
        
        // Calculate spatial weight (Gaussian)
        float spatialWeight = gaussian(float(i), sigma);
        
        // Sample both sides
        float depth1 = texture(uDepthTexture, vTexCoord + offset).r;
        float depth2 = texture(uDepthTexture, vTexCoord - offset).r;
        
        // POSITIVE SIDE
        if (depth1 > 0.0) {
            float depthDiff = abs(centerDepth - depth1);
            // Bilateral weight: Spatial * Range (Depth)
            // Depth falloff preserves sharp edges (self-occlusion)
            float depthWeight = exp(-depthDiff * depthDiff * uDepthFalloff);
            float w = spatialWeight * depthWeight;
            
            filteredDepth += depth1 * w;
            totalWeight += w;
        }
        
        // NEGATIVE SIDE
        if (depth2 > 0.0) {
            float depthDiff = abs(centerDepth - depth2);
            float depthWeight = exp(-depthDiff * depthDiff * uDepthFalloff);
            float w = spatialWeight * depthWeight;
            
            filteredDepth += depth2 * w;
            totalWeight += w;
        }
    }
    
    // Normalize
    filteredDepth /= totalWeight;
    
    fragColor = vec4(filteredDepth, 0.0, 0.0, 1.0);
}
