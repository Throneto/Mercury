/**
 * Shader Utilities - WebGL shader compilation helpers
 */

/**
 * Compile a WebGL shader from source
 */
export function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        const typeStr = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';
        console.error(`[Shader] ${typeStr} shader compilation failed:`, info);
        console.error('Source:', source);
        gl.deleteShader(shader);
        throw new Error(`${typeStr} shader compilation failed: ${info}`);
    }

    return shader;
}

/**
 * Create a WebGL program from compiled shaders
 */
export function createProgram(gl, vertexShader, fragmentShader, attributeLocations = null) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    // Bind attribute locations BEFORE linking (if provided)
    if (attributeLocations) {
        Object.entries(attributeLocations).forEach(([name, location]) => {
            gl.bindAttribLocation(program, location, name);
        });
    }

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        console.error('[Shader] Program linking failed:', info);
        gl.deleteProgram(program);
        throw new Error(`Program linking failed: ${info}`);
    }

    return program;
}

/**
 * Create a program from shader source code
 */
export function createProgramFromSource(gl, vertexSource, fragmentSource) {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = createProgram(gl, vertexShader, fragmentShader);

    // Clean up shaders (they're now linked into the program)
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
}
