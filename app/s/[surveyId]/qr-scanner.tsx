"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createQrDecoder } from "@/lib/qr/decode";

type ScanError = "insecure" | "denied" | "notfound" | "busy" | "other";
type Status = "starting" | "scanning" | { error: ScanError };

const MESSAGES: Record<ScanError, string> = {
  insecure: "この環境ではカメラを使えません（HTTPS接続が必要です）。",
  denied: "カメラの使用が許可されていません。ブラウザの設定でカメラを許可してください。",
  notfound: "カメラが見つかりません。",
  busy: "カメラを起動できません。他のアプリがカメラを使用している可能性があります。",
  other: "カメラを起動できませんでした。",
};

const DECODE_INTERVAL_MS = 150;

function mapError(e: unknown): ScanError {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "notfound";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "other";
}

export function QrScanner({
  onResult,
  onClose,
}: {
  onResult: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<Status>("starting");

  const handleResult = useEffectEvent((text: string) => {
    try {
      navigator.vibrate?.(30);
    } catch {
      // unsupported (iOS)
    }
    onResult(text);
  });
  const handleClose = useEffectEvent(() => onClose());

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video.srcObject = null;
    };

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus({ error: "insecure" });
        return;
      }
      let decoder;
      try {
        decoder = await createQrDecoder();
      } catch {
        setStatus({ error: "other" });
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (e) {
        setStatus({ error: mapError(e) });
        return;
      }
      // Closed while the permission prompt was open: release the camera.
      if (cancelled) {
        stop();
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // muted + playsInline: iOS still plays, ignore
      }
      if (cancelled) {
        stop();
        return;
      }
      setStatus("scanning");
      let busy = false;
      timer = window.setInterval(async () => {
        if (cancelled || busy || document.hidden) return;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
        busy = true;
        try {
          const text = await decoder.decode(video, canvas, ctx);
          if (text && !cancelled) {
            cancelled = true;
            stop();
            handleResult(text);
          }
        } finally {
          busy = false;
        }
      }, DECODE_INTERVAL_MS);
    })();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    // iOS suspends the camera when the tab is hidden; close deterministically.
    const onHide = () => {
      if (document.hidden) handleClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      cancelled = true;
      stop();
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const message =
    status === "starting"
      ? "カメラを起動しています…"
      : status === "scanning"
        ? "来場者のQRコードを枠に合わせてください"
        : MESSAGES[status.error];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="来場者のQRコードを読み取る"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white overscroll-none"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        <div className="aspect-square w-[min(70vw,70vh)] rounded-lg border-2 border-white/80" />
      </div>
      <div className="relative flex flex-1 flex-col justify-between px-6 pt-safe pb-safe">
        <p aria-live="polite" className="pt-6 text-center text-sm text-white/85">
          {message}
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mb-6 w-full min-h-14 rounded-md bg-white/15 text-[17px] font-medium text-white backdrop-blur transition-[background-color] duration-(--dur-fast) hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
