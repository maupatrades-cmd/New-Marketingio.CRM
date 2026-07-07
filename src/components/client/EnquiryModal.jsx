import { useState } from 'react';
import { X, Send, Loader2, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';

// Two intents share the same RPC + modal chrome. Buy pre-fills a
// purchase-intent message so the owner sees a hot signal in the enquiry
// feed instead of a soft "just curious" note.
const COPY = {
  enquire: {
    title:        'Enquire',
    placeholder:  "Tell us what you'd like to know…",
    button:       'Send enquiry',
    toast:        "Enquiry sent! We'll get back to you within 24 hours.",
    prefill:      '',
    Icon:         Send,
  },
  buy: {
    title:        'Purchase Request',
    placeholder:  'Anything specific we should know — start date, extras, invoice recipient…',
    button:       'Send purchase request',
    toast:        "Purchase request sent! We'll invoice you within 24 hours so you can pay and get started.",
    prefill:      p => `I'd like to buy ${p.name}. Please invoice me so I can pay.`,
    Icon:         ShoppingBag,
  },
};

export default function EnquiryModal({ product, mode = 'enquire', onClose }) {
  const copy = COPY[mode] ?? COPY.enquire;
  const [message, setMessage] = useState(
    typeof copy.prefill === 'function' ? copy.prefill(product) : (copy.prefill ?? '')
  );
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    try {
      const suffix = mode === 'buy' ? '\n\n[Purchase intent — client clicked Buy on the products page.]' : '';
      const body   = ((message || '').trim() + suffix).trim() || null;
      const { error } = await supabase.rpc('submit_client_enquiry', {
        p_product_code: product.code, p_product_name: product.name, p_message: body,
      });
      if (error) throw error;
      toast.success(copy.toast);
      onClose();
    } catch (err) { toast.error(err.message); setSending(false); }
  };

  const Icon = copy.Icon;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-[#0B2143]">{copy.title}</h3>
            <p className="text-sm text-gray-500">{product.name}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <textarea className="input-light min-h-[110px]" placeholder={copy.placeholder}
                  value={message} onChange={e => setMessage(e.target.value)} />
        <button onClick={submit} disabled={sending}
                className="mt-3 w-full inline-flex items-center justify-center gap-1 bg-red-500 text-white rounded-full py-2.5 text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />} {copy.button}
        </button>
      </div>
    </div>
  );
}
