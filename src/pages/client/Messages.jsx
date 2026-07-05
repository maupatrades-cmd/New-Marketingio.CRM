import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Send, MessageSquare, User, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

export default function ClientMessages() {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const listQ = useQuery({
    queryKey: ['my-messages'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_messages');
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('send_client_message', {
        p_subject: subject || null, p_body: body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Message sent');
      setSubject(''); setBody('');
      qc.invalidateQueries({ queryKey: ['my-messages'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const rows = listQ.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Messages</h1>
        <p className="text-sm text-gray-500 mt-1">Chat with the Marketing iO team.</p>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">New message</p>
        <input className="input-light" placeholder="Subject (optional)" value={subject}
               onChange={e => setSubject(e.target.value)} />
        <textarea className="input-light min-h-[100px]" placeholder="What can we help with?" value={body}
                  onChange={e => setBody(e.target.value)} />
        <button onClick={() => sendMut.mutate()} disabled={!body.trim() || sendMut.isPending}
                className="inline-flex items-center gap-1 rounded-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 text-sm transition">
          {sendMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send message
        </button>
      </section>

      <section className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">History</p>
        {listQ.isLoading && <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}
        {!listQ.isLoading && rows.length === 0 && (
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-8 text-center text-gray-500">
            <MessageSquare size={24} className="mx-auto mb-2" />
            No messages yet. Start a conversation above.
          </div>
        )}
        <ul className="space-y-2">
          {rows.map(m => (
            <li key={m.id}
                className={`rounded-xl border p-3 ${m.is_from_client
                  ? 'border-red-200 bg-red-50 ml-4 sm:ml-12'
                  : 'border-gray-100 bg-white shadow-sm mr-4 sm:mr-12'}`}>
              <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-1">
                {m.is_from_client ? <User size={11} /> : <Building2 size={11} />}
                <span>{m.is_from_client ? (m.sender_name || 'You') : (m.sender_name || 'Marketing iO')}</span>
                <span>·</span>
                <span>{new Date(m.created_at).toLocaleString('en-ZA')}</span>
              </div>
              {m.subject && <p className="text-sm font-semibold text-[#0B2143]">{m.subject}</p>}
              <p className="text-sm text-[#0B2143] whitespace-pre-wrap">{m.body}</p>
              {m.file_url && (
                <a href={m.file_url} target="_blank" rel="noreferrer"
                   className="mt-2 inline-block text-xs text-red-500 hover:underline">Attachment</a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
