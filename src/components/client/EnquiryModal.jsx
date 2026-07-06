import { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';

export default function EnquiryModal({ product, onClose }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const submit = async () => {
    setSending(true);
    try {
      const { error } = await supabase.rpc('submit_client_enquiry', {
        p_product_code: product.code, p_product_name: product.name, p_message: message || null,
      });
      if (error) throw error;
      toast.success("Enquiry sent! We'll get back to you within 24 hours.");
      onClose();
    } catch (err) { toast.error(err.message); setSending(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-[#0B2143]">Enquire</h3>
            <p className="text-sm text-gray-500">{product.name}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <textarea className="input-light min-h-[110px]" placeholder="Tell us what you'd like to know…"
                  value={message} onChange={e => setMessage(e.target.value)} />
        <button onClick={submit} disabled={sending}
                className="mt-3 w-full inline-flex items-center justify-center gap-1 bg-red-500 text-white rounded-full py-2.5 text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send enquiry
        </button>
      </div>
    </div>
  );
}
