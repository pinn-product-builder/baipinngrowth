import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type UserRole = 'admin' | 'manager' | 'viewer' | 'client' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole;
  tenantId: string | null;
  tenantActive: boolean | null;
  passwordChanged: boolean | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  markPasswordChanged: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantActive, setTenantActive] = useState<boolean | null>(null);
  const [passwordChanged, setPasswordChanged] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserDetails = React.useCallback(async (userId: string) => {
    try {
      // Fetch user role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (roleError) {
        // Log error but don't throw - role might not exist for new users
        if (import.meta.env.DEV) {
          console.warn('Error fetching user role:', roleError);
        }
      } else if (roleData) {
        setUserRole(roleData.role as UserRole);
      }

      // Fetch tenant_id and password_changed from profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id, password_changed')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        if (import.meta.env.DEV) {
          console.error('Error fetching profile:', profileError);
        }
        return;
      }

      if (profileData) {
        setTenantId(profileData.tenant_id);
        setPasswordChanged(profileData.password_changed);

        // Check if tenant is active
        if (profileData.tenant_id) {
          const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .select('is_active')
            .eq('id', profileData.tenant_id)
            .maybeSingle();
          
          if (tenantError) {
            if (import.meta.env.DEV) {
              console.error('Error fetching tenant:', tenantError);
            }
            setTenantActive(null);
          } else {
            setTenantActive(tenantData?.is_active ?? null);
          }
        } else {
          setTenantActive(true); // Admins without tenant are always active
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error in fetchUserDetails:', error);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    // Set up auth state listener FIRST
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Use queueMicrotask instead of setTimeout for better timing
          queueMicrotask(() => {
            if (isMounted) {
              fetchUserDetails(session.user.id);
            }
          });
        } else {
          setUserRole(null);
          setTenantId(null);
          setTenantActive(null);
          setPasswordChanged(null);
        }
        setIsLoading(false);
      }
    );
    subscription = authSubscription;

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserDetails(session.user.id);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [fetchUserDetails]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  // signUp removed - invite-only system. Users are created via accept-invite edge function.

  const signOut = async () => {
    await supabase.auth.signOut();
    setUserRole(null);
    setTenantId(null);
    setTenantActive(null);
    setPasswordChanged(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=reset`
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  const markPasswordChanged = async () => {
    if (user) {
      await supabase
        .from('profiles')
        .update({ password_changed: true })
        .eq('id', user.id);
      setPasswordChanged(true);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      userRole,
      tenantId,
      tenantActive,
      passwordChanged,
      isLoading,
      signIn,
      signOut,
      resetPassword,
      updatePassword,
      markPasswordChanged
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
