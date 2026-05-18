import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ReviewPage } from '@/features/review/ReviewPage';
import { ImportPage } from '@/features/deck/ImportPage';
import { StatsPage } from '@/features/stats/StatsPage';
import { OnboardingDialog } from '@/features/onboarding/OnboardingDialog';
import {
  isOnboardingCompleted,
  markOnboardingCompleted,
} from '@/features/onboarding/onboardingState';
import { loadSampleDeck } from '@/features/onboarding/loadSampleDeck';
import { LoginPage } from '@/features/auth/LoginPage';
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage';

export default function App() {
  const [onboardingOpen, setOnboardingOpen] = useState<boolean>(() => !isOnboardingCompleted());
  const navigate = useNavigate();

  const handleOnboardingClose = async (
    action: 'skip' | 'load-sample' | 'open-import',
  ): Promise<void> => {
    markOnboardingCompleted();
    setOnboardingOpen(false);

    if (action === 'load-sample') {
      try {
        await loadSampleDeck(Date.now());
      } catch {
        // ignore — review page will simply show the empty state
      }
      // Full reload: useLiveQuery doesn't always invalidate when the initial
      // query returned empty and rows were added afterwards. A hard reload
      // re-mounts ReviewPage with fresh Dexie subscriptions.
      window.location.assign('/review');
      return;
    }

    if (action === 'open-import') {
      navigate('/import');
      return;
    }
  };

  return (
    <>
      <OnboardingDialog
        open={onboardingOpen}
        onClose={(action) => {
          void handleOnboardingClose(action);
        }}
      />
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="auth/callback" element={<AuthCallbackPage />} />
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/review" replace />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="*" element={<Navigate to="/review" replace />} />
        </Route>
      </Routes>
    </>
  );
}
