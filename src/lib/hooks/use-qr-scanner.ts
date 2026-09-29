'use client';

import { useEffect, useRef, useState } from 'react';

// BarcodeDetector isn't in the standard lib.dom.d.ts yet.
type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorInstance = { detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

export const useQrScanner = (onScan: (value: string) => void) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Deliberately an effect, not a lazy useState initializer: `window`
    // doesn't exist during SSR, so computing this directly during render
    // would make the server's output ("unsupported") and the client's
    // first hydration pass ("supported") disagree, triggering a hydration
    // mismatch. Running it in an effect means the first client render
    // still matches the server output; the update to "supported" happens
    // in a safe, post-hydration render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window);
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsScanning(true);

      const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorConstructor }).BarcodeDetector;
      const detector = new Detector({ formats: ['qr_code'] });

      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          if (results[0]?.rawValue) {
            onScan(results[0].rawValue);
            stop();
            return;
          }
        } catch {
          // Detection can transiently fail on a mid-frame video — just try again next frame.
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setError('driver.qr.cameraDenied');
    }
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsScanning(false);
  };

  useEffect(() => stop, []);

  return { videoRef, isSupported, isScanning, error, start, stop };
};
