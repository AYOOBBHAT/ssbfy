import { Link } from 'react-router-dom';

const cards = [
  {
    to: '/add-question',
    title: 'Add Question',
    description: 'Create a new MCQ for any subject or topic.',
  },
  {
    to: '/add-note',
    title: 'Add Note',
    description: 'Write topic-wise study notes for students.',
  },
  {
    to: '/manage-notes',
    title: 'Manage Notes',
    description: 'Filter, review, and enable/disable existing notes.',
  },
  {
    to: '/upload-pdf',
    title: 'Upload PDF',
    description: 'Upload a PDF resource scoped to a post.',
  },
  {
    to: '/manage-pdfs',
    title: 'Manage PDFs',
    description: 'Browse uploaded PDFs and enable/disable them.',
  },
  {
    to: '/create-test',
    title: 'Create Test',
    description: 'Bundle questions into a timed mock test.',
  },
  {
    to: '/topics',
    title: 'Subjects & Topics',
    description: 'Create subjects and add topics under them.',
  },
];

export default function Dashboard() {
  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">
        Welcome to the SSBFY admin panel. Pick an action to get started.
      </p>

      <div className="card-grid">
        {cards.map((c) => (
          <Link to={c.to} key={c.to} className="card card-link">
            <h3 className="card-title">{c.title}</h3>
            <p className="card-desc">{c.description}</p>
            <span className="card-cta">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
