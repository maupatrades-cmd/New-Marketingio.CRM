import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const SUGGESTED_PROMPTS = [
  'Give me 3 Instagram post ideas',
  'Write a WhatsApp promo for this week',
  'Ideas to drive foot traffic',
];

export default function SparkChat() {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState([]); // { role: 'user' | 'assistant', content: string }
  const [input, setInput]         = useState('');
  const [busy, setBusy]           = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [limitReached, setLimit]  = useState(false);
  const listRef                   = useRef(null);
  const inputRef                  = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || busy || limitReached) return;
    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('brand-advisor', {
        body: { messages: nextMessages },
      });
      if (error) throw error;
      if (data?.error && !data?.reply) throw new Error(data.error);
      setMessages(m => [...m, { role: 'assistant', content: data?.reply || 'Sorry — no reply.' }]);
      if (typeof data?.remaining === 'number') setRemaining(data.remaining);
      if (data?.limit_reached) setLimit(true);
    } catch (e) {
      setMessages(m => [
        ...m,
        { role: 'assistant', content: `Sorry — I hit a snag: ${e.message || 'unknown error'}. Try again in a moment.` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const usePrompt = (q) => { setInput(q); setTimeout(() => inputRef.current?.focus(), 30); };

  return (
    <>
      {/* Floating Action Button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Spark"
        className={`fixed bottom-24 md:bottom-4 right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${open ? 'opacity-0 scale-0 pointer-events-none' : 'opacity-100 scale-100 hover:scale-105'}`}
        style={{
          background: 'linear-gradient(180deg, #0B2143 0%, #061638 100%)',
          boxShadow: `
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            inset 0 -6px 12px -4px rgba(230, 57, 70, 0.5),
            0 8px 20px -6px rgba(11, 33, 67, 0.55),
            0 4px 10px -3px rgba(230, 57, 70, 0.5)
          `,
        }}
      >
        <Sparkles size={22} className="text-white drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
      </button>

      {/* Chat panel */}
      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpen(false)}
          />

          <div
            className="fixed z-50 flex flex-col overflow-hidden shadow-2xl border border-white/10
                       inset-x-0 bottom-0 top-16 rounded-t-2xl
                       md:inset-auto md:bottom-4 md:right-4 md:w-[400px] md:h-[600px] md:max-h-[80vh] md:rounded-2xl md:top-auto"
            style={{ background: 'linear-gradient(180deg, #0B2143 0%, #061638 100%)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    background: 'rgba(239, 68, 68, 0.18)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 12px rgba(239,68,68,0.35)',
                  }}
                >
                  <Sparkles size={18} className="text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">Spark</p>
                  <p className="text-[10px] text-white/60 uppercase tracking-widest">Brand Advisor</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {remaining !== null && (
                  <span className="text-[10px] text-white/70 font-semibold uppercase tracking-widest tabular-nums">
                    {remaining}/5 today
                  </span>
                )}
                <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Message list */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <div
                    className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3"
                    style={{
                      background: 'rgba(239, 68, 68, 0.18)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 20px rgba(239,68,68,0.4)',
                    }}
                  >
                    <Sparkles size={26} className="text-red-400" />
                  </div>
                  <p className="text-white font-bold">Hi, I'm Spark ⚡</p>
                  <p className="text-white/70 text-xs mt-2 max-w-[280px] mx-auto leading-relaxed">
                    Your brand advisor. Ask for content ideas, captions, promos, or how to grow your presence locally.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2 justify-center px-2">
                    {SUGGESTED_PROMPTS.map(q => (
                      <button
                        key={q}
                        onClick={() => usePrompt(q)}
                        className="text-[11px] px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 text-white/85 border border-white/15 transition"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#E2293B] text-white rounded-br-sm shadow-sm'
                        : 'bg-white/10 text-white rounded-bl-sm border border-white/10'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5 inline-flex items-center gap-2 text-white/70 text-xs">
                    <Loader2 size={12} className="animate-spin" /> Spark is thinking…
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-white/10">
              {limitReached ? (
                <p className="text-xs text-amber-300 text-center py-2">
                  Daily question limit reached. Back tomorrow ⚡
                </p>
              ) : (
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                    }}
                    rows={1}
                    placeholder="Ask Spark…"
                    disabled={busy}
                    className="flex-1 bg-white/8 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30 resize-none max-h-24"
                  />
                  <button
                    onClick={() => send()}
                    disabled={busy || !input.trim()}
                    className="w-10 h-10 rounded-full bg-[#E2293B] hover:bg-[#c91e33] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition shadow-sm"
                    aria-label="Send"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
