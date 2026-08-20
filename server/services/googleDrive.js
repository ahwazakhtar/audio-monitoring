'use strict';

const fs = require('fs');
const { google } = require('googleapis');
const { getAuth } = require('./googleAuth');

async function getDriveClient() {
  const auth = getAuth();
  const client = await auth.getClient();
  return google.drive({ version: 'v3', auth: client });
}

/**
 * Lists all audio files in the given Google Drive folder.
 * Returns an array of { fileId, filename, mimeType, size }.
 * Handles pagination to retrieve all files regardless of count.
 */
async function listAudioFiles(folderId) {
  const drive = await getDriveClient();

  const files = [];
  let pageToken = undefined;

  do {
    const params = {
      q: `'${folderId}' in parents and trashed = false and (mimeType contains 'audio/' or name contains '.m4a' or name contains '.mp3' or name contains '.wav' or name contains '.ogg')`,
      fields: 'nextPageToken, files(id, name, mimeType, size)',
      pageSize: 1000,
      orderBy: 'name',
    };
    if (pageToken) params.pageToken = pageToken;

    const resp = await drive.files.list(params);
    const batch = resp.data.files || [];
    for (const f of batch) {
      files.push({
        fileId: f.id,
        filename: f.name,
        mimeType: f.mimeType || 'audio/mp4',
        size: f.size || null,
      });
    }
    pageToken = resp.data.nextPageToken;
  } while (pageToken);

  return files;
}

/**
 * Streams a Drive file to an Express response object.
 * Supports the Range header for audio seeking in the browser.
 *
 * @param {string} fileId  - Drive file ID
 * @param {object} res     - Express response object
 * @param {string|null} rangeHeader - Value of the incoming Range header, e.g. "bytes=0-"
 */
async function streamFile(fileId, res, rangeHeader) {
  const drive = await getDriveClient();

  // First fetch file metadata to get mimeType and size
  const meta = await drive.files.get({
    fileId,
    fields: 'name, mimeType, size',
  });

  const filename = meta.data.name || 'audio';
  const mimeType = meta.data.mimeType || 'audio/mp4';
  const fileSize = meta.data.size ? parseInt(meta.data.size, 10) : null;

  // Build request options; pass Range header through to Drive if present
  const requestOptions = { responseType: 'stream' };
  const extraHeaders = {};
  if (rangeHeader) {
    extraHeaders['Range'] = rangeHeader;
  }

  let driveResponse;
  try {
    driveResponse = await drive.files.get(
      { fileId, alt: 'media' },
      { ...requestOptions, headers: extraHeaders }
    );
  } catch (err) {
    // Drive may return 416 (Range Not Satisfiable) or other errors
    const status = err.response ? err.response.status : 500;
    if (!res.headersSent) {
      res.status(status).json({ error: `Drive stream error: ${err.message}` });
    }
    return;
  }

  const driveStatus = driveResponse.status;
  const driveHeaders = driveResponse.headers;

  // Relay relevant headers from Drive
  const contentType = driveHeaders['content-type'] || mimeType;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Accept-Ranges', 'bytes');

  if (driveHeaders['content-length']) {
    res.setHeader('Content-Length', driveHeaders['content-length']);
  }
  if (driveHeaders['content-range']) {
    res.setHeader('Content-Range', driveHeaders['content-range']);
  }

  // Use 206 Partial Content if Drive returned it, otherwise 200
  res.status(driveStatus === 206 ? 206 : 200);

  // Pipe the Drive stream to the client
  driveResponse.data.pipe(res);

  driveResponse.data.on('error', (err) => {
    console.error('Drive stream error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream error' });
    } else {
      res.end();
    }
  });
}

/**
 * Downloads a Drive file's content to a local path. Writes to a temp file
 * first and renames into place atomically, so a concurrent reader (e.g. the
 * CSV parser) never sees a partially-written file mid-download.
 *
 * @param {string} fileId   - Drive file ID
 * @param {string} destPath - Local filesystem path to write the file to
 */
async function downloadFileToPath(fileId, destPath) {
  const drive = await getDriveClient();
  const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

  const tmpPath = `${destPath}.tmp`;
  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(tmpPath);
    response.data.on('error', reject);
    dest.on('error', reject);
    dest.on('finish', resolve);
    response.data.pipe(dest);
  });

  await fs.promises.rename(tmpPath, destPath);
}

module.exports = { listAudioFiles, streamFile, downloadFileToPath };
