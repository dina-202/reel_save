// Electron connects the renderer to its private bundled engine.
export const API_URL = '/api';

export async function apiFetch(path, options) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, options);
  } catch {
    throw new Error('Cannot reach the ReelSave download engine. Close and reopen the app, then retry.');
  }
  if (!response.ok) {
    let message = `Download engine returned ${response.status}.`;
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail.map(item => item.msg).join('; ');
    } catch {
      if (response.status >= 500) message += ' Reopen ReelSave and try again.';
    }
    throw new Error(message);
  }
  return response;
}
