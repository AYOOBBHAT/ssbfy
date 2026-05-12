import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  commitImportQuestions,
  downloadImportTemplate,
  dryRunImportQuestions,
  getApiErrorMessage,
  getPosts,
} from '../services/api';

/**
 * The Import Questions page intentionally splits the user journey into
 * three explicit steps so the admin always knows what happens next:
 *
 *   1. Pick CSV   — choose the file, optional template download.
 *   2. Preview    — server returns row-by-row analysis without writing.
 *   3. Commit     — admin confirms; server re-validates from the same
 *                   bytes (so we never trust client-supplied row data)
 *                   and inserts only the `valid` rows. The summary screen
 *                   is the same `rows` payload, plus inserted/error totals.
 *
 * Force-import is OFF by default — duplicates are skipped. Admin must
 * explicitly toggle the override and re-confirm if they want to insert
 * duplicates anyway. In-batch duplicates are NEVER force-imported because
 * the same CSV claiming the same question twice is always a mistake.
 */

const STEPS = [
  { id: 'pick', label: '1. Pick CSV' },
  { id: 'preview', label: '2. Review preview' },
  { id: 'done', label: '3. Import & summary' },
];

const MAX_ROWS_RENDERED = 500;

function previewText(s, max = 80) {
  if (typeof s !== 'string' || !s.trim()) return '—';
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export default function ImportQuestions() {
  const [step, setStep] = useState('pick');
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [commitResult, setCommitResult] = useState(null);

  const [forceImportDuplicates, setForceImportDuplicates] = useState(false);
  const [showCommitConfirm, setShowCommitConfirm] = useState(false);

  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [posts, setPosts] = useState([]);
  const [tagPostId, setTagPostId] = useState('');

  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getPosts();
        const list = Array.isArray(data) ? data : data?.posts || [];
        if (!cancelled) setPosts(list);
      } catch {
        if (!cancelled) setPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = analysis?.summary;

  const sortedRows = useMemo(() => {
    if (!analysis?.rows) return [];
    const order = { invalid: 0, duplicate: 1, valid: 2 };
    return [...analysis.rows].sort((a, b) => {
      const oa = order[a.status] ?? 9;
      const ob = order[b.status] ?? 9;
      if (oa !== ob) return oa - ob;
      return (a.line || 0) - (b.line || 0);
    });
  }, [analysis]);

  const rowsToRender = sortedRows.slice(0, MAX_ROWS_RENDERED);
  const hiddenRowCount = Math.max(0, sortedRows.length - MAX_ROWS_RENDERED);

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null;
    setErrMsg('');
    setStatusMsg('');
    setAnalysis(null);
    setCommitResult(null);
    setFile(f);
  }

  async function handleDownloadTemplate() {
    setErrMsg('');
    try {
      const blob = await downloadImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'question-import-template.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrMsg(getApiErrorMessage(e));
    }
  }

  async function handleDryRun() {
    if (!file || busy) return;
    setBusy(true);
    setErrMsg('');
    setStatusMsg('');
    setCommitResult(null);
    try {
      const data = await dryRunImportQuestions(file, {
        tagPostId: tagPostId || undefined,
      });
      setAnalysis(data || { summary: null, rows: [] });
      setStep('preview');
    } catch (e) {
      setErrMsg(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function startCommit() {
    setShowCommitConfirm(true);
  }

  async function confirmCommit() {
    if (!file || busy) return;
    setShowCommitConfirm(false);
    setBusy(true);
    setErrMsg('');
    setStatusMsg('');
    try {
      const data = await commitImportQuestions(file, {
        forceImportDuplicates,
        tagPostId: tagPostId || undefined,
      });
      setCommitResult(data || null);
      setStep('done');
      const inserted = data?.summary?.inserted ?? 0;
      setStatusMsg(`Imported ${inserted} question${inserted === 1 ? '' : 's'}.`);
    } catch (e) {
      setErrMsg(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setFile(null);
    setAnalysis(null);
    setCommitResult(null);
    setStep('pick');
    setForceImportDuplicates(false);
    setTagPostId('');
    setStatusMsg('');
    setErrMsg('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleDownloadInsertErrors() {
    const errs = commitResult?.insertErrors;
    if (!errs?.length) return;
    const header = 'line,message\n';
    const body = errs
      .map((e) => `${e.line ?? ''},"${String(e.message || '').replace(/"/g, '""')}"`)
      .join('\n');
    const blob = new Blob([header + body + '\n'], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 className="page-title">Import Questions</h1>
      <p className="page-subtitle">
        Bulk-create questions from a CSV. The preview step runs full
        validation server-side <strong>without writing</strong> — review the
        report, then commit only when ready. Duplicates are skipped by
        default; soft-disable existing questions instead of removing them.
      </p>

      <div className="stepper">
        {STEPS.map((s) => {
          const isActive = s.id === step;
          const isDone =
            (step === 'preview' && s.id === 'pick') ||
            (step === 'done' && (s.id === 'pick' || s.id === 'preview'));
          return (
            <div
              key={s.id}
              className={`stepper-item${isActive ? ' stepper-item-active' : ''}${
                isDone ? ' stepper-item-done' : ''
              }`}
            >
              {s.label}
            </div>
          );
        })}
      </div>

      {errMsg ? <div className="alert alert-error">{errMsg}</div> : null}
      {statusMsg ? <div className="alert alert-success">{statusMsg}</div> : null}

      {step === 'pick' ? (
        <div className="card form">
          <div className="form-row">
            <label className="label">CSV file</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel"
              onChange={handleFileChange}
              disabled={busy}
            />
            <p className="helper">
              UTF-8 CSV up to 5 MB. Excel users: <em>File → Save As → CSV
              UTF-8 (Comma delimited)</em>. .xlsx is not supported in v1.
            </p>
          </div>

          <details>
            <summary className="helper" style={{ cursor: 'pointer' }}>
              Required columns (click to expand)
            </summary>
            <ul className="helper" style={{ marginTop: 8 }}>
              <li>
                <strong>questionText</strong>, <strong>optionA</strong>,{' '}
                <strong>optionB</strong>, <strong>optionC</strong>,{' '}
                <strong>optionD</strong>
              </li>
              <li>
                <strong>correctAnswer</strong> — letter(s) A/B/C/D, or comma-
                separated for multi-correct (e.g. <code>A,C</code>)
              </li>
              <li>
                <strong>subject</strong>, <strong>topic</strong> — name
                (case-insensitive) or Mongo ObjectId
              </li>
              <li>
                Optional: <strong>difficulty</strong> (easy/medium/hard,
                defaults to medium), <strong>explanation</strong>,{' '}
                <strong>year</strong>,{' '}
                <strong>questionType</strong> (auto-inferred otherwise),{' '}
                <strong>questionImage</strong> (http/https URL),{' '}
                <strong>postIds</strong> — comma-separated Post ids (exam tags)
              </li>
            </ul>
          </details>

          <div className="form-row">
            <label className="label" htmlFor="import-tag-post">
              Optional exam tag (all rows)
            </label>
            <select
              id="import-tag-post"
              className="input"
              value={tagPostId}
              onChange={(e) => setTagPostId(e.target.value)}
              disabled={busy}
            >
              <option value="">None — questions may have empty post tags</option>
              {posts.map((p) => (
                <option key={String(p._id)} value={String(p._id)}>
                  {p.name || String(p._id)}
                </option>
              ))}
            </select>
            <p className="helper">
              If set, this Post id is merged into each row&apos;s{' '}
              <code>postIds</code> (deduped). Subjects stay global; this is not
              ownership. Per-row tags: use the <code>postIds</code> column.
            </p>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDownloadTemplate}
              disabled={busy}
            >
              Download CSV template
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDryRun}
              disabled={busy || !file}
            >
              {busy ? 'Validating…' : 'Preview import'}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'preview' && analysis ? (
        <div className="card">
          <div className="import-summary-pills">
            <span className="import-pill pill-total">
              Total rows: <strong>{summary?.total ?? 0}</strong>
            </span>
            <span className="import-pill pill-valid">
              Valid: <strong>{summary?.valid ?? 0}</strong>
            </span>
            <span className="import-pill pill-duplicate">
              Duplicates: <strong>{summary?.duplicates ?? 0}</strong>
            </span>
            <span className="import-pill pill-invalid">
              Invalid: <strong>{summary?.invalid ?? 0}</strong>
            </span>
          </div>

          {summary?.invalid > 0 ? (
            <div className="alert alert-warning" style={{ marginBottom: 12 }}>
              {summary.invalid} row(s) have validation errors. They will be
              skipped on import — fix the CSV and re-upload to include them.
            </div>
          ) : null}

          {summary?.duplicates > 0 ? (
            <div className="alert alert-warning" style={{ marginBottom: 12 }}>
              {summary.duplicates} row(s) match an existing question in the
              same subject. By default they are skipped. Use the override
              below only if these are intentional re-imports.
            </div>
          ) : null}

          <div className="form-row">
            <label className="label" style={{ display: 'inline-flex', gap: 8 }}>
              <input
                type="checkbox"
                checked={forceImportDuplicates}
                onChange={(e) => setForceImportDuplicates(e.target.checked)}
              />
              Force import DB duplicates anyway (in-batch duplicates are still
              skipped)
            </label>
          </div>

          <div className="import-table-wrap" style={{ marginBottom: 12 }}>
            <table className="import-table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>Line</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th>Question</th>
                  <th style={{ width: 220 }}>Topic / Subject</th>
                  <th style={{ width: 100 }}>Difficulty</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rowsToRender.map((row) => (
                  <tr
                    key={row.line}
                    className={
                      row.status === 'invalid'
                        ? 'import-row-invalid'
                        : row.status === 'duplicate'
                          ? 'import-row-duplicate'
                          : 'import-row-valid'
                    }
                  >
                    <td>{row.line}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          row.status === 'valid'
                            ? 'status-active'
                            : 'status-inactive'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <div className="import-row-text">
                        {previewText(row.questionText, 240)}
                      </div>
                    </td>
                    <td>
                      <div>{row.topic?.name || '—'}</div>
                      <div className="import-row-meta">
                        {row.subject?.name || '—'}
                      </div>
                    </td>
                    <td>{row.difficulty || '—'}</td>
                    <td>
                      {row.status === 'invalid' && row.reasons?.length ? (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {row.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      ) : null}
                      {row.status === 'duplicate' ? (
                        <div>
                          {row.duplicateOfId ? (
                            <>
                              Matches existing question{' '}
                              <code>
                                {String(row.duplicateOfId).slice(-8)}
                              </code>
                            </>
                          ) : null}
                          {row.duplicateOfLine ? (
                            <>Same as line {row.duplicateOfLine} in this CSV</>
                          ) : null}
                        </div>
                      ) : null}
                      {row.status === 'valid' ? (
                        <span className="helper">Ready to insert</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hiddenRowCount > 0 ? (
            <p className="helper">
              + {hiddenRowCount} more row(s) not rendered for performance. The
              import below will still process every row.
            </p>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={startOver}
              disabled={busy}
            >
              Pick different file
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={startCommit}
              disabled={
                busy ||
                (summary?.valid === 0 &&
                  !(forceImportDuplicates && summary?.duplicates > 0))
              }
            >
              {busy ? 'Importing…' : 'Import valid rows'}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'done' && commitResult ? (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 8 }}>
            Import summary
          </h3>
          <div className="import-summary-pills">
            <span className="import-pill pill-valid">
              Inserted:{' '}
              <strong>{commitResult.summary?.inserted ?? 0}</strong>
            </span>
            <span className="import-pill pill-duplicate">
              Duplicates skipped:{' '}
              <strong>{commitResult.summary?.duplicates ?? 0}</strong>
            </span>
            <span className="import-pill pill-invalid">
              Invalid skipped:{' '}
              <strong>{commitResult.summary?.invalid ?? 0}</strong>
            </span>
            <span className="import-pill pill-total">
              Total rows:{' '}
              <strong>{commitResult.summary?.total ?? 0}</strong>
            </span>
          </div>

          {commitResult.insertErrors?.length ? (
            <>
              <div className="alert alert-error" style={{ marginBottom: 12 }}>
                {commitResult.insertErrors.length} row(s) failed at insert
                time. Download the error report to fix and re-upload them.
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDownloadInsertErrors}
                >
                  Download import-errors.csv
                </button>
              </div>
            </>
          ) : null}

          <div className="form-actions" style={{ marginTop: 16 }}>
            <Link to="/manage-questions" className="btn btn-secondary">
              Open Manage Questions
            </Link>
            <button
              type="button"
              className="btn btn-primary"
              onClick={startOver}
            >
              Import another file
            </button>
          </div>
        </div>
      ) : null}

      {showCommitConfirm ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Confirm import</h3>
            <p className="helper">
              About to import{' '}
              <strong>
                {(summary?.valid ?? 0) +
                  (forceImportDuplicates ? summary?.duplicates ?? 0 : 0)}
              </strong>{' '}
              question(s) into the live question bank.
              {forceImportDuplicates && summary?.duplicates > 0 ? (
                <>
                  {' '}This includes {summary.duplicates} duplicate(s) of
                  existing questions because{' '}
                  <strong>Force import</strong> is on.
                </>
              ) : null}{' '}
              This action is not reversible from the UI — disable individual
              questions afterwards from Manage Questions if needed.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCommitConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmCommit}
              >
                Yes, import
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
