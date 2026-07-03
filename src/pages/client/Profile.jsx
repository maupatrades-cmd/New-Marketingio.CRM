import { useQuery } from '@tanstack/react-query';
import { Loader2, User, Building2, Mail, Phone, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

export default function ClientProfile() {
  const summaryQ = useQuery({
    queryKey: ['client-portal-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_portal_summary');
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data;
    },
  });

  if (summaryQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-soft" /></div>;
  if (summaryQ.isError)   return <div className="text-rose-400 text-sm">{summaryQ.error?.message}</div>;
  const c = summaryQ.data?.client;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl text-gradient">My Profile</h1>
        <p className="text-sm text-soft mt-1">Your account details.</p>
      </div>

      <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-6 space-y-4">
        <Row icon={Building2} label="Business" value={c?.business_name} />
        <Row icon={User}      label="Contact person" value={c?.contact_person} />
        <Row icon={Mail}      label="Email" value={c?.email} />
        <Row icon={Phone}     label="Phone" value={c?.phone} />
      </div>

      <div className="rounded-xl border border-darkbg-border bg-darkbg-800/30 p-4 space-y-2">
        <p className="text-xs uppercase tracking-widest text-soft">Need to update your details?</p>
        <a href="https://wa.me/27768038987" target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition">
          <MessageCircle size={14} /> Message us on WhatsApp
        </a>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="mt-1 text-soft shrink-0" />
      <div>
        <p className="text-xs uppercase tracking-wider text-soft">{label}</p>
        <p className="text-sm text-white mt-0.5">{value || <span className="text-soft italic">Not set</span>}</p>
      </div>
    </div>
  );
}
