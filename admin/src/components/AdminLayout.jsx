import { Outlet } from 'react-router-dom';
import Navbar from './Navbar.jsx';

export default function AdminLayout() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
