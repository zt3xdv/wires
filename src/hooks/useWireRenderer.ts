import { useEffect, useRef } from "preact/hooks";
import WebGLPixelRenderer from "../lib/WebGLPixelRenderer.ts";

type RendererSettings = {
  sourceUrl: string;
  guideUrl: string;
  pixelSize: number;
  strength: number;
  movement: number;
  onError: (message: string) => void;
};

type CanvasRef = {
  current: HTMLCanvasElement | null;
};

export default function useWireRenderer(canvasRef: CanvasRef, { sourceUrl, guideUrl, pixelSize, strength, movement, onError }: RendererSettings) {
  const rendererRef = useRef<WebGLPixelRenderer | null>(null);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    try {
      if (canvasRef.current) {
        rendererRef.current = new WebGLPixelRenderer(canvasRef.current);
      }
    } catch (error) {
      onErrorRef.current(
        error instanceof Error ? error.message : "Error al iniciar WebGL.",
      );
    }

    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [canvasRef]);

  useEffect(() => {
    if (!sourceUrl || !guideUrl || !rendererRef.current) return;

    let cancelled = false;

    Promise.all([loadImage(sourceUrl), loadImage(guideUrl)]).then(([source, guide]) => {
      if (cancelled) return;

      rendererRef.current?.render(source, guide, { pixelSize, strength, movement });
      onErrorRef.current("");
    }).catch((error: unknown) => {
      if (cancelled) return;

      onErrorRef.current(error instanceof Error ? error.message : "Image so bad i can't even load it, try again");
    });

    return () => {
      cancelled = true;
    };
  }, [sourceUrl, guideUrl, pixelSize, strength, movement]);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image so bad i can't even load it, try again"));
    image.src = url;
  });
}
