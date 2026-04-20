import { useEffect, useMemo, useState } from 'react';
import {
  createTest,
  getQuestions,
  getSubjects,
  getApiErrorMessage,
} from '../services/api';

const TYPES = [
  { value: 'subject', label: 'Subject test' },
  { value: 'post', label: 'Post test (e.g. JE, Patwari)' },
];

const DIFFICULTIES = ['', 'easy', 'medium', 'hard'];
const PAGE_SIZE = 50;

const initialForm = {
  title: '',
  type: 'subject',
  duration: 30,
  negativeMarking: 0,
};

export default function CreateTest() {
  const [form, setForm] = useState(initialForm);
  const [selected, setSelected] = useState(() => new Set());

  const [subjects, setSubjects] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [totalQuestions, setTotalQuestions] = useState(0);

  const [filterSubject, setFilterSubject] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');

  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Load subjects once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingSubjects(true);
        const res = await getSubjects();
        if (cancelled) return;
        setSubjects(Array.isArray(res) ? res : res?.subjects || []);
      } catch (e) {
        if (!cancelled) setErrorMsg(getApiErrorMessage(e));
      } finally {
        if (!cancelled) setLoadingSubjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load questions when filters change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingQuestions(true);
        setQuestionsError('');
        const params = { limit: PAGE_SIZE, skip: 0, sort: 'latest' };
        if (filterSubject) params.subjectId = filterSubject;
        if (filterDifficulty) params.difficulty = filterDifficulty;
        const res = await getQuestions(params);
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res?.questions || [];
        setQuestions(list);
        setTotalQuestions(Number(res?.total) || list.length);
      } catch (e) {
        if (!cancelled) setQuestionsError(getApiErrorMessage(e));
      } finally {
        if (!cancelled) setLoadingQuestions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterSubject, filterDifficulty]);

  const subjectMap = useMemo(() => {
    const m = {};
    for (const s of subjects) m[String(s._id)] = s.name || s.title || s._id;
    return m;
  }, [subjects]);

  const selectedQuestions = useMemo(
    () => questions.filter((q) => selected.has(String(q._id))),
    [questions, selected]
  );

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const q of questions) next.add(String(q._id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function resetForm() {
    setForm(initialForm);
    setSelected(new Set());
    setSuccessMsg('');
    setErrorMsg('');
  }

  function validate() {
    if (!form.title.trim()) return 'Title is required.';
    if (!['subject', 'post'].includes(form.type)) return 'Pick a test type.';
    if (selected.size === 0) return 'Select at least one question.';
    const dur = Number(form.duration);
    if (!Number.isFinite(dur) || dur < 1) {
      return 'Duration must be a positive number of minutes.';
    }
    const neg = Number(form.negativeMarking);
    if (!Number.isFinite(neg) || neg < 0) {
      return 'Negative marking must be 0 or greater.';
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSuccessMsg('');
    setErrorMsg('');

    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const payload = {
      title: form.title.trim(),
      type: form.type,
      questionIds: Array.from(selected),
      duration: Number(form.duration),
      negativeMarking: Number(form.negativeMarking) || 0,
    };

    try {
      setSubmitting(true);
      await createTest(payload);
      setSuccessMsg(`Test "${payload.title}" created with ${payload.questionIds.length} question(s).`);
      resetForm();
    } catch (err) {
      setErrorMsg(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Create Test</h1>
      <p className="page-subtitle">
        Bundle questions into a timed mock test. Required fields marked *.
      </p>

      <form className="form" onSubmit={handleSubmit}>
        {/* Test details */}
        <div className="card form">
          {successMsg ? <div className="alert alert-success">{successMsg}</div> : null}
          {errorMsg ? <div className="alert alert-error">{errorMsg}</div> : null}

          <div className="form-row">
            <label className="label" htmlFor="title">Title *</label>
            <input
              id="title"
              type="text"
              className="input"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="e.g. JKSSB JE — Mock Test 1"
              disabled={submitting}
            />
          </div>

          <div className="form-grid">
            <div className="form-row">
              <label className="label" htmlFor="type">Type *</label>
              <select
                id="type"
                className="input"
                value={form.type}
                onChange={(e) => updateField('type', e.target.value)}
                disabled={submitting}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <label className="label" htmlFor="duration">Duration (minutes) *</label>
              <input
                id="duration"
                type="number"
                min="1"
                className="input"
                value={form.duration}
                onChange={(e) => updateField('duration', e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="form-row">
              <label className="label" htmlFor="negativeMarking">Negative marking</label>
              <input
                id="negativeMarking"
                type="number"
                min="0"
                step="0.25"
                className="input"
                value={form.negativeMarking}
                onChange={(e) => updateField('negativeMarking', e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
        </div>

        {/* Question picker */}
        <div className="card form">
          <div className="picker-header">
            <div>
              <h3 className="card-title">Select questions *</h3>
              <p className="card-desc">
                Selected: <strong>{selected.size}</strong>
                {totalQuestions ? ` · Showing ${questions.length} of ${totalQuestions}` : ''}
              </p>
            </div>
            <div className="picker-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={selectAllVisible}
                disabled={submitting || loadingQuestions || questions.length === 0}
              >
                Select all visible
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={clearSelection}
                disabled={submitting || selected.size === 0}
              >
                Clear ({selected.size})
              </button>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-row">
              <label className="label" htmlFor="filterSubject">Filter by subject</label>
              <select
                id="filterSubject"
                className="input"
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                disabled={submitting || loadingSubjects}
              >
                <option value="">All subjects</option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name || s.title || s._id}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <label className="label" htmlFor="filterDifficulty">Filter by difficulty</label>
              <select
                id="filterDifficulty"
                className="input"
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value)}
                disabled={submitting}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d || 'all'} value={d}>
                    {d ? d.charAt(0).toUpperCase() + d.slice(1) : 'All difficulties'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {questionsError ? (
            <div className="alert alert-error">{questionsError}</div>
          ) : null}

          {loadingQuestions ? (
            <p className="muted">Loading questions…</p>
          ) : questions.length === 0 ? (
            <p className="muted">No questions match the current filters.</p>
          ) : (
            <ul className="question-list">
              {questions.map((q) => {
                const id = String(q._id);
                const isSelected = selected.has(id);
                return (
                  <li
                    key={id}
                    className={`question-item ${isSelected ? 'question-item-selected' : ''}`}
                  >
                    <label className="question-label">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(id)}
                        disabled={submitting}
                      />
                      <div className="question-body">
                        <div className="question-text">{q.questionText}</div>
                        <div className="question-meta">
                          {q.difficulty ? (
                            <span className={`badge badge-${q.difficulty}`}>
                              {q.difficulty}
                            </span>
                          ) : null}
                          {q.subjectId ? (
                            <span className="meta-text">
                              {subjectMap[String(q.subjectId)] || 'Subject'}
                            </span>
                          ) : null}
                          {q.year ? <span className="meta-text">{q.year}</span> : null}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedQuestions.length > 0 && selected.size > selectedQuestions.length ? (
            <p className="muted">
              Note: {selected.size - selectedQuestions.length} selected question(s) are not in
              the current view but remain selected.
            </p>
          ) : null}
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetForm}
            disabled={submitting}
          >
            Reset
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Creating…' : `Create test (${selected.size})`}
          </button>
        </div>
      </form>
    </div>
  );
}
