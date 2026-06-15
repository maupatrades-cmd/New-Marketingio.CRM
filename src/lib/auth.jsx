import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) { setProfile(null); setRole(null); return; }
    (async () => {
      const [{ data: prof }, { data: roleRow }] = await Promise.all([
        supabase.from('profiles').select('id,email,full_name,phone,avatar_url').eq('id', session.user.id).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', session.user.id).order('granted_at', { ascending: true }).maybeSingle(),
      ]);
      setProfile(prof ?? null);
      setRole(roleRow?.role ?? null);
    })();
  }, [session]);

  const value = useMemo(() => ({
    session, user: session?.user ?? null, profile, role, loading,
    signOut: () => supabase.auth.signOut(),
  }), [session, profile, role, loading]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
