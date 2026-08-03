import * as React from "react";

/**
 * RECOGNITION-01 — hiệu ứng gửi thành công (1,2 giây, không âm thanh).
 * Tôn trọng prefers-reduced-motion: chỉ fade nhẹ, không có hạt bay.
 */
const SPARKS = ["✨", "🎉", "💚", "👏", "🌱", "🔥"];

export function RecognitionBurst({
  receiverName,
  onDone,
}: {
  receiverName: string;
  onDone: () => void;
}) {
  React.useEffect(() => {
    const timer = window.setTimeout(onDone, 1300);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-4"
    >
      <div className="relative flex max-w-full items-center gap-2 rounded-card border border-brand-secondary bg-brand-subtle px-4 py-3 text-body text-text-primary shadow-lg motion-safe:animate-scale-in motion-reduce:animate-fade-in">
        <span aria-hidden className="text-h3">
          ✨
        </span>
        <span className="min-w-0 break-words">
          Một lời ghi nhận vừa được gửi đến {receiverName} ✨
        </span>
        <span aria-hidden className="motion-reduce:hidden">
          {SPARKS.map((spark, index) => (
            <span
              key={spark}
              className="absolute left-1/2 top-1/2 motion-safe:animate-fade-out"
              style={{
                transform: `rotate(${index * 60}deg) translateY(-${40 + index * 6}px)`,
                animationDuration: "1.2s",
              }}
            >
              {spark}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}