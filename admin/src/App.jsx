import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import RequireAdmin from './components/RequireAdmin.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AddQuestion from './pages/AddQuestion.jsx';
import ManageQuestions from './pages/ManageQuestions.jsx';
import AddNote from './pages/AddNote.jsx';
import ManageNotes from './pages/ManageNotes.jsx';
import UploadPdfNote from './pages/UploadPdfNote.jsx';
import ManagePdfNotes from './pages/ManagePdfNotes.jsx';
import CreateTest from './pages/CreateTest.jsx';
import ManageTopics from './pages/ManageTopics.jsx';
import './App.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Everything below requires an authenticated admin. */}
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
            <Route path="/add-note" element={<AddNote />} />
            <Route path="/manage-notes" element={<ManageNotes />} />
            <Route path="/upload-pdf" element={<UploadPdfNote />} />
            <Route path="/manage-pdfs" element={<ManagePdfNotes />} />
            <Route path="/create-test" element={<CreateTest />} />
            <Route path="/topics" element={<ManageTopics />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
