// Client-only QR decoding. Prefers the native BarcodeDetector (Android Chrome
// and friends) and falls back to jsqr, which is only downloaded when needed.

export interface QrDecoder {
  kind: "native" | "jsqr";
  decode(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D | null,
  ): Promise<string | null>;
}

const MAX_EDGE = 640;

export async function createQrDecoder(): Promise<QrDecoder> {
  const Detector = window.BarcodeDetector;
  if (Detector) {
    try {
      const formats = await Detector.getSupportedFormats();
      if (formats.includes("qr_code")) {
        const detector = new Detector({ formats: ["qr_code"] });
        return {
          kind: "native",
          async decode(video) {
            try {
              const found = await detector.detect(video);
              return found[0]?.rawValue ?? null;
            } catch {
              // InvalidStateError before the first frame is available, etc.
              return null;
            }
          },
        };
      }
    } catch {
      // fall through to jsqr
    }
  }

  const { default: jsQR } = await import("jsqr");
  return {
    kind: "jsqr",
    async decode(video, canvas, ctx) {
      if (!ctx || !video.videoWidth || !video.videoHeight) return null;
      const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);
      return jsQR(image.data, w, h)?.data ?? null;
    },
  };
}
