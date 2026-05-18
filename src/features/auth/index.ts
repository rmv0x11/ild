/**
 * Public barrel for the auth feature. Other agents (App.tsx, Layout.tsx)
 * should import from this entry point so the internal file layout can
 * evolve without breaking them.
 */

export { AuthProvider } from './AuthContext';
export { useAuth } from './useAuth';
export { LoginPage } from './LoginPage';
export { UserBadge } from './UserBadge';
export { AuthCallbackPage } from './AuthCallbackPage';
export type { AuthUser, AuthState } from './types';
export type { AuthContextValue } from './authContextValue';
