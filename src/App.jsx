import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { OwnerShell } from './components/OwnerShell.jsx';
import Login from './pages/Login.jsx';
import SignUp from './pages/SignUp.jsx';
import OwnerDashboard from './pages/owner/Dashboard.jsx';
import Placeholder from './pages/owner/Placeholder.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-synth-muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/owner" replace/>} />
      <Route path="/login" element={<Login/>} />
      <Route path="/signup" element={<SignUp/>} />

      <Route path="/owner" element={
        <RequireAuth><OwnerShell/></RequireAuth>
      }>
        <Route index element={<OwnerDashboard/>} />
        <Route path="sales"        element={<Placeholder title="Sales"/>} />
        <Route path="clients"      element={<Placeholder title="Clients"/>} />
        <Route path="invoices"     element={<Placeholder title="Invoices"/>} />
        <Route path="contracts"    element={<Placeholder title="Contracts"/>} />
        <Route path="deliverables" element={<Placeholder title="Deliverables"/>} />
        <Route path="campaigns"    element={<Placeholder title="Campaigns"/>} />
        <Route path="payroll"      element={<Placeholder title="Payroll"/>} />
        <Route path="playbooks"    element={<Placeholder title="Playbooks"/>} />
        <Route path="settings"     element={<Placeholder title="Settings"/>} />
      </Route>

      <Route path="*" element={<div className="grid min-h-screen place-items-center text-synth-muted">404</div>}/>
    </Routes>
  );
}
