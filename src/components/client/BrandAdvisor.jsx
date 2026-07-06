// "Spark" — client-facing brand & marketing advisor for the portal.
// Advice + ready-to-use content (captions, post ideas). Read-only, 5 questions/day.

import { useRef, useState } from 'react';
import { Send, Loader2, Copy, Check, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const NAVY = '#001B54';
const RED = '#C8102E';

const STARTERS = [
  "Give me 3 post ideas for this week",
  "Write a caption for a special I'm running",
  "How do I get more customers walking in?",
];

export default function BrandAdvisor() {
  const [messages, setMessages] = useState([]);   // {role, text}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(null); // questions left today
  const [copiedIdx, setCopiedIdx] = useState(null);
  const scroller = useRef(null);

  const scrollDown = () =>
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: 1e9, behavior: 'smooth' }));

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy || remaining === 0) return;
    setInput('');
    const next = [...messages, { role: 'user', text: q }];
    setMessages(next);
    setBusy(true);
    scrollDown();

    try {
      const { data, error } = await supabase.functions.invoke('brand-advisor', {
        body: { messages: next.map((m) => ({ role: m.role, content: m.text })) },
      });
      if (error) throw error;
      setMessages((m) => [...m, { role: 'assistant', text: data.reply || '…' }]);
      if (typeof data.remaining === 'number') setRemaining(data.remaining);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: "Sorry — I couldn't answer just now. Please try again in a moment." }]);
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  async function copy(text, idx) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch { /* clipboard blocked — ignore */ }
  }

  const outOfQuestions = remaining === 0;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl px-4 py-3 text-white" style={{ background: NAVY }}>
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: RED }}>
            <Zap size={16} />
          </span>
          <div>
            <div className="font-semibold leading-tight">Spark</div>
            <div className="text-[11px] text-white/70 leading-tight">Your marketing ideas partner</div>
          </div>
        </div>
        {remaining !== null && (
          <div className="text-[11px] text-white/70">{remaining} of 5 left today</div>
        )}
      </div>

      {/* Transcript */}
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mt-4">
            <div className="text-center text-sm text-slate-500">
              Hi! I'm Spark. Ask me anything about growing your business — or I'll write posts for you.
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex flex-col items-start'}>
            <div
              className={
                'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ' +
                (m.role === 'user' ? 'bg-slate-100 text-slate-800' : 'text-white')
              }
              style={m.role === 'assistant' ? { background: NAVY } : undefined}
            >
              {m.text}
            </div>
            {m.role === 'assistant' && (
              <button
                onClick={() => copy(m.text, i)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
              >
                {copiedIdx === i ? <Check size={12} /> : <Copy size={12} />}
                {copiedIdx === i ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Spark is thinking…
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 p-3">
        {outOfQuestions ? (
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
            That's your 5 questions for today. See you tomorrow — or message your Marketing iO team any time.
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Ask Spark…"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <button
              onClick={() => send()}
              disabled={busy || !input.trim()}
              className="grid h-9 w-9 place-items-center rounded-xl text-white disabled:opacity-50"
              style={{ background: NAVY }}
            >
              <Send size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
