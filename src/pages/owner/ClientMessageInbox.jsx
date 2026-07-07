import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { MessageCircle, Send, Loader2, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';

// Staff Client Messages inbox — /owner/comms/client-messages.
// Left panel: one row per client with messages, ordered by most recent.
// Right panel: the selected client's thread + reply input.
// Poll every 15s so the badge counts stay fresh without websockets.

const timeAgo = (d) => {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function ClientMessageInbox() {
  const [selectedClient, setSelectedClient] = useState(null);
  const [replyText, setReplyText] = useState('');
  const bottomRef = useRef(null);

  const threadsQ = useQuery({
    queryKey: ['client-message-threads'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_message_threads');
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const messagesQ = useQuery({
    queryKey: ['client-thread-messages', selectedClient],
    enabled: !!selectedClient,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_thread_messages', { p_client_id: selectedClient });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const replyMut = useMutation({
    mutationFn: async () => {
      const body = replyText.trim();
      if (!body) throw new Error('Empty message');
      const { error } = await supabase.rpc('reply_to_client_message', {
        p_client_id: selectedClient,
        p_body: body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReplyText('');
      messagesQ.refetch();
      threadsQ.refetch();
      toast.success('Reply sent');
    },
    onError: (err) => toast.error(err.message ?? 'Failed to send reply'),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesQ.data, selectedClient]);

  const selectedThread = threadsQ.data?.find(t => t.client_id === selectedClient);

  return (
    <div className="h-[calc(100vh-120px)] flex gap-4">
      {/* Left — thread list */}
      <div className="w-full sm:w-80 shrink-0 bg-darkbg-900/40 rounded-2xl border border-darkbg-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-darkbg-border/60">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-red-400" />
            <h2 className="text-sm font-semibold text-white">Client Messages</h2>
          </div>
          <p className="text-xs text-soft mt-1">{threadsQ.data?.length ?? 0} conversation{threadsQ.data?.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threadsQ.isLoading && (
            <div className="p-4 text-center text-xs text-soft">Loading…</div>
          )}
          {!threadsQ.isLoading && (threadsQ.data ?? []).length === 0 && (
            <div className="p-6 text-center text-xs text-soft">
              No client messages yet.
            </div>
          )}
          {(threadsQ.data ?? []).map(t => (
            <button
              key={t.client_id}
              onClick={() => setSelectedClient(t.client_id)}
              className={`w-full text-left px-4 py-3 border-b border-darkbg-border/40 hover:bg-white/5 transition
                ${selectedClient === t.client_id ? 'bg-white/10' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white text-sm truncate">{t.client_name}</span>
                {t.unread_count > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shrink-0">
                    {t.unread_count}
                  </span>
                )}
              </div>
              <p className="text-xs text-soft truncate mt-0.5">
                {t.last_message_from_client ? '' : 'You: '}{t.last_message_body}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">{timeAgo(t.last_message_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right — messages */}
      <div className="flex-1 hidden sm:flex bg-darkbg-900/40 rounded-2xl border border-darkbg-border flex-col overflow-hidden">
        {!selectedClient ? (
          <div className="flex-1 flex items-center justify-center text-soft text-sm">
            Select a client to view messages
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-darkbg-border/60 flex items-center gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{selectedThread?.client_name ?? 'Client'}</p>
                <p className="text-[11px] text-soft">{selectedThread?.total_messages ?? 0} messages</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messagesQ.isLoading && <div className="text-center text-xs text-soft">Loading messages…</div>}
              {(messagesQ.data ?? []).map(m => (
                <div key={m.id} className={`flex ${m.is_from_client ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.is_from_client
                      ? 'bg-white/10 text-white'
                      : 'bg-red-500/25 text-white border border-red-500/30'
                  }`}>
                    <p className="text-[10px] font-semibold mb-0.5 opacity-70">{m.sender_name}</p>
                    {m.subject && <p className="text-[11px] font-semibold opacity-80 mb-1">{m.subject}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    {m.file_url && (
                      <a href={m.file_url} target="_blank" rel="noreferrer"
                         className="mt-1 inline-flex items-center gap-1 text-[11px] opacity-80 underline">
                        <Paperclip size={11} /> Attachment
                      </a>
                    )}
                    <p className="text-[10px] opacity-50 mt-1">{timeAgo(m.created_at)}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="p-3 border-t border-darkbg-border flex gap-2 items-end">
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Type your reply…"
                rows={1}
                className="flex-1 bg-white/5 border border-darkbg-border rounded-xl px-4 py-2 text-sm text-white placeholder:text-gray-500 resize-none max-h-32"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (replyText.trim()) replyMut.mutate();
                  }
                }}
              />
              <button
                onClick={() => replyMut.mutate()}
                disabled={!replyText.trim() || replyMut.isPending}
                className="bg-red-500 hover:bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1"
              >
                {replyMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
