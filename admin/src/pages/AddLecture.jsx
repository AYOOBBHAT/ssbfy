import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminLecture,
  getApiErrorMessage,
  getSubjects,
  getTopics,
  provisionLectureUploadUrl,
} from '../services/api';
import { uploadVideoToCloudflare } from '../utils/cloudflareDirectUpload';
import {
  LECTURE_ACCESS,
  LECTURE_DEFAULT_MAX_DURATION_SECONDS,
  LECTURE_DESCRIPTION_MAX,
  LECTURE_MAX_DURATION_SECONDS,
  LECTURE_STATUS,
  LECTURE_TITLE_MAX,
  LECTURE_TITLE_MIN,
} from '../constants/videoLectureUi';

function asArray(res, key) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res[key])) return res[key];
  return [];
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|avi|mpeg|mpg)$/i;

function isVideoFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('video/')) return true;
  return VIDEO_EXT.test(file.name || '');
}

function formatSize(bytes) {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function probeDurationSeconds(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const finish = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.onloadedmetadata = () => {
      const d = video.duration;
      finish(Number.isFinite(d) && d > 0 ? d : null);
    };
    video.onerror = () => finish(null);
    setTimeout(() => finish(null), 8000);
    video.src = url;
  });
}

const POLL_MS = 4000;
const POLL_TIMEOUT_MS = 8 * 60 * 1000;

const initialForm = {
  title: '',
  description: '',
  subjectId: '',
  topicId: '',
  access: LECTURE_ACCESS.FREE,
};

