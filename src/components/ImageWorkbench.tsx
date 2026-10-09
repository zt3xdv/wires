import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import wiresSrc from "../assets/wires.jpg";
import useWireRenderer from "../hooks/useWireRenderer.ts";
import GIF from "gif.js";

export default function ImageWorkbench() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [pixelSize, setPixelSize] = useState(8);
  const [movement, setMovement] = useState(1);
  const [error, setError] = useState("");
  const [isGifLoading, setIsGifLoading] = useState(false);

  const renderFrame = useWireRenderer(canvasRef, {
    sourceUrl: imageUrl,
    guideUrl: wiresSrc,
    pixelSize,
    strength: 0,
    movement,
    onError: setError,
  });

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  function handleFile(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;

    const nextUrl = URL.createObjectURL(file);

    setImageUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return nextUrl;
    });

    setFileName(file.name);
    setError("");
  }

  function handleDrop(event: JSX.TargetedDragEvent<HTMLDivElement>) {
    event.preventDefault();
    handleFile(event.dataTransfer.files?.[0]);
  }

  function downloadImage() {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;

    const link = document.createElement("a");
    link.download = "wiresed-image.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
  
  async function downloadGif() {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl || isGifLoading) return;

    setIsGifLoading(true);
    setError("");

    try {
      const source = await loadImageForGif(imageUrl);
      const originalCanvas = document.createElement("canvas");
      originalCanvas.width = canvas.width;
      originalCanvas.height = canvas.height;

      const originalContext = originalCanvas.getContext("2d");
      if (!originalContext) throw new Error("Could not create GIF canvas");

      drawImageCover(originalContext, source, originalCanvas.width, originalCanvas.height);

      const gif = new GIF({
        workers: 2,
        quality: 10,
        repeat: 0,
        width: canvas.width,
        height: canvas.height,
        workerScript: "/gif.worker.js",
      });

      const frameDelay = 100;
      const holdFrames = 20;
      const animationDuration = Math.max(300, 1300 / Math.max(0.25, movement));
      const animationFrames = Math.max(2, Math.ceil(animationDuration / frameDelay));

      for (let index = 0; index < holdFrames; index++) {
        gif.addFrame(originalCanvas, { delay: frameDelay, copy: true });
      }

      for (let index = 0; index < animationFrames; index++) {
        renderFrame(index / (animationFrames - 1));
        gif.addFrame(canvas, { delay: frameDelay, copy: true });
      }

      for (let index = 0; index < holdFrames; index++) {
        renderFrame(1);
        gif.addFrame(canvas, { delay: frameDelay, copy: true });
      }

      gif.on("finished", (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = "wiresed-animation.gif";
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        setIsGifLoading(false);
      });

      gif.render();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create GIF");
      setIsGifLoading(false);
    }
  }

  return (
    <section className="workbench">
      <div className={`preview ${imageUrl ? "preview--ready" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <canvas ref={canvasRef} className="preview-canvas" width={1200} height={800}/>

        {!imageUrl && (
          <div className="empty-state">
            <strong>Drop an image</strong>
            <span>or select one from your thing</span>
            <button className="button button--light" onClick={() => fileInputRef.current?.click()}>
              Select Image
            </button>
          </div>
        )}
      </div>

      <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => handleFile(event.currentTarget.files?.[0])}/>

      <div className="controls">
        <div className="file-info">
          <span className="control-label">Origin</span>
          <span className="file-name">
            {fileName || "No image selected"}
          </span>
        </div>

        <button
          className="button button--outline"
          onClick={() => fileInputRef.current?.click()}
        >
          Pick an image
        </button>

        <label className="slider-control">
          <span>
            <span className="control-label">Pixel Size</span>
            <output>{pixelSize}px</output>
          </span>
          <input
            type="range"
            min={3}
            max={24}
            value={pixelSize}
            onInput={(event) =>
              setPixelSize(Number(event.currentTarget.value))
            }
          />
        </label>

        <label className="slider-control">
          <span>
            <span className="control-label">Speed</span>
            <output>{Math.round(movement * 100)}%</output>
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={movement}
            onInput={(event) =>
              setMovement(Number(event.currentTarget.value))
            }
          />
        </label>

        <button
          className="button button--light download-button"
          onClick={downloadImage}
          disabled={!imageUrl}
        >
          Download Image
        </button>
        <button
          className="button button--light download-button"
          onClick={downloadGif}
          disabled={!imageUrl || isGifLoading}
        >
          {isGifLoading ? "Creating GIF..." : "Download as GIF"}
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}
    </section>
  );
}

function loadImageForGif(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image for GIF"));
    image.src = url;
  });
}

function drawImageCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const cropX = (image.naturalWidth - cropWidth) / 2;
  const cropY = (image.naturalHeight - cropHeight) / 2;

  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
}
