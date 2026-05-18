/**
 * Public auth types consumed by `AuthProvider`, `LoginPage`, `UserBadge` and
 * downstream features (e.g. sync). Kept in a leaf file so importing them
 * doesn't drag in React or fetch code.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: number;
}

export interface AuthState {
  status: 'loading' | 'guest' | 'authenticated';
  user: AuthUser | null;
}
