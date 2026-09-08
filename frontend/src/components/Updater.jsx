import { useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../api';
import useAppUpdates from './useAppUpdates';

export default function Updater() {
  const appUpdate = useAppUpdates();
  const appState = appUpdate.state;
  const appPending = ['available', 'ready'].includes(appState?.status);
  const appBusy = ['downloading', 'verifying', 'installing'].includes(appState?.status);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const inFlight = useRef(false);

  async function check(refresh = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await apiFetch(`/updates${refresh ? '?refresh=true' : ''}`);
      setInfo(await res.json());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    check();
    const timer = setInterval(() => check(), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const updating = info?.status === 'updating';
  useEffect(() => {
    if (!updating) return;
    const timer = setInterval(() => check(), 2000);
    return () => clearInterval(timer);
  }, [updating]);

  async function update() {
    if (appPending) {
      setOpen(true);
      return appUpdate.action(appState.status === 'ready' ? 'installUpdate' : 'downloadUpdate');
    }
    if (busy || updating) return;
    if (!info?.available && info?.status !== 'failed') {
      setOpen(true);
      return check(true);
    }
    setOpen(true);
    setBusy(true);
    inFlight.current = true;
    setError('');
    try {
      const res = await apiFetch('/updates', {
        method: 'POST',
        headers: { 'X-ReelSave-Update-Token': info.token },
      });
      setInfo(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const problem = error || info?.error;
  const available = (info?.available || appPending) && !updating;
  const label = appBusy ? (appState.status === 'downloading' ? `App update ${appState.progress}%` : 'Verifying...')
    : appPending ? (appState.status === 'ready' ? 'Restart & update' : 'Update app')
    : updating ? 'Updating...' : busy ? 'Checking...' : problem ? 'Retry update'
    : available ? 'Update yt-dlp' : info ? 'Up to date' : 'Check updates';
  const Icon = updating || busy ? RefreshCw : available ? ArrowUpCircle : CheckCircle2;

  return (
    <div className="rs-updater">
      <button className={`rs-btn rs-btn--purple rs-updater__button${available ? ' is-available' : ''}`}
        onClick={update} disabled={busy || updating || appBusy} aria-label={label}
        title={available ? `yt-dlp ${info.latest} is available. Click to install.` : 'Check for yt-dlp updates'}>
        <Icon size={17} className={updating || busy ? 'rs-updater__spin' : ''} />
        {label}
      </button>
      <button className="rs-updater__details" onClick={() => setOpen(!open)}
        aria-expanded={open} aria-controls="update-details">Update details</button>
      {open && <div className="rs-updater__panel" id="update-details" role="status" aria-live="polite">
        {appState && <section className="rs-app-updates">
          <strong>ReelSave app</strong>
          <p>Installed: {appState.current}{appState.latest && ` / Latest: ${appState.latest}`}</p>
          <p>{appUpdate.error || (appState.status === 'error'
            ? appState.error || 'Could not check or install the app update. Please retry.'
            : appState.status === 'ready' ? 'Signature verified. Restart to install; your settings and saved videos stay in place.'
              : appState.status === 'available' ? 'A new app version is available on GitHub.'
                : appBusy ? `${appState.status === 'downloading' ? `Downloading ${appState.progress}%` : 'Verifying the signed installer...'} Keep ReelSave running.`
                  : appState.status === 'current' ? 'You have the latest app version.' : 'Checking for app updates...')}</p>
          {appPending && <button className="rs-btn rs-btn--purple" disabled={updating || busy}
            onClick={() => appUpdate.action(appState.status === 'ready' ? 'installUpdate' : 'downloadUpdate')}>
            {appState.status === 'ready' ? 'Restart & install' : 'Download app update'}
          </button>}
          {!appBusy && !appPending && <button className="rs-updater__details" onClick={() => appUpdate.action('checkUpdate')}>Check app updates</button>}
        </section>}
        <strong>Downloader updates</strong>
        {info && <p>Installed: {info.current}{info.latest && <> / Latest: {info.latest}</>}</p>}
        <p>{updating ? 'Installing yt-dlp and its YouTube support files. Keep ReelSave running.'
          : problem || (info?.status === 'updated' ? 'Update verified. Your next download uses the new version.'
            : available ? 'A newer version is available. Click Update yt-dlp to install it.'
              : 'Checks automatically when you open ReelSave and every hour while it is open.')}</p>
        {info && !info.can_update && <p>Reopen the installed ReelSave app to enable downloader updates.</p>}
        {!updating && <button className="rs-updater__details" disabled={busy} onClick={() => check(true)}>Check again</button>}
      </div>}
    </div>
  );
}
