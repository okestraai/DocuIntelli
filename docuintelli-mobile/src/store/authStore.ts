import { create } from 'zustand';
import type { AuthSession, AuthUser } from '../lib/auth';
import { auth } from '../lib/auth';

interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  initialized: boolean;
  loading: boolean;

  setSession: (session: AuthSession | null) => void;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  initialized: false,
  loading: true,

  setSession: (session) => {
    set({ session, user: session?.user ?? null, loading: false });
  },

  initialize: async () => {
    try {
      const {
        data: { session },
      } = await auth.getSession();
      set({ session, user: session?.user ?? null, initialized: true, loading: false });
    } catch {
      set({ session: null, user: null, initialized: true, loading: false });
    }
  },

  signOut: async () => {
    await auth.signOut();
    set({ session: null, user: null });
  },
}));
