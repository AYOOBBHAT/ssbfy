/**
 * Browser → Cloudflare Stream upload. Never send the API token.
 * The one-time uploadURL comes from POST /api/video-lectures/admin/upload-url.
 *
 * Basic Direct Creator Upload URLs accept multipart `file`.
 * TUS URLs (path contains /tus) use the resumable protocol.
 */

export function isTusUploadUrl(uploadURL) {
  return /\/tus/i.test(String(uploadURL || ''));
}

function fail(message) {
  const err = new Error(message);
  err.code = 'CLOUDFLARE_UPLOAD_FAILED';
  return err;
}

/**
 * @param {{ uploadURL: string, file: File, onProgress?: (ratio: number) => void, signal?: AbortSignal }} opts
 */
export function uploadVideoToCloudflare({ uploadURL, file, onProgress, signal }) {
  if (!uploadURL || !file) {
    return Promise.reject(fail('Missing upload URL or file.'));
  }
  if (isTusUploadUrl(uploadURL)) {
    return tusUpload({ uploadURL, file, onProgress, signal });
  }
  return basicMultipartUpload({ uploadURL, file, onProgress, signal });
}

function basicMultipartUpload({ uploadURL, file, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadURL);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && typeof onProgress === 'function') {
        onProgress(ev.loaded / ev.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      reject(fail('Cloudflare rejected the video upload.'));
    };
    xhr.onerror = () => reject(fail('Network interruption while uploading to Cloudflare.'));
    xhr.onabort = () => reject(fail('Upload cancelled.'));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    const fd = new FormData();
    fd.append('file', file, file.name);
    xhr.send(fd);
  });
}

async function tusUpload({ uploadURL, file, onProgress, signal }) {
  let target = uploadURL;
  const looksLikeResource = /\/tus\/[^/?#]+/i.test(uploadURL);

  if (!looksLikeResource) {
    const createRes = await fetch(uploadURL, {
      method: 'POST',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(file.size),
      },
      signal,
    });
    if (![200, 201].includes(createRes.status)) {
      throw fail('Could not start resumable Cloudflare upload.');
    }
    const loc = createRes.headers.get('Location');
    if (loc) {
      target = new URL(loc, uploadURL).href;
    }
  }

  const chunkSize = 8 * 1024 * 1024;
  let offset = 0;
  while (offset < file.size) {
    if (signal?.aborted) throw fail('Upload cancelled.');
    const end = Math.min(offset + chunkSize, file.size);
    const chunk = file.slice(offset, end);
    offset = await patchTusChunk({
      target,
      chunk,
      offset,
      fileSize: file.size,
      onProgress,
      signal,
    });
  }
  onProgress?.(1);
}

function patchTusChunk({ target, chunk, offset, fileSize, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PATCH', target);
    xhr.setRequestHeader('Tus-Resumable', '1.0.0');
    xhr.setRequestHeader('Upload-Offset', String(offset));
    xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.min(1, (offset + ev.loaded) / fileSize));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const headerOffset = Number(xhr.getResponseHeader('Upload-Offset'));
        resolve(Number.isFinite(headerOffset) ? headerOffset : offset + chunk.size);
        return;
      }
      reject(fail('Resumable Cloudflare upload failed.'));
    };
    xhr.onerror = () => reject(fail('Network interruption while uploading to Cloudflare.'));
    xhr.onabort = () => reject(fail('Upload cancelled.'));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(chunk);
  });
}
