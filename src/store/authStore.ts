import { create } from 'zustand';
import type { User } from 'firebase/auth';

interface ImpersonatedUser {
    uid: string;
    email: string | null;
    displayName: string | null;
    role: 'admin' | 'member';
}

interface AuthState {
    user: User | null;
    impersonatedUser: ImpersonatedUser | null;
    rates: Record<string, number>;
    ratesLastUpdated: string | null;
    loading: boolean;
    setUser: (user: User | null) => void;
    setLoading: (loading: boolean) => void;
    setImpersonatedUser: (user: ImpersonatedUser | null) => void;
    setRates: (rates: Record<string, number>, lastUpdated: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    impersonatedUser: null,
    rates: { 'TRY': 1, 'USD': 35.0, 'EUR': 38.0 },
    ratesLastUpdated: null,
    loading: true,
    setUser: (user) => set({ user }),
    setLoading: (loading) => set({ loading }),
    setImpersonatedUser: (user) => set({ impersonatedUser: user }),
    setRates: (rates, ratesLastUpdated) => set({ rates, ratesLastUpdated }),
}));
