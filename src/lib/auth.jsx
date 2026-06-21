import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleLoaded, setRoleLoaded] = useState(false);

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
    if (!session?.user) {
      setProfile(null);
      setRole(null);
      // No user → nothing to load; gates that depend on roleLoaded
      // should fall through to "not signed in", not "loading…".
      setRoleLoaded(true);
      return;
    }
    setRoleLoaded(false);
    (async () => {
      const [{ data: prof }, { data: roleRow }] = await Promise.all([
        supabase.from('profiles').select('id,email,full_name,phone,avatar_url,dream_caption,dream_type,dream_details,dream_hero_image_url,monthly_goal_wins,monthly_earning_goal_zar').eq('id', session.user.id).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', session.user.id).order('granted_at', { ascending: true }).maybeSingle(),
      ]);
      setProfile(prof ?? null);
      setRole(roleRow?.role ?? null);
      setRoleLoaded(true);
    })();
  }, [session]);

  const refreshProfile = async () => {
    if (!session?.user) return;
    const { data: prof } = await supabase
      .from('profiles')
      .select('id,email,full_name,phone,avatar_url,dream_caption,dream_type,dream_details,dream_hero_image_url,monthly_goal_wins,monthly_earning_goal_zar')
      .eq('id', session.user.id)
      .maybeSingle();
    if (prof) setProfile(prof);
  };

  const value = useMemo(() => ({
    session, user: session?.user ?? null, profile, role, loading, roleLoaded,
    refreshProfile,
    signOut: async () => {
      // 'local' scope just clears the local storage tokens — never
      // touches the API, so a stale JWT or network blip can't block
      // a sign-out. The onAuthStateChange listener flips session to
      // null right after.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    },
  }), [session, profile, role, loading, roleLoaded]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
