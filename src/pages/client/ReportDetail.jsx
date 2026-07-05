import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronLeft, Download, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

export default function ClientReportDetail() {
  const { id } = useParams();
  const listQ = useQuery({
    queryKey: ['my-reports'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_reports');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (listQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-soft" /></div>;
  const r = (listQ.data ?? []).find(x => x.id === id);
  if (!r) return <div className="text-soft text-sm">Report not found.</div>;

  return (
    <div className="space-y-6">
      <Link to="/client/reports" className="inline-flex items-center gap-1 text-sm text-soft hover:text-white">
        <ChevronLeft size={16} /> Back to reports
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-white">{r.report_month}</h1>
          {r.package && <span className="inline-block mt-1 rounded-full border border-blue-400/40 bg-blue-400/10 px-2 py-0.5 text-xs text-blue-300 uppercase">{r.package}</span>}
        </div>
        {r.report_url && (
          <a href={r.report_url} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 rounded-lg bg-brandred hover:bg-brandred/80 text-white px-3 py-2 text-xs transition">
            <Download size={12} /> Download report
          </a>
        )}
      </div>

      {r.social_posts_published != null && (
        <section className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-6">
          <p className="text-xs uppercase tracking-widest text-soft mb-2">Posts Published</p>
          <p className="text-3xl font-display text-gradient">{r.social_posts_published}</p>
        </section>
      )}

      {r.engagement_summary && (
        <Section title="Engagement summary" body={r.engagement_summary} />
      )}
      {r.top_performing_content && (
        <Section title="Top performing content" body={r.top_performing_content} />
      )}
      {r.recommendations && (
        <Section title="Recommendations from the team" body={r.recommendations} />
      )}

      {!r.social_posts_published && !r.engagement_summary && !r.report_url && (
        <div className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-8 text-center text-soft">
          <BarChart3 size={32} className="mx-auto text-soft mb-2" />
          Report is still being prepared. Check back soon.
        </div>
      )}
    </div>
  );
}

function Section({ title, body }) {
  return (
    <section className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-6">
      <p className="text-xs uppercase tracking-widest text-soft mb-3">{title}</p>
      <p className="text-sm text-white whitespace-pre-wrap">{body}</p>
    </section>
  );
}
