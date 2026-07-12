import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const MANAGER_ROLES = ['owner', 'admin', 'head_of_tech'];
const ZAR = (v) => v == null
  ? '—'
  : `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const daysSince = (iso) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : '—';

const STAGE_LABEL = {
  new_lead: 'New lead', discovery_visit: 'Discovery visit', contacted: 'Contacted',
  qualified: 'Qualified', proposal_sent: 'Proposal sent', negotiation: 'Negotiation',
  closed_won: 'Closed won', closed_lost: 'Closed lost',
};

export default function SalesOpportunitiesCloser() {
  const { closer_id } = useParams();
  const { role } = useAuth();
  const navigate = useNavigate();

  const dealsQ = useQuery({
    queryKey: ['opp_closer', closer_id],
    enabled: MANAGER_ROLES.includes(role) && !!closer_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, client_name, stage, probability, setup_fee, monthly_retainer, closer_name, updated_at, created_at')
        .eq('closer_id', closer_id)
        .not('stage', 'in', '(closed_won,closed_lost)')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!MANAGER_ROLES.includes(role)) {
    return <div className="card p-8 text-center text-soft">Manager-only.</div>;
  }

  const deals = dealsQ.data ?? [];
  const totalWeighted = deals.reduce(
    (s, d) => s + ((Number(d.setup_fee || 0) + Number(d.monthly_retainer || 0) * 12) * (Number(d.probability || 0) / 100)),
    0,
  );
  const closerName = deals[0]?.closer_name || 'Closer';

  return (
    <div className="space-y-5">
      <Link to="/owner/sales/opportunities" className="inline-flex items-center gap-1 text-sm text-soft hover:text-white">
        <ArrowLeft size={14}/> Back to Opportunities
      </Link>

      <header className="card p-5">
        <p className="text-xs uppercase tracking-widest text-soft">Open pipeline</p>
        <h1 className="font-display text-2xl mt-1"><span className="text-gradient">{closerName}</span></h1>
        <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-soft">Open deals</p>
            <p className="font-display text-xl text-white">{deals.length}</p>
          </div>
          <div>
            <p className="text-xs text-soft">Weighted forecast</p>
            <p className="font-display text-xl text-white inline-flex items-center gap-2">
              <TrendingUp size={16} className="text-brandred"/> {ZAR(totalWeighted)}
            </p>
          </div>
        </div>
      </header>

      {dealsQ.isLoading && <p className="text-soft">Loading deals…</p>}
      {dealsQ.isError && (
        <p className="card border border-brandred/40 p-4 text-sm text-brandred">
          {dealsQ.error?.message || 'Failed to load deals'}
        </p>
      )}

      {!dealsQ.isLoading && deals.length === 0 && (
        <p className="card p-6 text-center text-sm text-soft">No open deals for this closer.</p>
      )}

      <div className="space-y-2">
        {deals.map(d => {
          const annual = Number(d.setup_fee || 0) + Number(d.monthly_retainer || 0) * 12;
          const weighted = annual * (Number(d.probability || 0) / 100);
          return (
            <button
              key={d.id}
              onClick={() => navigate('/owner/sales')}
              className="card flex w-full items-center justify-between p-4 text-left transition hover:bg-darkbg-800"
            >
              <div className="min-w-0">
                <p className="truncate font-display text-sm text-white">{d.client_name}</p>
                <p className="mt-0.5 text-xs text-soft">
                  {STAGE_LABEL[d.stage] ?? d.stage} · {d.probability ?? 0}% · last update {daysSince(d.updated_at)}d ago
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-white">{ZAR(weighted)}</p>
                <p className="text-[11px] text-soft">of {ZAR(annual)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