export default function AddLecture() {
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);

  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [metaError, setMetaError] = useState('');

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState('Select video');
  const [lectureId, setLectureId] = useState('');
  const [backendStatus, setBackendStatus] = useState('');
  const [canRetrySameUrl, setCanRetrySameUrl] = useState(false);

  const fileInputRef = useRef(null);
  const uploadUrlRef = useRef('');
  const lectureIdRef = useRef('');
  const pollTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingSubjects(true);
        setMetaError('');
        const res = await getSubjects({ includeInactive: true });
        if (cancelled) return;
        setSubjects(asArray(res, 'subjects').filter((s) => s && s.isActive !== false));
      } catch (e) {
        if (!cancelled) {
          setMetaError(getApiErrorMessage(e));
          setSubjects([]);
        }
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
        setTopics(asArray(res, 'topics').filter((t) => t && t.isActive !== false));
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
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const subjectPlaceholder = loadingSubjects
    ? 'Loading subjects…'
    : subjects.length === 0
      ? 'No subjects available'
      : '— Select subject —';

  const topicPlaceholder = !form.subjectId
    ? '— Select a subject first —'
    : loadingTopics
      ? 'Loading topics…'
      : topics.length === 0
        ? 'No topics for this subject'
        : '— Select topic —';

  const pct = Math.round(Math.min(100, Math.max(0, progress * 100)));

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubjectChange(value) {
    setForm((prev) => ({ ...prev, subjectId: value, topicId: '' }));
  }

  function handleFileChange(e) {
    const picked = e.target.files?.[0] || null;
    setErrorMsg('');
    if (!picked) {
      setFile(null);
      if (phase === 'idle') setStatusLabel('Select video');
      return;
    }
    if (!isVideoFile(picked)) {
      setFile(null);
      setErrorMsg('Please choose a video file (for example MP4, WebM, or MOV).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (!picked.size) {
      setFile(null);
      setErrorMsg('The selected file is empty.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(picked);
    if (phase === 'idle') setStatusLabel(`Selected: ${picked.name}`);
  }

  function resetForm() {
    if (busy) return;
    setForm(initialForm);
    setFile(null);
    setErrorMsg('');
    setPhase('idle');
    setProgress(0);
    setStatusLabel('Select video');
    setLectureId('');
    setBackendStatus('');
    setCanRetrySameUrl(false);
    uploadUrlRef.current = '';
    lectureIdRef.current = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function validate() {
    const title = form.title.trim();
    if (!title) return 'Title is required.';
    if (title.length < LECTURE_TITLE_MIN || title.length > LECTURE_TITLE_MAX) {
      return `Title must be ${LECTURE_TITLE_MIN}–${LECTURE_TITLE_MAX} characters.`;
    }
    if (form.description.length > LECTURE_DESCRIPTION_MAX) {
      return `Description must be at most ${LECTURE_DESCRIPTION_MAX} characters.`;
    }
    if (!form.subjectId) return 'Please select a subject.';
    if (!form.topicId) return 'Please select a topic.';
    if (!file) return 'Please select a video file.';
    if (!isVideoFile(file)) return 'Please choose a video file.';
    return null;
  }

  async function pollUntilTerminal(id) {
    const started = Date.now();
    const tick = async () => {
      const lecture = await getAdminLecture(id);
      const status = lecture?.status || '';
      setBackendStatus(status);
      if (status === LECTURE_STATUS.PUBLISHED) {
        setPhase('published');
        setStatusLabel('Published');
        setBusy(false);
        return;
      }
      if (status === LECTURE_STATUS.FAILED) {
        setPhase('failed');
        setStatusLabel('Video processing failed');
        setBusy(false);
        return;
      }
      if (Date.now() - started >= POLL_TIMEOUT_MS) {
        setPhase('timeout');
        setStatusLabel(
          'Processing is still underway. Check Manage Lectures later — do not upload again.'
        );
        setBusy(false);
        return;
      }
      setPhase('processing');
      setStatusLabel('Video uploaded — processing...');
      pollTimerRef.current = setTimeout(() => {
        tick().catch((err) => {
          setErrorMsg(getApiErrorMessage(err));
          setBusy(false);
        });
      }, POLL_MS);
    };
    await tick();
  }

  async function sendFileToCloudflare(uploadURL, videoFile) {
    setPhase('uploading');
    setProgress(0);
    setStatusLabel('Uploading video...');
    await uploadVideoToCloudflare({
      uploadURL,
      file: videoFile,
      onProgress: (ratio) => setProgress(ratio),
    });
    setProgress(1);
    setPhase('processing');
    setStatusLabel('Video uploaded — processing...');
  }

  async function handleRetrySameUrl() {
    if (busy || !uploadUrlRef.current || !file) return;
    setErrorMsg('');
    setBusy(true);
    setCanRetrySameUrl(false);
    try {
      await sendFileToCloudflare(uploadUrlRef.current, file);
      if (lectureIdRef.current) {
        await pollUntilTerminal(lectureIdRef.current);
      } else {
        setBusy(false);
      }
    } catch (err) {
      setPhase('upload-failed');
      setStatusLabel('Upload to Cloudflare failed');
      setErrorMsg(err?.message || 'Upload to Cloudflare failed.');
      setCanRetrySameUrl(true);
      setBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setErrorMsg('');

    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setBusy(true);
    setCanRetrySameUrl(false);

    try {
      const probed = await probeDurationSeconds(file);
      if (probed != null && probed > LECTURE_MAX_DURATION_SECONDS) {
        setErrorMsg(
          `This video is longer than the ${Math.floor(LECTURE_MAX_DURATION_SECONDS / 60)}-minute maximum.`
        );
        setBusy(false);
        return;
      }

      const maxDurationSeconds =
        probed != null
          ? Math.min(LECTURE_MAX_DURATION_SECONDS, Math.max(1, Math.ceil(probed)))
          : LECTURE_DEFAULT_MAX_DURATION_SECONDS;

      const provisioned = await provisionLectureUploadUrl({
        title: form.title.trim(),
        description: form.description.trim(),
        subjectId: form.subjectId,
        topicId: form.topicId,
        access: form.access,
        maxDurationSeconds,
      });

      const id = provisioned?.lectureId || '';
      const uploadURL = provisioned?.uploadURL || '';
      lectureIdRef.current = id;
      uploadUrlRef.current = uploadURL;
      setLectureId(id);
      setBackendStatus(provisioned?.status || LECTURE_STATUS.UPLOADING);

      if (!uploadURL) {
        setPhase('upload-failed');
        setStatusLabel('Upload URL was not returned');
        setErrorMsg('The server did not return a Cloudflare upload URL. Check Manage Lectures.');
        setBusy(false);
        return;
      }

      try {
        await sendFileToCloudflare(uploadURL, file);
      } catch (uploadErr) {
        setPhase('upload-failed');
        setStatusLabel('Upload to Cloudflare failed');
        setErrorMsg(
          `${uploadErr?.message || 'Upload to Cloudflare failed.'} A lecture record already exists — do not click Upload again. You may retry the same Cloudflare URL below.`
        );
        setCanRetrySameUrl(true);
        setBusy(false);
        return;
      }

      if (id) {
        await pollUntilTerminal(id);
      } else {
        setBusy(false);
      }
    } catch (err) {
      setPhase('idle');
      setStatusLabel('Select video');
      setErrorMsg(getApiErrorMessage(err));
      setBusy(false);
    }
  }

  const disableFields = busy;

  const statusClass = useMemo(() => {
    if (phase === 'published' || backendStatus === LECTURE_STATUS.PUBLISHED) {
      return 'status-badge status-active';
    }
    if (phase === 'failed' || backendStatus === LECTURE_STATUS.FAILED) {
      return 'status-badge status-inactive';
    }
    if (phase === 'timeout' || phase === 'processing' || phase === 'uploading') {
      return 'status-badge status-processing';
    }
    return 'status-badge';
  }, [phase, backendStatus]);

  return (
    <div>
      <h1 className="page-title">Add Lecture</h1>
      <p className="page-subtitle">
        Upload a video lecture for <strong>Subject → Topic</strong>. The file is sent
        directly to Cloudflare Stream — not through the SSBFY API. Published status
        comes from Cloudflare processing, not from a finished browser upload.
      </p>

      {metaError ? <div className="alert alert-error">{metaError}</div> : null}

      <form className="card form" onSubmit={handleSubmit}>
        {errorMsg ? <div className="alert alert-error">{errorMsg}</div> : null}
        {phase === 'published' ? (
          <div className="alert alert-success">Lecture is published and ready.</div>
        ) : null}
        {phase === 'timeout' ? (
          <div className="alert alert-warning">
            Processing is taking longer than expected. Open{' '}
            <Link to="/manage-lectures">Manage Lectures</Link> later. Do not upload
            this file again.
          </div>
        ) : null}

        <div className="form-row">
          <label className="label" htmlFor="lecture-title">
            Title *
          </label>
          <input
            id="lecture-title"
            type="text"
            className="input"
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="e.g. Agricultural Policy — Lecture 1"
            disabled={disableFields}
            minLength={LECTURE_TITLE_MIN}
            maxLength={LECTURE_TITLE_MAX}
          />
        </div>

        <div className="form-row">
          <label className="label" htmlFor="lecture-description">
            Description
          </label>
          <textarea
            id="lecture-description"
            className="input"
            rows={4}
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Optional summary for admins"
            disabled={disableFields}
            maxLength={LECTURE_DESCRIPTION_MAX}
          />
          <p className="helper">
            Optional. {form.description.length}/{LECTURE_DESCRIPTION_MAX}
          </p>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label className="label" htmlFor="lecture-subject">
              Subject *
            </label>
            <select
              id="lecture-subject"
              className="input"
              value={form.subjectId}
              onChange={(e) => handleSubjectChange(e.target.value)}
              disabled={disableFields || loadingSubjects}
            >
              <option value="">{subjectPlaceholder}</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="label" htmlFor="lecture-topic">
              Topic *
            </label>
            <select
              id="lecture-topic"
              className="input"
              value={form.topicId}
              onChange={(e) => updateField('topicId', e.target.value)}
              disabled={disableFields || !form.subjectId || loadingTopics}
            >
              <option value="">{topicPlaceholder}</option>
              {topics.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="label" htmlFor="lecture-access">
              Access
            </label>
            <select
              id="lecture-access"
              className="input"
              value={form.access}
              onChange={(e) => updateField('access', e.target.value)}
              disabled={disableFields}
            >
              <option value={LECTURE_ACCESS.FREE}>Free</option>
              <option value={LECTURE_ACCESS.PREMIUM}>Premium</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <label className="label" htmlFor="lecture-file">
            Video file *
          </label>
          <input
            id="lecture-file"
            ref={fileInputRef}
            type="file"
            className="input"
            accept="video/*,.mp4,.webm,.mov,.m4v,.mkv"
            onChange={handleFileChange}
            disabled={disableFields}
          />
          {file ? (
            <p className="helper">
              Selected: <strong>{file.name}</strong> ({formatSize(file.size)})
            </p>
          ) : (
            <p className="helper">Required. MP4, WebM, MOV, and similar video types.</p>
          )}
        </div>

        <div className="form-row">
          <span className="label">Status</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className={statusClass}>{statusLabel}</span>
            {backendStatus ? (
              <span className="helper">Backend: {backendStatus}</span>
            ) : null}
            {lectureId ? (
              <span className="helper">Lecture ID: {lectureId}</span>
            ) : null}
          </div>
          {phase === 'uploading' ? (
            <div className="progress-track" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          ) : null}
          {phase === 'uploading' ? <p className="helper">{pct}%</p> : null}
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetForm}
            disabled={busy}
          >
            Reset
          </button>
          {canRetrySameUrl ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleRetrySameUrl}
              disabled={busy || !file}
            >
              Retry Cloudflare upload
            </button>
          ) : null}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || loadingSubjects || Boolean(lectureId)}
          >
            {busy ? 'Working…' : 'Upload'}
          </button>
        </div>
        {lectureId ? (
          <p className="helper">
            Upload already provisioned. Use retry only for the same Cloudflare URL, or
            open <Link to="/manage-lectures">Manage Lectures</Link>.
          </p>
        ) : null}
      </form>
    </div>
  );
}
