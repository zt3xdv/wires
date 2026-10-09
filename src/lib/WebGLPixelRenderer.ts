// fat ahh file

type RenderSettings = {
  pixelSize: number;
  strength: number;
  movement: number;
};

type PixelGrid = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

const vertexShaderSource = `
  attribute vec2 aStart;
  attribute vec2 aEnd;
  attribute vec3 aColor;

  uniform float uProgress;
  uniform float uPointSize;

  varying vec3 vColor;

  void main() {
    float t = clamp(uProgress, 0.0, 1.0);
    float eased = t * t * (3.0 - 2.0 * t);
    vec2 position = mix(aStart, aEnd, eased);

    gl_Position = vec4(position, 0.0, 1.0);
    gl_PointSize = uPointSize;
    vColor = aColor;
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  varying vec3 vColor;

  void main() {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

const floatsPerPixel = 7; // start xy, end xy, color rgb

export default class WebGLPixelRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly startLocation: number;
  private readonly endLocation: number;
  private readonly colorLocation: number;
  private frameRenderer: ((progress: number) => void) | null = null;
  private readonly progressLocation: WebGLUniformLocation | null;
  private readonly pointSizeLocation: WebGLUniformLocation | null;
  private frameId = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const context =
      canvas.getContext("webgl", { preserveDrawingBuffer: true }) ??
      canvas.getContext("experimental-webgl", {
        preserveDrawingBuffer: true,
      });

    if (!context || !("createShader" in context)) {
      throw new Error("This browser doesn't support WebGL");
    }

    this.gl = context as WebGLRenderingContext;
    this.program = createProgram(this.gl, vertexShaderSource, fragmentShaderSource);

    this.startLocation = this.gl.getAttribLocation(this.program, "aStart");
    this.endLocation = this.gl.getAttribLocation(this.program, "aEnd");
    this.colorLocation = this.gl.getAttribLocation(this.program, "aColor");
    this.progressLocation = this.gl.getUniformLocation(this.program, "uProgress");
    this.pointSizeLocation = this.gl.getUniformLocation(this.program, "uPointSize");

    const buffer = this.gl.createBuffer();
    if (!buffer) throw new Error("Could not load WebGL buffer");
    this.buffer = buffer;
  }

  render(source: HTMLImageElement, guide: HTMLImageElement, settings: RenderSettings) {
    cancelAnimationFrame(this.frameId);

    const pixelSize = Math.max(1, settings.pixelSize);
    const guideScale = 1200 / Math.max(guide.naturalWidth, guide.naturalHeight);
    const targetWidth = Math.max(pixelSize, Math.round(guide.naturalWidth * guideScale));
    const targetHeight = Math.max(pixelSize, Math.round(guide.naturalHeight * guideScale));
    
    const columns = Math.max(1, Math.floor(targetWidth / pixelSize));
    const rows = Math.max(1, Math.floor(targetHeight / pixelSize));
    const canvasWidth = columns * pixelSize;
    const canvasHeight = rows * pixelSize;

    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.canvas.style.aspectRatio = `${canvasWidth} / ${canvasHeight}`;

    const sourceGrid = sampleImage(source, columns, rows);
    const guideGrid = sampleImage(guide, columns, rows);
    const vertices = buildPixelMapping(sourceGrid, guideGrid, settings.strength);

    const gl = this.gl;
    const count = columns * rows;

    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const stride = floatsPerPixel * Float32Array.BYTES_PER_ELEMENT;

    gl.enableVertexAttribArray(this.startLocation);
    gl.vertexAttribPointer(
      this.startLocation,
      2,
      gl.FLOAT,
      false,
      stride,
      0,
    );

    gl.enableVertexAttribArray(this.endLocation);
    gl.vertexAttribPointer(
      this.endLocation,
      2,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT,
    );

    gl.enableVertexAttribArray(this.colorLocation);
    gl.vertexAttribPointer(
      this.colorLocation,
      3,
      gl.FLOAT,
      false,
      stride,
      4 * Float32Array.BYTES_PER_ELEMENT,
    );

    gl.uniform1f(this.pointSizeLocation, pixelSize);
    gl.clearColor(0.055, 0.055, 0.055, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.frameRenderer = (progress: number) => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(this.progressLocation, progress);
      gl.drawArrays(gl.POINTS, 0, count);
    };

    const startTime = performance.now();
    const duration = Math.max(300, 1300 / Math.max(0.25, settings.movement));

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(this.progressLocation, progress);
      gl.drawArrays(gl.POINTS, 0, count);

      if (progress < 1) {
        this.frameId = requestAnimationFrame(animate);
      }
    };

    this.frameId = requestAnimationFrame(animate);
  }

  renderFrame(progress: number) {
    cancelAnimationFrame(this.frameId);
    this.frameRenderer?.(progress);
  }

  destroy() {
    cancelAnimationFrame(this.frameId);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}

function sampleImage(image: HTMLImageElement, width: number, height: number): PixelGrid {
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;

  const context = offscreen.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error("Could not sample image to render");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  drawCover(context, image, width, height);

  return {
    data: context.getImageData(0, 0, width, height).data,
    width,
    height,
  };
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const cropX = (image.naturalWidth - cropWidth) / 2;
  const cropY = (image.naturalHeight - cropHeight) / 2;

  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
}

function buildPixelMapping(source: PixelGrid, guide: PixelGrid, strength: number): Float32Array {
  const count = source.width * source.height;
  const sourceOrder = Array.from({ length: count }, (_, index) => index);
  const guideOrder = Array.from({ length: count }, (_, index) => index);

  sourceOrder.sort((a, b) => pixelLuminance(source.data, a) - pixelLuminance(source.data, b));
  guideOrder.sort((a, b) => guideTone(guide.data, a) - guideTone(guide.data, b));

  const vertices = new Float32Array(count * floatsPerPixel);

  for (let rank = 0; rank < count; rank++) {
    const sourceIndex = sourceOrder[rank];
    const destinationIndex = guideOrder[rank];

    const sourceX = sourceIndex % source.width;
    const sourceY = Math.floor(sourceIndex / source.width);
    const destinationX = destinationIndex % guide.width;
    const destinationY = Math.floor(destinationIndex / guide.width);

    const startX = ((sourceX + 0.5) / source.width) * 2 - 1;
    const startY = 1 - ((sourceY + 0.5) / source.height) * 2;
    const endX = ((destinationX + 0.5) / guide.width) * 2 - 1;
    const endY = 1 - ((destinationY + 0.5) / guide.height) * 2;

    const sourceOffset = sourceIndex * 4;
    const targetTone = guideTone(guide.data, destinationIndex);
    const sourceTone = pixelLuminance(source.data, sourceIndex);
    const toneAdjustment = (targetTone - sourceTone) * strength;

    const vertexOffset = rank * floatsPerPixel;

    vertices[vertexOffset] = startX;
    vertices[vertexOffset + 1] = startY;
    vertices[vertexOffset + 2] = endX;
    vertices[vertexOffset + 3] = endY;

    vertices[vertexOffset + 4] = clamp01(source.data[sourceOffset] / 255 + toneAdjustment);
    vertices[vertexOffset + 5] = clamp01(source.data[sourceOffset + 1] / 255 + toneAdjustment);
    vertices[vertexOffset + 6] = clamp01(source.data[sourceOffset + 2] / 255 + toneAdjustment);
  }

  return vertices;
}

function pixelLuminance(data: Uint8ClampedArray, index: number): number {
  const offset = index * 4;

  return (
    (0.299 * data[offset] +
      0.587 * data[offset + 1] +
      0.114 * data[offset + 2]) /
    255
  );
}

function guideTone(data: Uint8ClampedArray, index: number): number {
  const tone = pixelLuminance(data, index);
  const normalized = clamp01((tone - 0.12) / (0.86 - 0.12));

  // soft curve cuz why not ig
  return normalized * normalized * (3 - 2 * normalized);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not make a WebGL shader");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Error compiling WebGL: ${message}`);
  }

  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  if (!program) throw new Error("Could not create WebGL program");

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Could not load WebGL: ${message}`);
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}
