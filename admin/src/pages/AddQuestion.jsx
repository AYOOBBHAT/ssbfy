import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  createQuestion,
  findSimilarQuestions,
  getQuestionForAdmin,
  getPosts,
  getSubject,
  getSubjects,
  getTopics,
  getApiErrorMessage,
  updateQuestion,
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

function normalizeOptionsFromServer(raw) {
  const o = Array.isArray(raw) ? raw.map((x) => String(x ?? '')) : [];
  const padded = o.slice(0, OPTION_COUNT);
  while (padded.length < OPTION_COUNT) padded.push('');
  return padded;
}

export default function AddQuestion() {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit')?.trim() || '';
  const isEdit = Boolean(editId);

  const [form, setForm] = useState(initialForm);
  const [posts, setPosts] = useState([]);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);

  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [metaError, setMetaError] = useState('');
  const [loadingEdit, setLoadingEdit] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  /** Increment in edit mode to re-fetch the question (Reset) without full page reload. */
  const [editVersion, setEditVersion] = useState(0);

  // Similar-question state. We only ever surface this as a soft warning —
  // some near-duplicates are legitimate (different exam papers, retypes from
  // older sources) so the admin always retains the final say.
  const [similar, setSimilar] = useState({ exactDuplicateId: null, similar: [] });
  const [similarLoading, setSimilarLoading] = useState(false);
  const [acknowledgedDuplicate, setAcknowledgedDuplicate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingPosts(true);
        setMetaError('');
        const res = await getPosts();
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res?.posts || [];
        setPosts(list);
      } catch (e) {
        if (!cancelled) setMetaError(getApiErrorMessage(e));
      } finally {
        if (!cancelled) setLoadingPosts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedPostId) {
      setSubjects([]);
      return undefined;
    }
    (async () => {
      try {
        setLoadingSubjects(true);
        const subjectsRes = await getSubjects({
          postId: selectedPostId,
          includeInactive: true,
        });
        if (cancelled) return;
        setSubjects(
          Array.isArray(subjectsRes) ? subjectsRes : subjectsRes?.subjects || []
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
  }, [selectedPostId]);

  useEffect(() => {
    let cancelled = false;
    if (!form.subjectId) {
      setTopics([]);
      return undefined;
    }
    (async () => {
      try {
        setLoadingTopics(true);
        const res = await getTopics({ subjectId: form.subjectId, includeInactive: true });
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

  useEffect(() => {
    if (!editId) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingEdit(true);
      setErrorMsg('');
      setSuccessMsg('');
      try {
        const res = await getQuestionForAdmin(editId);
        const q = res?.question || res;
        if (cancelled || !q) return;
        const answers = Array.isArray(q.correctAnswers)
          ? q.correctAnswers.map((n) => Number(n))
          : [0];
        const sid = String(
          typeof q.subjectId === 'object' && q.subjectId?._id != null
            ? q.subjectId._id
            : q.subjectId || ''
        );
        if (sid) {
          try {
            const sub = await getSubject(sid);
            if (sub?.postId) setSelectedPostId(String(sub.postId));
          } catch {
            /* ignore — admin can pick post manually */
          }
        }

        const topicRaw = q.topicId;
        const topicStr =
          typeof topicRaw === 'object' && topicRaw?._id != null
            ? String(topicRaw._id)
            : String(topicRaw || '');

        setForm({
          questionType: q.questionType || 'single_correct',
          questionText: q.questionText || '',
          options: normalizeOptionsFromServer(q.options),
          correctAnswers: answers,
          questionImage: q.questionImage || '',
          subjectId: sid,
          topicId: topicStr,
          difficulty: q.difficulty || 'medium',
          explanation: q.explanation || '',
        });
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(getApiErrorMessage(e));
          setForm({ ...initialForm, options: emptyOptions(), correctAnswers: [0] });
        }
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, editVersion]);

  // Debounced "Possible duplicate?" lookup. Triggers when both the question
  // text and the subject are populated — without a subject we can't scope
  // duplicate detection to anything meaningful, and the server-side helper
  // refuses unscoped queries anyway.
  useEffect(() => {
    const text = form.questionText.trim();
    if (!text || text.length < 8 || !form.subjectId) {
      setSimilar({ exactDuplicateId: null, similar: [] });
      return undefined;
    }
    let cancelled = false;
    setSimilarLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await findSimilarQuestions({
          questionText: text,
          subjectId: form.subjectId,
          excludeId: editId || null,
        });
        if (cancelled) return;
        setSimilar(data || { exactDuplicateId: null, similar: [] });
        // Reset acknowledgment whenever the underlying match changes — the
        // admin should consciously re-confirm each new duplicate they see.
        setAcknowledgedDuplicate(false);
      } catch {
        // Silent: the warning is non-blocking. Falling back to "no warning"
        // is preferable to a scary error toast for a soft UX feature.
        if (!cancelled) setSimilar({ exactDuplicateId: null, similar: [] });
      } finally {
        if (!cancelled) setSimilarLoading(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.questionText, form.subjectId, editId]);

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
    if (isEdit) {
      setErrorMsg('');
      setSuccessMsg('');
      setEditVersion((v) => v + 1);
      return;
    }
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
    if (!selectedPostId) return 'Please select a post (exam).';
    if (!selectedPostId) return 'Please select a post (exam).';
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

    // Soft duplicate gate: server has no unique index on questionText
    // (legacy data may already contain near-duplicates), so this is a
    // client-side speed bump. Admin can override by ticking
    // "Save anyway" — we never silently let an exact duplicate through.
    if (similar.exactDuplicateId && !acknowledgedDuplicate) {
      setErrorMsg(
        'A question with the same text already exists in this subject. ' +
          'Tick "Save anyway" below the warning to insert it as a separate question, ' +
          'or open the existing question to edit it.'
      );
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
    if (isEdit) {
      payload.questionImage = form.questionImage.trim();
    } else if (form.questionImage.trim()) {
      payload.questionImage = form.questionImage.trim();
    }
    if (form.explanation.trim()) {
      payload.explanation = form.explanation.trim();
    }

    try {
      setSubmitting(true);
      if (isEdit) {
        await updateQuestion(editId, payload);
        setSuccessMsg('Changes saved successfully.');
      } else {
        await createQuestion(payload);
        setSuccessMsg('Question added successfully ✅');
        setForm({ ...initialForm, options: emptyOptions(), correctAnswers: [0] });
      }
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
      <h1 className="page-title">{isEdit ? 'Edit Question' : 'Add Question'}</h1>
      <p className="page-subtitle">
        {isEdit
          ? 'Update this question. Fields marked * are required.'
          : 'Create a new question. Fields marked * are required.'}
        {isEdit ? (
          <>
            {' '}
            <Link to="/manage-questions" className="card-cta" style={{ fontWeight: 600 }}>
              Back to Manage Questions
            </Link>
          </>
        ) : null}
      </p>

      {isEdit && loadingEdit ? (
        <div className="card">
          <p className="muted">Loading question…</p>
        </div>
      ) : null}

      {metaError ? <div className="alert alert-error">{metaError}</div> : null}

      <form
        className="card form"
        onSubmit={handleSubmit}
        style={isEdit && loadingEdit ? { display: 'none' } : undefined}
      >
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

        <p className="helper" style={{ marginBottom: 16 }}>
          Hierarchy: <strong>Post → Subject → Topic</strong>. Pick the exam first; subjects are scoped to
          that post.
        </p>

        <div className="form-grid">
          <div className="form-row">
            <label className="label" htmlFor="postPick">
              Post (exam) *
            </label>
            <select
              id="postPick"
              className="input"
              value={selectedPostId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedPostId(v);
                updateField('subjectId', '');
                updateField('topicId', '');
              }}
              disabled={submitting || loadingPosts}
            >
              <option value="">— Select post —</option>
              {posts.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name || p.slug || p._id}
                </option>
              ))}
            </select>
          </div>

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
              disabled={submitting || !selectedPostId || loadingSubjects}
            >
              <option value="">
                {!selectedPostId
                  ? '— Select a post first —'
                  : loadingSubjects
                    ? 'Loading subjects…'
                    : '— Select subject —'}
              </option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name || s.title || s._id}
                </option>
              ))}
            </select>
            {selectedPostId && !loadingSubjects && subjects.length === 0 ? (
              <p className="helper">No subjects under this post yet.</p>
            ) : null}
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
            placeholder="Recommended: explain why the correct answer is correct (shown after submission)."
            disabled={submitting}
          />
          {!form.explanation.trim() ? (
            <p className="helper" style={{ color: '#92400e' }}>
              Tip: explanations make Result review and Smart Practice
              learning loops far stronger. Optional, but encouraged.
            </p>
          ) : null}
        </div>

        {similarLoading ? (
          <p className="helper">Checking for similar questions…</p>
        ) : null}

        {!similarLoading && similar.exactDuplicateId ? (
          <div className="alert alert-warning">
            <div>
              <strong>Possible exact duplicate.</strong> A question with the
              same text already exists in this subject.
            </div>
            <div style={{ marginTop: 6 }}>
              <Link
                to={`/add-question?edit=${encodeURIComponent(
                  similar.exactDuplicateId
                )}`}
                style={{ fontWeight: 600 }}
              >
                Open existing question →
              </Link>
            </div>
            <label
              style={{
                display: 'inline-flex',
                gap: 8,
                alignItems: 'center',
                marginTop: 8,
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={acknowledgedDuplicate}
                onChange={(e) => setAcknowledgedDuplicate(e.target.checked)}
              />
              Save anyway — this is a different question that happens to
              share the same prompt.
            </label>
          </div>
        ) : null}

        {!similarLoading &&
        !similar.exactDuplicateId &&
        similar.similar.length > 0 ? (
          <div className="alert alert-info">
            <div>
              <strong>Similar questions in this subject:</strong>
            </div>
            <ul style={{ margin: '6px 0 0 18px' }}>
              {similar.similar.slice(0, 5).map((s) => (
                <li key={s._id}>
                  <Link
                    to={`/add-question?edit=${encodeURIComponent(s._id)}`}
                  >
                    {s.questionText.slice(0, 96)}
                    {s.questionText.length > 96 ? '…' : ''}
                  </Link>
                  {!s.isActive ? (
                    <span className="helper" style={{ marginLeft: 6 }}>
                      (inactive)
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="helper" style={{ marginTop: 6, marginBottom: 0 }}>
              These are not exact duplicates — saving is allowed, but please
              skim them first.
            </p>
          </div>
        ) : null}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetForm}
            disabled={submitting || (isEdit && loadingEdit)}
          >
            Reset
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || loadingSubjects || (isEdit && loadingEdit)}
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create Question'}
          </button>
        </div>
      </form>

      {/* Live preview — updates as the admin types. */}
      {!(isEdit && loadingEdit) ? (
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
      ) : null}
    </div>
  );
}
