import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import RequireAdmin from './components/RequireAdmin.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AddQuestion from './pages/AddQuestion.jsx';
import ManageQuestions from './pages/ManageQuestions.jsx';
import ImportQuestions from './pages/ImportQuestions.jsx';
import AddNote from './pages/AddNote.jsx';
import ManageNotes from './pages/ManageNotes.jsx';
import UploadPdfNote from './pages/UploadPdfNote.jsx';
import ManagePdfNotes from './pages/ManagePdfNotes.jsx';
import CreateTest from './pages/CreateTest.jsx';
import ManageTopics from './pages/ManageTopics.jsx';
import ManageSubscriptionPlans from './pages/ManageSubscriptionPlans.jsx';
import ManagePayments from './pages/ManagePayments.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import Terms from './pages/Terms.jsx';
import './App.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="site-shell">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-and-conditions" element={<Terms />} />

            <Route
              element={
                <RequireAdmin>
                  <AdminLayout />
                </RequireAdmin>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/add-question" element={<AddQuestion />} />
              <Route path="/manage-questions" element={<ManageQuestions />} />
              <Route path="/import-questions" element={<ImportQuestions />} />
              <Route path="/add-note" element={<AddNote />} />
              <Route path="/manage-notes" element={<ManageNotes />} />
              <Route path="/upload-pdf" element={<UploadPdfNote />} />
              <Route path="/manage-pdfs" element={<ManagePdfNotes />} />
              <Route path="/create-test" element={<CreateTest />} />
              <Route path="/topics" element={<ManageTopics />} />
              <Route
                path="/subscription-plans"
                element={<ManageSubscriptionPlans />}
              />
              <Route path="/payments" element={<ManagePayments />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className="legal-footer">
            <Link to="/privacy-policy">Privacy Policy</Link>
            <span>|</span>
            <Link to="/terms-and-conditions">Terms & Conditions</Link>
          </footer>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
