#version 300 es
precision highp float;

// Fullscreen quad vertices (no vertex buffer needed)
// Uses gl_VertexID to generate positions

out vec2 vTexCoord;

void main() {
    // Generate fullscreen quad from vertex ID
    // 0: (-1, -1), 1: (3, -1), 2: (-1, 3)
    // This creates a triangle that covers the entire screen
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    
    gl_Position = vec4(x, y, 0.0, 1.0);
    
    // Convert from [-1,1] to [0,1] for texture coordinates
    vTexCoord = gl_Position.xy * 0.5 + 0.5;
}
