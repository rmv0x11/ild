/**
 * Pure context-value module. Kept separate from `AuthContext.tsx` so HMR
 * fast refresh can mark that file as "components only" — the React lint
 * rule rejects modules that export both a component and a value/hook.
 */

import { createContext } from 'react';
import type { AuthState } from './types';

export interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
