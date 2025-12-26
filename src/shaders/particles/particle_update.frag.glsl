#version 300 es
precision highp float;

// Dummy fragment shader for Transform Feedback
// Required for program linking even though rasterization is disabled
out vec4 fragColor;

void main() {
    // This will never be executed because RASTERIZER_DISCARD is enabled
    fragColor = vec4(0.0);
}
