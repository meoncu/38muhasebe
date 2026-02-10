import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import Profile from '@/pages/Profile';
import CategoriesPage from '@/pages/CategoriesPage';
import FamilyPage from '@/pages/FamilyPage';
import Reports from '@/pages/Reports';
import PendingApproval from '@/pages/PendingApproval';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import ImpersonationBanner from '@/components/auth/ImpersonationBanner';
import DebugPage from '@/pages/DebugPage';
import CashFlowPage from '@/pages/CashFlowPage';
import AdminPanel from '@/pages/AdminPanel';

function App() {
  return (
    <Router>
      <ImpersonationBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <ProtectedRoute>
              <CategoriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/family"
          element={
            <ProtectedRoute>
              <FamilyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pending"
          element={
            <ProtectedRoute allowPending>
              <PendingApproval />
            </ProtectedRoute>
          }
        />
        {/* Catch all redirect to home (which will redirect to login if not auth) */}
        <Route
          path="/debug"
          element={
            <ProtectedRoute>
              <DebugPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cashflow"
          element={
            <ProtectedRoute>
              <CashFlowPage />
            </ProtectedRoute>
          }
        />
        {/* Catch all redirect to home (which will redirect to login if not auth) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
