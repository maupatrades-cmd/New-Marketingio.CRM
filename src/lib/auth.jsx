import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) setAuthError(error);
        setSession(data?.session ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setAuthError(err);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthError(null);
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
      setRoleLoaded(true);
      return;
    }
    setRoleLoaded(false);
    let active = true;
    (async () => {
      try {
        const [{ data: prof, error: profErr }, { data: roleRow, error: roleErr }] = await Promise.all([
          supabase.from('profiles').select('id,email,full_name,phone,avatar_url,dream_caption,dream_type,dream_details,dream_hero_image_url,monthly_goal_wins,monthly_earning_goal_zar').eq('id', session.user.id).maybeSingle(),
          supabase.from('user_roles').select('role').eq('user_id', session.user.id).order('granted_at', { ascending: true }).maybeSingle(),
        ]);
        if (!active) return;
        if (profErr || roleErr) {
          setAuthError(profErr || roleErr);
        } else {
          setAuthError(null);
        }
        setProfile(prof ?? null);
        setRole(roleRow?.role ?? null);
      } catch (err) {
        if (!active) return;
        setAuthError(err);
        console.error('[auth] profile/role load failed', err);
      } finally {
        if (active) setRoleLoaded(true);
      }
    })();
    return () => { active = false; };
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
    authError,
    refreshProfile,
    signOut: async () => {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    },
  }), [session, profile, role, loading, roleLoaded, authError]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
