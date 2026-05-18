import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ReviewPage } from '@/features/review/ReviewPage';
import { ImportPage } from '@/features/deck/ImportPage';
import { StatsPage } from '@/features/stats/StatsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/review" replace />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="*" element={<Navigate to="/review" replace />} />
      </Route>
    </Routes>
  );
}
