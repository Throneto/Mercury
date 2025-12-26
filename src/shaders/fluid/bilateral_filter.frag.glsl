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

// Gaussian weights for 5-tap filter
const float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

void main() {
    // Read center depth
    float centerDepth = texture(uDepthTexture, vTexCoord).r;
    
    // Skip background pixels (depth = 0)
    if (centerDepth == 0.0) {
        fragColor = vec4(0.0);
        return;
    }
    
    float totalWeight = weights[0];
    float filteredDepth = centerDepth * weights[0];
    
    // Sample along filter direction
    for (int i = 1; i < 5; i++) {
        vec2 offset = float(i) * uFilterDirection * uTexelSize;
        
        // Sample both sides
        float depth1 = texture(uDepthTexture, vTexCoord + offset).r;
        float depth2 = texture(uDepthTexture, vTexCoord - offset).r;
        
        // Calculate bilateral weights (preserve edges)
        float spatialWeight = weights[i];
        
        // Depth weight for positive side
        if (depth1 > 0.0) {
            float depthDiff1 = abs(centerDepth - depth1);
            float depthWeight1 = exp(-depthDiff1 * depthDiff1 * uDepthFalloff);
            float weight1 = spatialWeight * depthWeight1;
            
            filteredDepth += depth1 * weight1;
            totalWeight += weight1;
        }
        
        // Depth weight for negative side
        if (depth2 > 0.0) {
            float depthDiff2 = abs(centerDepth - depth2);
            float depthWeight2 = exp(-depthDiff2 * depthDiff2 * uDepthFalloff);
            float weight2 = spatialWeight * depthWeight2;
            
            filteredDepth += depth2 * weight2;
            totalWeight += weight2;
        }
    }
    
    // Normalize
    filteredDepth /= totalWeight;
    
    fragColor = vec4(filteredDepth, 0.0, 0.0, 1.0);
}
