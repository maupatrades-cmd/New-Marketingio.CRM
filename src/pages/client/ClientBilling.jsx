import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, Save, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';

const DEBIT_DAYS = ['1st', '15th'];

export default function ClientBilling() {
  const navigate = useNavigate();
  const [debitDay, setDebitDay] = useState('');

  const subQ = useQuery({
    queryKey: ['my-subscription'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_subscription');
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (subQ.data?.mandate?.debit_day && !debitDay) setDebitDay(subQ.data.mandate.debit_day);
  }, [subQ.data, debitDay]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('update_my_billing', { p_debit_day: debitDay || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Billing updated'); navigate('/client/subscription'); },
    onError: (err) => toast.error(err.message),
  });

  if (subQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-6 max-w-lg">
      <Link to="/client/subscription" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#0B2143]">
        <ChevronLeft size={16} /> Back to subscription
      </Link>
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Update Billing</h1>
        <p className="text-sm text-gray-500 mt-1">Choose which day your monthly fee is collected.</p>
      </div>

      <section className="bg-white/85 backdrop-blur-xl rounded-2xl border border-white/80 p-6 shadow-sm space-y-4">
        <div>
          <label className="label-light">Debit collection day</label>
          <div className="flex gap-3">
            {DEBIT_DAYS.map(d => (
              <button key={d} type="button" onClick={() => setDebitDay(d)}
                      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition ${debitDay === d ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 bg-white text-gray-500 hover:text-[#0B2143]'}`}>
                {d} of each month
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-400">To change your bank account, re-sign the debit mandate on your onboarding form or message us on WhatsApp.</p>
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !debitDay}
                className="inline-flex items-center gap-1 bg-red-500 text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition">
          {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </section>
    </div>
  );
}
