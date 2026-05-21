import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type AppRole = "student" | "faculty";

interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: AppRole) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (userId: string): Promise<AppRole> => {
    // 1. Try user_roles table first (has user_id column)
    try {
      const { data, error } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data?.role) {
        console.log("Role from user_roles:", data.role);
        return data.role as AppRole;
      }
    } catch (e) {
      console.error("user_roles fetch error:", e);
    }

    // 2. Try profiles table (uses id = auth user id)
    try {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (!error && data?.role) {
        console.log("Role from profiles (id):", data.role);
        return data.role as AppRole;
      }
    } catch (e) {
      console.error("profiles (id) fetch error:", e);
    }

    // 3. Try profiles with user_id column (fallback)
    try {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data?.role) {
        console.log("Role from profiles (user_id):", data.role);
        return data.role as AppRole;
      }
    } catch (e) {
      console.error("profiles (user_id) fetch error:", e);
    }

    console.warn("No role found, defaulting to student");
    return "student";
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const r = await fetchRole(session.user.id);
        setRole(r);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          // Wait for DB triggers to complete
          await new Promise(res => setTimeout(res, 800));
          const r = await fetchRole(session.user.id);
          setRole(r);
        } else {
          setRole(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    selectedRole: AppRole
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: selectedRole },
      },
    });
    if (error) throw error;

    if (data.user) {
      // Insert into user_roles
      const { error: roleErr } = await (supabase as any)
        .from("user_roles")
        .upsert({ user_id: data.user.id, role: selectedRole }, { onConflict: "user_id" });
      if (roleErr) console.error("user_roles upsert error:", roleErr);

      // Insert into profiles (id = auth user id)
      const { error: profErr } = await (supabase as any)
        .from("profiles")
        .upsert({
          id: data.user.id,
          user_id: data.user.id,
          full_name: fullName,
          email: email,
          role: selectedRole,
        }, { onConflict: "id" });
      if (profErr) console.error("profiles upsert error:", profErr);

      // Set immediately so UI updates right away
      setRole(selectedRole);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}