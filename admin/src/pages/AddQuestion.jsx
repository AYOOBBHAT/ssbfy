import { useEffect, useState } from 'react';
import {
  createQuestion,
  getSubjects,
  getTopics,
  getApiErrorMessage,
} from '../services/api';

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const OPTION_COUNT = 4;
const emptyOptions = () => Array.from({ length: OPTION_COUNT }, () => '');

/**
 * Question types mirror the backend enum. Keeping the stored value separate
 * from the human label lets us rename labels later without touching the API
 * contract.
 */
const QUESTION_TYPES = [
  { value: 'single_correct', label: 'Single Correct' },
  { value: 'multiple_correct', label: 'Multiple Correct' },
  { value: 'image_based', label: 'Image Based' },
];

/**
 * Types where exactly one option must be correct. `image_based` behaves like
 * `single_correct` for answer selection — the task explicitly calls this
 * out so we centralize the rule here to avoid scattering the check.
 */
function isSingleAnswerType(t) {
  return t === 'single_correct' || t === 'image_based';
}

/** Light http(s) URL sanity check — the server does the authoritative one. */
function looksLikeHttpUrl(s) {
  if (typeof s !== 'string' || s.trim() === '') return false;
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const initialForm = {
  questionType: 'single_correct',
  questionText: '',
  options: emptyOptions(),
  correctAnswers: [0],
  questionImage: '',
  subjectId: '',
  topicId: '',
  difficulty: 'medium',
  explanation: '',
};

export default function AddQuestion() {
  const [form, setForm] = useState(initialForm);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);

  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [metaError, setMetaError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingSubjects(true);
        setMetaError('');
        const subjectsRes = await getSubjects();
        if (cancelled) return;
        setSubjects(
          Array.isArray(subjectsRes)
            ? subjectsRes
            : subjectsRes?.subjects || []
        );
      } catch (e) {
        if (!cancelled) setMetaError(getApiErrorMessage(e));
      } finally {
        if (!cancelled) setLoadingSubjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!form.subjectId) {
      setTopics([]);
      return undefined;
    }
    (async () => {
      try {
        setLoadingTopics(true);
        const res = await getTopics({ subjectId: form.subjectId });
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res?.topics || [];
        setTopics(list);
      } catch (e) {
        if (!cancelled) {
          setMetaError(getApiErrorMessage(e));
          setTopics([]);
        }
      } finally {
        if (!cancelled) setLoadingTopics(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.subjectId]);

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

  /**
   * Switch between question types while keeping the admin's partial input
   * intact where possible. When moving to a single-answer type we collapse
   * the current multi-selection to its first entry so we never submit
   * something that would fail the backend's arity rule.
   */
  function changeQuestionType(nextType) {
    setForm((prev) => {
      let nextCorrect = prev.correctAnswers;
      if (isSingleAnswerType(nextType)) {
        nextCorrect = prev.correctAnswers.length ? [prev.correctAnswers[0]] : [0];
      } else if (nextType === 'multiple_correct') {
        // Keep the existing selection; admin will add a second correct answer.
        nextCorrect = prev.correctAnswers.length ? prev.correctAnswers : [0];
      }
      return {
        ...prev,
        questionType: nextType,
        correctAnswers: nextCorrect,
      };
    });
  }

  /**
   * Toggle an option as correct. For single-answer types this acts like a
   * radio (always replaces); for `multiple_correct` it toggles membership.
   * We also sort the array so the preview ("A, C") is deterministic.
   */
  function toggleCorrectAnswer(idx) {
    setForm((prev) => {
      if (isSingleAnswerType(prev.questionType)) {
        return { ...prev, correctAnswers: [idx] };
      }
      const set = new Set(prev.correctAnswers);
      if (set.has(idx)) {
        set.delete(idx);
      } else {
        set.add(idx);
      }
      const next = Array.from(set).sort((a, b) => a - b);
      // Don't let the admin end up with ZERO selections — there's no useful
      // state for that. Fall back to the index they just clicked.
      return { ...prev, correctAnswers: next.length ? next : [idx] };
    });
  }

  function resetForm() {
    setForm({ ...initialForm, options: emptyOptions(), correctAnswers: [0] });
  }

  function validate() {
    if (!form.questionText.trim()) return 'Question text is required.';
    const trimmedOptions = form.options.map((o) => o.trim());
    if (trimmedOptions.some((o) => !o)) return 'All 4 options are required.';
    if (!Array.isArray(form.correctAnswers) || form.correctAnswers.length === 0) {
      return 'Pick at least one correct answer.';
    }
    for (const idx of form.correctAnswers) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= trimmedOptions.length) {
        return 'A selected correct answer is out of range.';
      }
    }
    if (isSingleAnswerType(form.questionType) && form.correctAnswers.length !== 1) {
      return 'This question type allows exactly one correct answer.';
    }
    if (form.questionType === 'multiple_correct' && form.correctAnswers.length < 2) {
      return 'Multiple-correct questions need at least two correct answers.';
    }
    if (form.questionType === 'image_based') {
      if (!form.questionImage.trim()) {
        return 'Image URL is required for image-based questions.';
      }
      if (!looksLikeHttpUrl(form.questionImage)) {
        return 'Image URL must be a valid http(s) URL.';
      }
    } else if (form.questionImage.trim() && !looksLikeHttpUrl(form.questionImage)) {
      return 'Image URL must be a valid http(s) URL.';
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
    const sortedCorrect = [...form.correctAnswers].sort((a, b) => a - b);
    const primary = sortedCorrect[0];

    // We send BOTH the new array and the legacy scalar forms. The server
    // uses the array when present but any older validator/consumer that
    // still reads `correctAnswerIndex` / `correctAnswer` gets a sensible
    // single-answer value pointed at the primary correct option.
    const payload = {
      questionType: form.questionType,
      questionText: form.questionText.trim(),
      options: trimmedOptions,
      correctAnswers: sortedCorrect,
      correctAnswerIndex: primary,
      correctAnswerValue: trimmedOptions[primary],
      correctAnswer: primary ?? null,
      subjectId: form.subjectId,
      topicId: form.topicId,
      difficulty: form.difficulty,
    };
    if (form.questionImage.trim()) {
      payload.questionImage = form.questionImage.trim();
    }
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

  const isMulti = form.questionType === 'multiple_correct';
  const isImage = form.questionType === 'image_based';

  const previewQuestion = form.questionText.trim() || 'Your question will appear here…';
  const previewOptions = form.options.map(
    (opt, i) => opt.trim() || `Option ${String.fromCharCode(65 + i)}`
  );
  const correctLetters = [...form.correctAnswers]
    .sort((a, b) => a - b)
    .map((i) => String.fromCharCode(65 + i))
    .join(', ');
  const previewImageUrl =
    form.questionImage.trim() && looksLikeHttpUrl(form.questionImage)
      ? form.questionImage.trim()
      : '';

  return (
    <div>
      <h1 className="page-title">Add Question</h1>
      <p className="page-subtitle">
        Create a new question. Fields marked * are required.
      </p>

      {loadingSubjects ? (
        <div className="card">
          <p className="muted">Loading subjects…</p>
        </div>
      ) : metaError ? (
        <div className="alert alert-error">{metaError}</div>
      ) : subjects.length === 0 ? (
        <div className="alert alert-error">
          No subjects found. Create one in{' '}
          <strong>Manage Subjects &amp; Topics</strong> first.
        </div>
      ) : null}

      <form className="card form" onSubmit={handleSubmit}>
        {successMsg ? (
          <div className="alert alert-success">{successMsg}</div>
        ) : null}
        {errorMsg ? <div className="alert alert-error">{errorMsg}</div> : null}

        <div className="form-row">
          <label className="label" htmlFor="questionType">
            Question Type *
          </label>
          <select
            id="questionType"
            className="input"
            value={form.questionType}
            onChange={(e) => changeQuestionType(e.target.value)}
            disabled={submitting}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {isMulti ? (
            <p className="helper">Select all correct options below.</p>
          ) : isImage ? (
            <p className="helper">
              Attach an image URL below. Answer selection behaves like a
              single-correct question unless changed to “Multiple Correct”.
            </p>
          ) : (
            <p className="helper">Pick exactly one correct option below.</p>
          )}
        </div>

        {isImage ? (
          <div className="form-row">
            <label className="label" htmlFor="questionImage">
              Question Image URL *
            </label>
            <input
              id="questionImage"
              type="url"
              className="input"
              value={form.questionImage}
              onChange={(e) => updateField('questionImage', e.target.value)}
              placeholder="https://example.com/image.png"
              disabled={submitting}
            />
            <p className="helper">
              Paste a direct http(s) URL. File upload will be added once the
              backend exposes an upload route.
            </p>
          </div>
        ) : null}

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
          <label className="label">
            Options *{' '}
            {isMulti
              ? '(tick every correct option)'
              : '(select the correct one)'}
          </label>
          <div className="options-list">
            {form.options.map((opt, i) => {
              const isCorrect = form.correctAnswers.includes(i);
              return (
                <div
                  key={i}
                  className={`option-row ${isCorrect ? 'option-row-correct' : ''}`}
                >
                  <label className="radio-label">
                    <input
                      type={isMulti ? 'checkbox' : 'radio'}
                      name="correctAnswers"
                      checked={isCorrect}
                      onChange={() => toggleCorrectAnswer(i)}
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
          <p className="helper">
            Selected correct answers:{' '}
            <strong>{correctLetters || '—'}</strong>
          </p>
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
              disabled={submitting || loadingSubjects}
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
              disabled={submitting || !form.subjectId || loadingTopics}
            >
              <option value="">
                {!form.subjectId
                  ? '— Select a subject first —'
                  : loadingTopics
                  ? 'Loading topics…'
                  : topics.length === 0
                  ? 'No topics for this subject'
                  : '— Select topic —'}
              </option>
              {topics.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name || t.title || t._id}
                </option>
              ))}
            </select>
            {form.subjectId && !loadingTopics && topics.length === 0 ? (
              <p className="helper">
                No topics yet. Add one in Manage Subjects &amp; Topics.
              </p>
            ) : null}
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
            disabled={submitting || loadingSubjects}
          >
            {submitting ? 'Saving…' : 'Create Question'}
          </button>
        </div>
      </form>

      {/* Live preview — updates as the admin types. */}
      <div className="preview">
        <h2 className="preview-heading">Preview</h2>
        <div className="card preview-card">
          <p className="preview-type-badge">
            <span className="preview-tag">
              {QUESTION_TYPES.find((t) => t.value === form.questionType)?.label}
            </span>
          </p>
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt="Question"
              className="preview-image"
              onError={(e) => {
                // Hide a broken image instead of showing a busted icon; the
                // server will re-validate on submit anyway.
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : null}
          <p className="preview-question">{previewQuestion}</p>
          <ul className="preview-options">
            {previewOptions.map((opt, i) => {
              const isCorrect = form.correctAnswers.includes(i);
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
          <p className="preview-correct-summary">
            Selected Correct Answers:{' '}
            <strong>{correctLetters || '—'}</strong>
          </p>
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
