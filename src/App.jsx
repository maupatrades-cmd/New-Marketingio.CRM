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
import Conversion from './pages/owner/sales/Conversion.jsx';
import SalesOpportunities from './pages/owner/sales/SalesOpportunities.jsx';
import MySales from './pages/owner/sales/MySales.jsx';
import Upsell from './pages/owner/sales/Upsell.jsx';
import UpsellWorkspace from './pages/owner/sales/UpsellWorkspace.jsx';
import MyClients from './pages/owner/MyClients.jsx';
import ComingSoonPage from './pages/owner/ComingSoonPage.jsx';
import MyDay from './pages/owner/MyDay.jsx';
import MyWorkspace from './pages/owner/MyWorkspace.jsx';
import MyMoney from './pages/owner/MyMoney.jsx';
import Welcome from './pages/client/Welcome.jsx';
import ClientOnboarding from './pages/client/Onboarding.jsx';
import ClientInvoice from './pages/client/Invoice.jsx';
import SignContract from './pages/sign/SignContract.jsx';
import Inbox from './pages/owner/Inbox.jsx';
import NewLead from './pages/owner/leads/NewLead.jsx';
import MyLeads from './pages/owner/leads/MyLeads.jsx';
import LeadsInbox from './pages/owner/leads/LeadsInbox.jsx';
import LeadDetail from './pages/owner/leads/LeadDetail.jsx';
import AllLeads from './pages/owner/leads/AllLeads.jsx';
import PublicLeadSubmit from './pages/refer/PublicLeadSubmit.jsx';
import Catalogue from './pages/owner/settings/Catalogue.jsx';
import Profile from './pages/owner/Profile.jsx';
import ProfileSecurity from './pages/owner/ProfileSecurity.jsx';
import ProfileNotifications from './pages/owner/ProfileNotifications.jsx';
import Fulfilment from './pages/owner/fulfilment/Fulfilment.jsx';
import Quality from './pages/owner/fulfilment/Quality.jsx';
import Productivity from './pages/owner/fulfilment/Productivity.jsx';
import ClientDeliverables from './pages/client/Deliverables.jsx';
import Invoices from './pages/owner/money/Invoices.jsx';
import Commissions from './pages/owner/money/Commissions.jsx';
import Earnings from './pages/owner/money/Earnings.jsx';
import CallLog from './pages/owner/calls/CallLog.jsx';
import CallNew from './pages/owner/calls/CallNew.jsx';
import Tasks from './pages/owner/Tasks.jsx';
import Appointments from './pages/owner/appointments/Appointments.jsx';
import AppointmentNew from './pages/owner/appointments/AppointmentNew.jsx';
import CoordinatorConsole from './pages/owner/CoordinatorConsole.jsx';
import Approvals from './pages/owner/Approvals.jsx';
import Contracts from './pages/owner/contracts/Contracts.jsx';
import ContractDetail from './pages/owner/contracts/ContractDetail.jsx';
import SalesChecklist from './pages/owner/contracts/SalesChecklist.jsx';
import AdminVerifyCall from './pages/owner/contracts/AdminVerifyCall.jsx';
import OnboardingForms from './pages/owner/onboarding/OnboardingForms.jsx';
import OnboardingSubmissions from './pages/owner/onboarding/OnboardingSubmissions.jsx';
import ClientShell from './components/ClientShell.jsx';
import ClientPortal from './pages/client/Portal.jsx';
import ClientContracts from './pages/client/Contracts.jsx';
import ClientInvoices from './pages/client/Invoices.jsx';
import ClientProfile from './pages/client/Profile.jsx';
import ClientDeliverableDetail from './pages/client/DeliverableDetail.jsx';
import ClientReports from './pages/client/Reports.jsx';
import ClientReportDetail from './pages/client/ReportDetail.jsx';
import ClientMessages from './pages/client/Messages.jsx';
import ClientNotifications from './pages/client/Notifications.jsx';
import PublicOnboarding from './pages/public/PublicOnboarding.jsx';

const ALL_SHELL_ROLES = ['owner', 'admin', 'head_of_tech', 'field_agent', 'cpc'];

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

