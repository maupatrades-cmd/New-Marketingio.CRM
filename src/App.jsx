import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { OwnerShell } from './components/OwnerShell.jsx';
import Login from './pages/Login.jsx';
import SignUp from './pages/SignUp.jsx';
import { Terms, Privacy } from './pages/Legal.jsx';
import OwnerDashboard from './pages/owner/Dashboard.jsx';
import Playbooks from './pages/owner/Playbooks.jsx';
import LogSale from './pages/owner/sales/LogSale.jsx';
import Pipeline from './pages/owner/sales/Pipeline.jsx';
import Leads from './pages/owner/sales/Leads.jsx';
import Placeholder from './pages/owner/Placeholder.jsx';
import Welcome from './pages/client/Welcome.jsx';
import ClientOnboarding from './pages/client/Onboarding.jsx';
import ClientInvoice from './pages/client/Invoice.jsx';
import SignContract from './pages/sign/SignContract.jsx';
import Inbox from './pages/owner/Inbox.jsx';
import NewLead from './pages/owner/leads/NewLead.jsx';
import MyLeads from './pages/owner/leads/MyLeads.jsx';
import AllLeads from './pages/owner/leads/AllLeads.jsx';
import PublicLeadSubmit from './pages/refer/PublicLeadSubmit.jsx';
import Catalogue from './pages/owner/settings/Catalogue.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center text-soft">Loading…</div>;
  if (!user) {
    const from = location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return children;
}

// RequireRole — wraps the owner shell. The role is fetched in auth.jsx
// after the session loads, so we wait for `roleLoaded` before deciding;
// otherwise a logged-in owner could briefly see the not-authorised
// screen on first render. Wrap with RequireAuth on the outside so
// signed-out users get the login redirect first.
// field_agent and cpc have no use for the owner dashboard — send them
// straight to their primary surface so the first screen is always useful.
function RoleIndex() {
  const { role, loading, roleLoaded, user } = useAuth();
  if (loading || (user && !roleLoaded)) {
    return <div className="grid min-h-screen place-items-center text-soft">Loading…</div>;
  }
  if (role === 'field_agent' || role === 'cpc') {
    return <Navigate to="/owner/leads/my" replace />;
  }
  return <OwnerDashboard />;
}

function RequireRole({ children, allowed }) {
  const { user, role, loading, roleLoaded, signOut } = useAuth();
  const navigate = useNavigate();
  if (loading || (user && !roleLoaded)) {
    return <div className="grid min-h-screen place-items-center text-soft">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed.includes(role)) {
    return <NotAuthorised onSignOut={async () => {
      try { await signOut(); } catch (_) { /* swallow */ }
      navigate('/login', { replace: true });
    }} />;
  }
  return children;
}

function NotAuthorised({ onSignOut }) {
  return (
    <div className="grid min-h-screen place-items-center bg-darkbg-900 px-4 text-white">
      <div className="card max-w-md p-8 text-center">
        <h1 className="font-display mb-3 text-2xl text-gradient">You don't have access</h1>
        <p className="mb-6 text-sm text-soft">
          This area is reserved for Marketing iO owners and admins. If you think this is a
          mistake, email <a className="text-brandred hover:underline" href="mailto:support@marketingio.co.za">support@marketingio.co.za</a>.
        </p>
        <button onClick={onSignOut} className="btn-primary">Sign out</button>
      </div>
    </div>
  );
}

/**
 * 50-surface Base44-parity route table. Real pages override Placeholder
 * as each slice ships:
 *   slice 2 → Sales group
 *   slice 3 → Money group
 *   slice 4 → Contracts group
 *   slice 5 → Fulfilment + Onboarding Forms
 *   slice 6 → Team group
 *   slice 7 → Marketing group
 *   slice 8 → Activity drilldowns
 *   slice 9 → Communication group
 *   slice 10 → Settings + Reports
 */
