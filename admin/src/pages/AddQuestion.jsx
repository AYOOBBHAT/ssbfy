import { useEffect, useMemo, useState } from 'react';
import {
  createQuestion,
  getSubjects,
  getTopics,
  getApiErrorMessage,
} from '../services/api';

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const OPTION_COUNT = 4;
const emptyOptions = () => Array.from({ length: OPTION_COUNT }, () => '');

const initialForm = {
  questionText: '',
  options: emptyOptions(),
  correctAnswerIndex: 0,
  subjectId: '',
  topicId: '',
  difficulty: 'medium',
  explanation: '',
};

export default function AddQuestion() {
  const [form, setForm] = useState(initialForm);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingMeta(true);
        setMetaError('');
        const [subjectsRes, topicsRes] = await Promise.all([
          getSubjects(),
          getTopics(),
        ]);
        if (cancelled) return;
        setSubjects(Array.isArray(subjectsRes) ? subjectsRes : subjectsRes?.subjects || []);
        setTopics(Array.isArray(topicsRes) ? topicsRes : topicsRes?.topics || []);
      } catch (e) {
        if (!cancelled) setMetaError(getApiErrorMessage(e));
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If a topic carries a subjectId, narrow the dropdown to that subject.
  const filteredTopics = useMemo(() => {
    if (!form.subjectId) return topics;
    const hasSubjectLink = topics.some((t) => t?.subjectId);
    if (!hasSubjectLink) return topics;
    return topics.filter((t) => String(t.subjectId) === String(form.subjectId));
  }, [topics, form.subjectId]);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function updateOption(idx, value) {
    setForm((prev) => {
      const next = [...prev.options];
      next[idx] = value;
      return { ...prev, options: next };
    });
  }

  function resetForm() {
    setForm({ ...initialForm, options: emptyOptions() });
  }

  function validate() {
    if (!form.questionText.trim()) return 'Question text is required.';
    const trimmedOptions = form.options.map((o) => o.trim());
    if (trimmedOptions.some((o) => !o)) return 'All 4 options are required.';
    if (
      form.correctAnswerIndex < 0 ||
      form.correctAnswerIndex >= trimmedOptions.length
    ) {
      return 'Pick a correct answer.';
    }
    if (!form.subjectId) return 'Please select a subject.';
    if (!form.topicId) return 'Please select a topic.';
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

    const trimmedOptions = form.options.map((o) => o.trim());
    const payload = {
      questionText: form.questionText.trim(),
      options: trimmedOptions,
      correctAnswerIndex: form.correctAnswerIndex,
      correctAnswerValue: trimmedOptions[form.correctAnswerIndex],
      subjectId: form.subjectId,
      topicId: form.topicId,
      difficulty: form.difficulty,
    };
    if (form.explanation.trim()) {
      payload.explanation = form.explanation.trim();
    }

    try {
      setSubmitting(true);
      await createQuestion(payload);
      setSuccessMsg('Question added successfully ✅');
      resetForm();
    } catch (err) {
      setErrorMsg(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Live preview values — built from current form state, not the API response.
  const previewQuestion = form.questionText.trim() || 'Your question will appear here…';
  const previewOptions = form.options.map((opt, i) => opt.trim() || `Option ${String.fromCharCode(65 + i)}`);

  return (
    <div>
      <h1 className="page-title">Add Question</h1>
      <p className="page-subtitle">
        Create a new MCQ. Fields marked * are required.
      </p>

      {loadingMeta ? (
        <div className="card">
          <p className="muted">Loading subjects and topics…</p>
        </div>
      ) : metaError ? (
        <div className="alert alert-error">{metaError}</div>
      ) : null}

      <form className="card form" onSubmit={handleSubmit}>
        {successMsg ? (
          <div className="alert alert-success">{successMsg}</div>
        ) : null}
        {errorMsg ? <div className="alert alert-error">{errorMsg}</div> : null}

        <div className="form-row">
          <label className="label" htmlFor="questionText">
            Question text *
          </label>
          <textarea
            id="questionText"
            className="input"
            rows={3}
            value={form.questionText}
            onChange={(e) => updateField('questionText', e.target.value)}
            placeholder="Enter the question…"
            disabled={submitting}
          />
        </div>

        <div className="form-row">
          <label className="label">Options * (select the correct one)</label>
          <div className="options-list">
            {form.options.map((opt, i) => {
              const isCorrect = form.correctAnswerIndex === i;
              return (
                <div
                  key={i}
                  className={`option-row ${isCorrect ? 'option-row-correct' : ''}`}
                >
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="correctAnswerIndex"
                      checked={isCorrect}
                      onChange={() => updateField('correctAnswerIndex', i)}
                      disabled={submitting}
                    />
                    <span className="option-letter">
                      {String.fromCharCode(65 + i)}
                    </span>
                  </label>
                  <input
                    type="text"
                    className="input option-input"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    disabled={submitting}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label className="label" htmlFor="subjectId">
              Subject *
            </label>
            <select
              id="subjectId"
              className="input"
              value={form.subjectId}
              onChange={(e) => {
                updateField('subjectId', e.target.value);
                updateField('topicId', '');
              }}
              disabled={submitting || loadingMeta}
            >
              <option value="">— Select subject —</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name || s.title || s._id}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="label" htmlFor="topicId">
              Topic *
            </label>
            <select
              id="topicId"
              className="input"
              value={form.topicId}
              onChange={(e) => updateField('topicId', e.target.value)}
              disabled={submitting || loadingMeta}
            >
              <option value="">— Select topic —</option>
              {filteredTopics.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name || t.title || t._id}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="label" htmlFor="difficulty">
              Difficulty
            </label>
            <select
              id="difficulty"
              className="input"
              value={form.difficulty}
              onChange={(e) => updateField('difficulty', e.target.value)}
              disabled={submitting}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <label className="label" htmlFor="explanation">
            Explanation
          </label>
          <textarea
            id="explanation"
            className="input"
            rows={3}
            value={form.explanation}
            onChange={(e) => updateField('explanation', e.target.value)}
            placeholder="Optional explanation shown after submission."
            disabled={submitting}
          />
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
            disabled={submitting || loadingMeta}
          >
            {submitting ? 'Saving…' : 'Create Question'}
          </button>
        </div>
      </form>

      {/* Live preview — updates as the admin types. */}
      <div className="preview">
        <h2 className="preview-heading">Preview</h2>
        <div className="card preview-card">
          <p className="preview-question">{previewQuestion}</p>
          <ul className="preview-options">
            {previewOptions.map((opt, i) => {
              const isCorrect = form.correctAnswerIndex === i;
              return (
                <li
                  key={i}
                  className={`preview-option ${isCorrect ? 'preview-option-correct' : ''}`}
                >
                  <span className="preview-letter">{String.fromCharCode(65 + i)}.</span>
                  <span className="preview-text">{opt}</span>
                  {isCorrect ? <span className="preview-tag">Correct</span> : null}
                </li>
              );
            })}
          </ul>
          {form.explanation.trim() ? (
            <div className="preview-explanation">
              <span className="preview-explanation-label">Explanation:</span>{' '}
              {form.explanation.trim()}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