function RoleIndex() {
  const { role, loading, roleLoaded, user } = useAuth();
  if (loading || (user && !roleLoaded)) {
    return <div className="grid min-h-screen place-items-center text-soft">Loading…</div>;
  }
  // All roles land on My Day as their home
  if (ALL_SHELL_ROLES.includes(role)) {
    return <Navigate to="/owner/workspace" replace />;
  }
  // Fallback for owner/admin who want the classic dashboard
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

// Brick H1 routes — all new paths added in this brick
// Existing real pages stay at their original paths; these are new.
const COMING_SOON_ROUTES = [
  // Core navigation (new paths per spec §2)
  // sales/my-sales — real page (MySales.jsx)
  { path: 'sales/kpis',                 title: 'My KPIs' },
  { path: 'sales/my-engine',            title: 'My Engine' },
  // Money — real pages below; only legacy alias kept here
  { path: 'money/invoices/cancelled',   title: 'Cancelled Invoices' },
  // clients — real page below
  // Comms
  { path: 'comms/messages',             title: 'Communications' },
  { path: 'comms/notifications',        title: 'Notifications' },
  // Activity
  { path: 'activity/dials',             title: 'Dial Log' },
  { path: 'activity/visits',            title: 'Visit Log' },
  // Profile sub-pages (profile itself is a real page)
  { path: 'profile/documents',          title: 'My Documents' },
  { path: 'profile/banking',            title: 'Salary Banking' },
  { path: 'profile/payouts',            title: 'My Payouts' },
  // Owner-restricted
  // approvals — real page below
  { path: 'reports/monthly',            title: 'Monthly Reports' },
  { path: 'security/audit',             title: 'Audit Log' },
  { path: 'security/banking-audit',     title: 'Banking Audit' },
  { path: 'team',                       title: 'Team' },
  // Legacy placeholders retained so no existing links break
  { path: 'sales/deals',               title: 'Deals' },
  { path: 'sales/my',                   title: 'My Sales (legacy)' },
  // sales/upsell — real page (Upsell.jsx)
  { path: 'invoices',                   title: 'Invoices' },
  { path: 'admin-invoices',             title: 'Admin Invoices' },
  { path: 'receipts',                   title: 'Receipts' },
  { path: 'debit-orders',              title: 'Debit Orders' },
  { path: 'financials',                 title: 'Owner Financials' },
  { path: 'commissions',               title: 'Commissions' },
  { path: 'payroll',                   title: 'Payroll' },
  { path: 'contracts/cancelled',       title: 'Cancelled Contracts' },
  { path: 'deliverable-quality',       title: 'Deliverable Quality' },
  { path: 'service-orders',            title: 'Service Orders' },
  { path: 'users',                     title: 'Users' },
  { path: 'staff-hr',                  title: 'Staff HR' },
  { path: 'kpi-targets',              title: 'KPI Targets' },
  { path: 'team-performance',         title: 'Team Performance' },
  { path: 'staff-productivity',       title: 'Staff Productivity' },
  { path: 'campaigns',                title: 'Campaigns' },
  { path: 'email-templates',          title: 'Email Templates' },
  { path: 'monthly-reports',          title: 'Monthly Reports (legacy)' },
  { path: 'image-generator',          title: 'Image Generator' },
  { path: 'products',                 title: 'Products' },
  { path: 'activity',                 title: 'All Activity' },
  { path: 'activity/admin',           title: 'Admin Activity' },
  { path: 'activity/staff',           title: 'Staff Activity' },
  { path: 'activity/client',          title: 'Client Activity' },
  { path: 'activity/cpc',             title: 'CPC Activity' },
  { path: 'activity/field',           title: 'Field Activity' },
  { path: 'mail',                     title: 'Mail' },
  { path: 'calendar',                 title: 'Calendar' },
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

      {/* Public onboarding — token IS the auth */}
      <Route path="/onboard/:token" element={<PublicOnboarding/>} />

      {/* Client portal */}
      <Route path="/welcome" element={<RequireAuth><Welcome/></RequireAuth>} />
      <Route path="/client" element={<RequireAuth><ClientShell/></RequireAuth>}>
        <Route index element={<ClientPortal/>} />
        <Route path="contracts" element={<ClientContracts/>} />
        <Route path="invoices" element={<ClientInvoices/>} />
        <Route path="invoices/:id" element={<ClientInvoice/>} />
        <Route path="deliverables" element={<ClientDeliverables/>} />
        <Route path="deliverables/:id" element={<ClientDeliverableDetail/>} />
        <Route path="reports" element={<ClientReports/>} />
        <Route path="reports/:id" element={<ClientReportDetail/>} />
        <Route path="messages" element={<ClientMessages/>} />
        <Route path="notifications" element={<ClientNotifications/>} />
        <Route path="onboarding" element={<ClientOnboarding/>} />
        <Route path="profile" element={<ClientProfile/>} />
      </Route>

      {/*
        /owner shell — open to all staff roles including head_of_tech.
        Admin-only pages rely on RLS + per-page role checks for defence in depth.
      */}
      <Route path="/owner" element={
        <RequireAuth>
          <RequireRole allowed={ALL_SHELL_ROLES}>
            <OwnerShell/>
          </RequireRole>
        </RequireAuth>
      }>
        <Route index element={<RoleIndex />} />
        {/* Real pages */}
        <Route path="my-day"             element={<MyDay/>} />
        <Route path="workspace"          element={<MyWorkspace/>} />
        <Route path="money/mine"         element={<MyMoney/>} />
        <Route path="playbooks"          element={<Playbooks/>} />
        <Route path="sales"              element={<Pipeline/>} />
        <Route path="sales/log"          element={<LogSale/>} />
        <Route path="sales/leads"        element={<Leads/>} />
        <Route path="sales/conversion"   element={<Conversion/>} />
        <Route path="sales/opportunities" element={<SalesOpportunities/>} />
        <Route path="sales/my-sales"      element={<MySales/>} />
        <Route path="sales/upsell"          element={<Upsell/>} />
        <Route path="sales/upsell/:clientId" element={<UpsellWorkspace/>} />
        <Route path="leads"              element={<AllLeads/>} />
        <Route path="leads/new"          element={<NewLead/>} />
        <Route path="leads/my"           element={<MyLeads/>} />
        <Route path="leads/inbox"        element={<LeadsInbox/>} />
        <Route path="leads/:leadId/inbox" element={<LeadDetail/>} />
        <Route path="inbox"              element={<Inbox/>} />
        <Route path="settings/catalogue" element={<Catalogue/>} />
        <Route path="fulfilment"               element={<Fulfilment/>}/>
        <Route path="fulfilment/quality"       element={<Quality/>}/>
        <Route path="fulfilment/productivity"  element={<Productivity/>}/>
        <Route path="profile"                   element={<Profile/>} />
        <Route path="profile/security"         element={<ProfileSecurity/>} />
        <Route path="profile/notifications"    element={<ProfileNotifications/>} />
        <Route path="money/invoices"           element={<Invoices/>} />
        <Route path="money/commissions"        element={<Commissions/>} />
        <Route path="money/earnings"           element={<Earnings/>} />
        <Route path="money/earnings/:userId"   element={<Earnings/>} />
        <Route path="calls"                    element={<CallLog/>} />
        <Route path="calls/new"               element={<CallNew/>} />
        <Route path="tasks"                    element={<Tasks/>} />
        <Route path="appointments"             element={<Appointments/>} />
        <Route path="appointments/new"         element={<AppointmentNew/>} />
        <Route path="coordinator"              element={<CoordinatorConsole/>} />
        <Route path="approvals"                element={<Approvals/>} />
        <Route path="clients"                  element={<MyClients/>} />
        <Route path="contracts"                          element={<Contracts/>} />
        <Route path="contracts/:contractId"              element={<ContractDetail/>} />
        <Route path="contracts/:contractId/sales-checklist" element={<SalesChecklist/>} />
        <Route path="contracts/:contractId/verify-call"  element={<AdminVerifyCall/>} />
        <Route path="onboarding-forms" element={<OnboardingForms />} />
        <Route path="onboarding-submissions" element={<OnboardingSubmissions />} />

        {/* Brick H1 + legacy placeholders */}
        {COMING_SOON_ROUTES.map(({ path, title }) =>
          <Route key={path} path={path} element={<ComingSoonPage title={title}/>} />
        )}
      </Route>

      <Route path="*" element={<div className="grid min-h-screen place-items-center text-soft">404</div>}/>
    </Routes>
  );
}