const PLACEHOLDER_ROUTES = [
  // Sales — sales/log, sales (index), sales/leads now real
  { path: 'sales/deals',              title: 'Deals' },
  { path: 'sales/upsell',             title: 'Upsell' },
  { path: 'sales/my',                 title: 'My Sales' },
  // Money
  { path: 'invoices',                 title: 'Invoices' },
  { path: 'admin-invoices',           title: 'Admin Invoices' },
  { path: 'receipts',                 title: 'Receipts' },
  { path: 'debit-orders',             title: 'Debit Orders' },
  { path: 'financials',               title: 'Owner Financials' },
  { path: 'commissions',              title: 'Commissions' },
  { path: 'payroll',                  title: 'Payroll' },
  // Contracts
  { path: 'contracts',                title: 'Contracts' },
  { path: 'contracts/cancelled',      title: 'Cancelled Contracts' },
  // Fulfilment
  { path: 'deliverables',             title: 'Deliverables' },
  { path: 'deliverable-quality',      title: 'Deliverable Quality' },
  { path: 'service-orders',           title: 'Service Orders' },
  { path: 'onboarding-forms',         title: 'Onboarding Forms' },
  { path: 'onboarding-submissions',   title: 'Onboarding Submissions' },
  // Team (Playbooks is real — see explicit route below)
  { path: 'users',                    title: 'Users' },
  { path: 'staff-hr',                 title: 'Staff HR' },
  { path: 'kpi-targets',              title: 'KPI Targets' },
  { path: 'team-performance',         title: 'Team Performance' },
  { path: 'staff-productivity',       title: 'Staff Productivity' },
  // Marketing
  { path: 'campaigns',                title: 'Campaigns' },
  { path: 'email-templates',          title: 'Email Templates' },
  { path: 'monthly-reports',          title: 'Monthly Reports' },
  { path: 'image-generator',          title: 'Image Generator' },
  { path: 'products',                 title: 'Products' },
  // Activity
  { path: 'activity',                 title: 'All Activity' },
  { path: 'activity/admin',           title: 'Admin Activity' },
  { path: 'activity/staff',           title: 'Staff Activity' },
  { path: 'activity/client',          title: 'Client Activity' },
  { path: 'activity/cpc',             title: 'CPC Activity' },
  { path: 'activity/field',           title: 'Field Activity' },
  // Communication (Inbox is real — see explicit route below)
  { path: 'mail',                     title: 'Mail' },
  // Calendar
  { path: 'calendar',                 title: 'Calendar' },
  // Settings
  { path: 'settings',                 title: 'Settings' },
  { path: 'reports',                  title: 'Owner Reports' },
];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/owner" replace/>} />
      <Route path="/login" element={<Login/>} />
      <Route path="/signup" element={<SignUp/>} />
      <Route path="/terms" element={<Terms/>} />
      <Route path="/privacy" element={<Privacy/>} />

      {/* Public contract signing — token IS the auth */}
      <Route path="/sign/:signing_token" element={<SignContract/>} />

      {/* Public referral link — no auth, token IS the gate */}
      <Route path="/refer/:token" element={<PublicLeadSubmit/>} />

      {/* Client portal */}
      <Route path="/welcome" element={
        <RequireAuth><Welcome/></RequireAuth>
      } />
      <Route path="/client/onboarding" element={
        <RequireAuth><ClientOnboarding/></RequireAuth>
      } />
      <Route path="/client/invoices/:id" element={
        <RequireAuth><ClientInvoice/></RequireAuth>
      } />
      <Route path="/client" element={
        <RequireAuth>
          <div className="grid min-h-screen place-items-center bg-darkbg-900 text-white">
            <div className="card max-w-md p-8 text-center">
              <h1 className="font-display mb-2 text-2xl text-gradient">Your portal — coming soon</h1>
              <p className="text-soft">Contracts, invoices, deliverables and messages will land here.</p>
            </div>
          </div>
        </RequireAuth>
      } />

      {/*
        /owner shell: opened to field_agent + cpc so they can reach
        /owner/leads/new and /owner/leads/my. Admin-only pages rely on
        RLS + per-page role checks for defence in depth.
      */}
      <Route path="/owner" element={
        <RequireAuth>
          <RequireRole allowed={['owner','admin','field_agent','cpc']}>
            <OwnerShell/>
          </RequireRole>
        </RequireAuth>
      }>
        <Route index element={<RoleIndex />} />
        <Route path="playbooks" element={<Playbooks/>} />
        <Route path="sales" index element={<Pipeline/>} />
        <Route path="sales/log" element={<LogSale/>} />
        <Route path="sales/leads" element={<Leads/>} />
        <Route path="leads" element={<AllLeads/>} />
        <Route path="leads/new" element={<NewLead/>} />
        <Route path="leads/my" element={<MyLeads/>} />
        <Route path="inbox" element={<Inbox/>} />
        <Route path="settings/catalogue" element={<Catalogue/>} />

        {PLACEHOLDER_ROUTES.map(({ path, title, index }) =>
          index
            ? <Route key={path} path={path} index element={<Placeholder title={title}/>} />
            : <Route key={path} path={path} element={<Placeholder title={title}/>} />
        )}
      </Route>

      <Route path="*" element={<div className="grid min-h-screen place-items-center text-soft">404</div>}/>
    </Routes>
  );
}
