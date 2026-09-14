// Minimal ambient typing for the Shape Detection API's BarcodeDetector,
// which lib.dom.d.ts does not declare. Only the members we use.

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorInstance {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats(): Promise<string[]>;
}

interface Window {
  BarcodeDetector?: BarcodeDetectorCtor;
}
