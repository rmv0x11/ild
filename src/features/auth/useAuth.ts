/**
 * `useAuth` hook — pulled into its own file so `AuthContext.tsx` stays
 * "components only" for React Refresh.
 *
 * Throws if called outside an `<AuthProvider>` — a programming error,
 * not a runtime branch.
 */

import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './authContextValue';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
