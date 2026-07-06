import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const DANCE_VIDEO_URL =
  'https://yyrzppuntgtvurnnksfc.supabase.co/storage/v1/object/public/Successful%20payment%20dance/dance.mp4';

export default function PaymentSuccessModal({
  open,
  onClose,
  title = 'Payment Successful',
  subtitle = "Your invoice has been cleared. Let's get back to growing your brand.",
  ctaLabel = 'Back to Dashboard',
}) {
  const videoRef = useRef(null);

  // Restart the dance every time the modal re-opens — a returning client
  // should see the celebration from the first frame, not mid-loop.
  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (v) { try { v.currentTime = 0; v.play().catch(() => {}); } catch {} }
  }, [open]);

  // Escape closes the modal — same affordance as the visible Close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B2143]/60 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-success-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur-xl overflow-hidden animate-fade-in-up"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 rounded-full w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="px-6 pt-6 pb-2">
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="pointer-events-none drop-shadow-xl w-64 h-64 mx-auto object-contain"
          >
            <source src={DANCE_VIDEO_URL} type="video/mp4" />
          </video>
        </div>

        <div className="px-6 pb-6 text-center">
          <h2
            id="payment-success-title"
            className="text-[#0B2143] text-2xl font-black tracking-tight"
          >
            {title}
          </h2>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            {subtitle}
          </p>

          <button
            onClick={onClose}
            className="mt-6 w-full inline-flex items-center justify-center rounded-full bg-[#EF4444] hover:bg-red-600 text-white px-6 py-3 text-sm font-semibold shadow-md hover:shadow-lg transition"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
