'use strict';

const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

function parseDevServerUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.port !== '5173' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_DEV_SERVER_URL must be http://127.0.0.1:5173 or http://localhost:5173');
  }
  return url.origin;
}

function isTrustedRendererUrl(value, { devServerUrl, indexFile }) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search) return false;
    if (devServerUrl) {
      return url.origin === devServerUrl && ['/', '/index.html'].includes(url.pathname);
    }
    url.hash = '';
    return url.href === pathToFileURL(indexFile).href;
  } catch {
    return false;
  }
}

function isAllowedRequest(value, { devServerUrl, indexFile }) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (['data:', 'blob:'].includes(url.protocol)) return true;
    if (devServerUrl) {
      const dev = new URL(devServerUrl);
      return ['http:', 'ws:'].includes(url.protocol) && url.host === dev.host;
    }
    if (url.protocol !== 'file:') return false;
    const relative = path.relative(path.dirname(indexFile), fileURLToPath(url));
    return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

module.exports = { parseDevServerUrl, isTrustedRendererUrl, isAllowedRequest };
