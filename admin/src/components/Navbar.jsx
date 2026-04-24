import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/add-question', label: 'Add Question' },
  { to: '/add-note', label: 'Add Note' },
  { to: '/manage-notes', label: 'Manage Notes' },
  { to: '/upload-pdf', label: 'Upload PDF' },
  { to: '/manage-pdfs', label: 'Manage PDFs' },
  { to: '/create-test', label: 'Create Test' },
  { to: '/topics', label: 'Subjects & Topics' },
];

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-name">SSBFY</span>
        <span className="brand-tag">Admin</span>
      </div>

      <ul className="navbar-links">
        {links.map((l) => (
          <li key={l.to}>
            <NavLink
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link-active' : 'nav-link'
              }
            >
              {l.label}
            </NavLink>
          </li>
        ))}
      </ul>

      {user ? (
        <div className="navbar-user">
          <div className="navbar-user-info">
            <div className="navbar-user-name">{user.name || user.email}</div>
            <div className="navbar-user-role">{user.role}</div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      ) : null}
    </nav>
  );
}
