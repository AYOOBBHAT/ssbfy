import { Link } from 'react-router-dom';

const cards = [
  {
    to: '/add-question',
    title: 'Add Question',
    description: 'Create a new MCQ for any subject or topic.',
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
