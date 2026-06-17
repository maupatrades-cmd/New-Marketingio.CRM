import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

const BUCKET_BASE =
  'https://yyrzppuntgtvurnnksfc.supabase.co/storage/v1/object/public/brand-assets';
const ASSET = {
  bg:        `${BUCKET_BASE}/grand-entrance.mp4`,
  mascotWebm: `${BUCKET_BASE}/mascot-transparent.webm`,
  mascotMov:  `${BUCKET_BASE}/mascot-transparent.mov`,
  mascotPng:  `${BUCKET_BASE}/mascot.png`,
};
const LOGO_URL =
  'https://media.base44.com/images/public/69f52863b2b733d922d90b62/ce0ebdea2_marketing_io_main_logo-removebg-preview.png';

export default function Welcome() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [continueBusy, setContinueBusy] = useState(false);
  const [mascotFailed, setMascotFailed] = useState(false);

  const { data: client, isLoading } = useQuery({
    queryKey: ['my-client', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, business_name, contact_person, has_seen_welcome')
        .eq('client_user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // After 12s the video has run its course — show the CTA prominently.
  const [ctaReady, setCtaReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCtaReady(true), 3500);
    return () => clearTimeout(t);
  }, []);

  if (authLoading || isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-darkbg-900">
        <Loader2 size={24} className="animate-spin text-soft" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // Owner / admin / staff aren't clients — send them home.
  if (!client) return <Navigate to="/owner" replace />;
  // Already seen the welcome — go straight to the portal.
  if (client.has_seen_welcome) return <Navigate to="/client" replace />;

  const firstName =
    (client.contact_person?.split(' ')[0] || client.business_name || 'friend').trim();

  async function onContinue() {
    if (continueBusy) return;
    setContinueBusy(true);
    try {
      const { error } = await supabase.rpc('mark_welcome_seen');
      if (error) throw error;
      navigate('/client', { replace: true });
    } catch (err) {
      // Don't trap them on the welcome screen if the RPC hiccups — they
      // can still continue; we just may show this again next time.
      console.warn('mark_welcome_seen failed:', err?.message);
      navigate('/client', { replace: true });
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a2e]">
      {/* Background film */}
      <video
        autoPlay muted loop playsInline
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        poster={ASSET.mascotPng}
      >
        <source src={ASSET.bg} type="video/mp4" />
      </video>

      {/* Tinted overlay so the foreground reads on any frame */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/70" />

      {/* Transparent mascot — webm → mov → png fallback chain */}
      <div className="pointer-events-none absolute left-1/2 top-[16%] z-10 w-[min(54vw,520px)] -translate-x-1/2">
        {mascotFailed ? (
          <img
            src={ASSET.mascotPng}
            alt=""
            className="mx-auto block h-auto w-full select-none drop-shadow-[0_24px_40px_rgba(0,0,0,0.55)]"
            draggable={false}
          />
        ) : (
          <video
            autoPlay muted loop playsInline
            poster={ASSET.mascotPng}
            onError={() => setMascotFailed(true)}
            className="mx-auto block h-auto w-full select-none drop-shadow-[0_24px_40px_rgba(0,0,0,0.55)]"
          >
            <source src={ASSET.mascotWebm} type="video/webm" />
            <source src={ASSET.mascotMov}  type="video/quicktime" />
          </video>
        )}
      </div>

      {/* Foreground UI */}
      <div className="relative z-20 mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-end px-6 pb-20 text-center">
        <img
          src={LOGO_URL}
          alt="Marketing iO"
          className="mb-6 h-16 w-auto max-w-[260px] object-contain drop-shadow-[0_6px_24px_rgba(255,255,255,0.18)] sm:h-20"
        />

        <h1 className="font-display text-4xl font-extrabold text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] sm:text-6xl">
          Dumela, {firstName}!
        </h1>
        <p className="mt-3 max-w-md text-base text-white/85 sm:text-lg">
          Welcome to <span className="font-semibold text-brandred">Marketing iO</span>.
          We've been waiting for you — your portal is ready.
        </p>

        <button
          onClick={onContinue}
          disabled={continueBusy}
          className={`mt-8 inline-flex items-center gap-2 rounded-full px-8 py-3 text-base font-semibold text-white transition ${
            ctaReady ? 'animate-pulse-soft' : ''
          }`}
          style={{
            background: 'linear-gradient(135deg, #e63946 0%, #ff2e97 100%)',
            boxShadow: '0 12px 32px rgba(255, 49, 66, 0.45)',
          }}
        >
          {continueBusy ? (
            <><Loader2 size={18} className="animate-spin" /> Loading your portal…</>
          ) : (
            <>Continue to your portal <ArrowRight size={18} /></>
          )}
        </button>
        <button
          onClick={onContinue}
          className="mt-3 text-xs uppercase tracking-widest text-white/55 hover:text-white/85"
        >
          Skip intro
        </button>
      </div>

      <style>{`
        @keyframes pulse-soft {
          0%, 100% { transform: translateY(0); box-shadow: 0 12px 32px rgba(255,49,66,0.45); }
          50%      { transform: translateY(-3px); box-shadow: 0 20px 40px rgba(255,49,66,0.6); }
        }
        .animate-pulse-soft { animation: pulse-soft 2.4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
