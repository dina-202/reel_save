import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Link as LinkIcon, Clipboard, ShieldCheck, Download,
  Video, Music, FolderOpen, CheckCircle2, AlertCircle, ListVideo, Trash2,
} from 'lucide-react';

const PLATFORMS = [
  { name: 'Instagram', slug: 'instagram', color: 'E1306C' },
  { name: 'TikTok', slug: 'tiktok', color: '010101' },
  { name: 'Facebook', slug: 'facebook', color: '1877F2' },
  { name: 'YouTube', slug: 'youtube', color: 'FF0000' },
  { name: 'Reddit', slug: 'reddit', color: 'FF4500' },
];

function platformIcon(slug, color, size = 20) {
  return <img src={`https://cdn.simpleicons.org/${slug}/${color}`} width={size} height={size} alt="" />;
}

function sourceName(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Invalid link'; }
}

function validLinks(text) {
  return text.split(/\r?\n/).map(link => link.trim()).filter(Boolean).filter(link => {
    try { return ['http:', 'https:'].includes(new URL(link).protocol); } catch { return false; }
  });
}

function messageOf(error, fallback) {
  return (error?.message || fallback).replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
}

export default function Hero({ onReport }) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('video');
  const [quality, setQuality] = useState('hd');
  const [jobs, setJobs] = useState([]);
  const [message, setMessage] = useState('');
  const [folder, setFolder] = useState('');
  const [folderDraft, setFolderDraft] = useState('');
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState('');
  const active = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => {
    window.reelSaveDesktop.downloadLocation().then(({ folder: saved }) => {
      setFolder(saved); setFolderDraft(saved);
    }).catch(() => setFolderError('Could not load the saved download location.'));
  }, []);

  useEffect(() => {
    if (active.current) return;
    const next = jobs.find(job => job.status === 'queued');
    if (!next) return;
    active.current = true;
    setJobs(current => current.map(job => job.id === next.id ? { ...job, status: 'downloading', error: '' } : job));
    (async () => {
      try {
        const saved = await window.reelSaveDesktop.downloadMedia({ url: next.url, format: next.mode, quality: next.quality });
        active.current = false;
        setJobs(current => current.map(job => job.id === next.id ? { ...job, status: 'saved', ...saved } : job));
      } catch (error) {
        active.current = false;
        setJobs(current => current.map(job => job.id === next.id
          ? { ...job, status: 'error', error: messageOf(error, 'Download failed.') } : job));
      }
    })();
  }, [jobs]);

  function enqueue(text) {
    const nonempty = text.split(/\r?\n/).map(link => link.trim()).filter(Boolean);
    const links = validLinks(text).slice(0, 50);
    if (!links.length) {
      setMessage('Paste a valid video link. For bulk downloads, put one link on each line.');
      return;
    }
    const now = Date.now();
    setJobs(current => [...current, ...links.map((url, index) => ({
      id: `${now}-${index}-${Math.random().toString(36).slice(2)}`, url, mode, quality, status: 'queued',
    }))]);
    const skipped = nonempty.length - links.length;
    setMessage(`${links.length} ${links.length === 1 ? 'download' : 'downloads'} added${skipped > 0 ? `; ${skipped} invalid or over the 50-link limit` : ''}.`);
  }

  function startManual() {
    enqueue(input);
    if (validLinks(input).length) setInput('');
  }

  function autoPaste(text) {
    setInput('');
    enqueue(text);
    inputRef.current?.focus();
  }

  async function pasteButton() {
    try {
      const text = await window.reelSaveDesktop.readClipboard();
      if (text) autoPaste(text);
      else setMessage('The clipboard is empty.');
    } catch { setMessage('ReelSave could not read the clipboard.'); }
  }

  function pasteEvent(event) {
    const text = event.clipboardData.getData('text');
    if (!text) return;
    event.preventDefault();
    autoPaste(text);
  }

  async function saveFolder(value = folderDraft) {
    setFolderBusy(true); setFolderError('');
    try {
      const result = await window.reelSaveDesktop.saveDownloadLocation(value);
      setFolder(result.folder); setFolderDraft(result.folder);
      setMessage('Download location saved.');
    } catch (error) { setFolderError(messageOf(error, 'Could not save that folder.')); }
    finally { setFolderBusy(false); }
  }

  async function browseFolder() {
    setFolderBusy(true); setFolderError('');
    try {
      const result = await window.reelSaveDesktop.browseDownloadLocation();
      if (!result.canceled) { setFolder(result.folder); setFolderDraft(result.folder); setMessage('Download location saved.'); }
    } catch (error) { setFolderError(messageOf(error, 'Could not choose that folder.')); }
    finally { setFolderBusy(false); }
  }

  const busy = jobs.some(job => ['queued', 'downloading'].includes(job.status));
  const completed = jobs.filter(job => job.status === 'saved').length;
  const failed = jobs.filter(job => job.status === 'error').length;

  return (
    <header className="rs-hero" id="top">
      <div className="rs-hero__bg" />
      <div className="rs-hero__blob rs-hero__blob--1" />
      <div className="rs-hero__blob rs-hero__blob--2" />
      <div className="rs-hero__blob rs-hero__blob--3" />

      <div className="rs-wrap rs-hero__inner">
        <span className="rs-hero__eyebrow"><Sparkles size={16} /> Personal edition / Runs on your PC</span>
        <h1>Your videos. Your audio.<br /><span className="rs-gradient-text">Saved locally.</span></h1>
        <p className="rs-hero__sub">Paste one or many YouTube, Instagram, Facebook, TikTok, or Reddit links and save them directly to your chosen folder.</p>

        <div className="rs-mode" role="group" aria-label="Download settings">
          <button className={'rs-mode__opt' + (mode === 'video' ? ' is-active' : '')} onClick={() => { setMode('video'); setQuality('hd'); }}>
            <Video size={18} /> Video
          </button>
          <button className={'rs-mode__opt' + (mode === 'audio' ? ' is-active' : '')} onClick={() => { setMode('audio'); setQuality('hi'); }}>
            <Music size={18} /> Audio
          </button>
          <select className="rs-mode__quality" value={quality} onChange={event => setQuality(event.target.value)} aria-label="Download quality">
            {mode === 'video' ? <><option value="hd">Prefer 1080p</option><option value="sd">Prefer 480p</option></>
              : <><option value="hi">320 kbps</option><option value="lo">128 kbps</option></>}
          </select>
        </div>

        <div className="rs-input-card rs-glass">
          <div className="rs-input-row">
            <div className="rs-input rs-input--multi">
              <LinkIcon size={20} />
              <textarea ref={inputRef} value={input} rows={2} onChange={event => setInput(event.target.value)} onPaste={pasteEvent}
                placeholder="Paste link(s) — one per line" aria-label="Video links"
                onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !input.includes('\n')) { event.preventDefault(); startManual(); } }} />
              <button className="rs-input__paste" onClick={pasteButton}><Clipboard size={15} /> Paste</button>
            </div>
            <button className="rs-btn rs-btn--grad" onClick={startManual}><Download size={19} /> Download</button>
          </div>
          <p className="rs-input__hint">
            <ShieldCheck size={16} style={{ color: 'var(--rs-success)', verticalAlign: '-3px' }} />{' '}
            Pasting starts automatically. Manually edited links wait for the Download button.
          </p>

          <div className="rs-location">
            <label htmlFor="download-folder"><FolderOpen size={17} /> Download location</label>
            <div className="rs-location__row">
              <input id="download-folder" value={folderDraft} disabled={folderBusy || busy} onChange={event => setFolderDraft(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') saveFolder(); }} placeholder="C:\\Users\\Name\\Downloads" />
              <button className="rs-btn rs-btn--purple" disabled={folderBusy || busy || folderDraft === folder} onClick={() => saveFolder()}>Save path</button>
              <button className="rs-btn rs-btn--soft" disabled={folderBusy || busy} onClick={browseFolder}>Browse</button>
              <button className="rs-updater__details" disabled={!folder} onClick={() => window.reelSaveDesktop.openDownloadLocation()
                .catch(() => setFolderError('Windows could not open the download folder.'))}>Open folder</button>
            </div>
            {folderError && <p className="rs-location__error" role="alert">{folderError}</p>}
          </div>
          {message && <p className="rs-queue__message" role="status">{message}</p>}
          <button className="rs-updater__details rs-report__trigger" onClick={onReport}>Report a problem</button>
        </div>

        <div className="rs-platforms" id="sites">
          {PLATFORMS.map(platform => <span className="rs-pill" key={platform.name}>{platformIcon(platform.slug, platform.color)} {platform.name}</span>)}
        </div>

        {jobs.length > 0 && <section className="rs-queue" aria-live="polite">
          <div className="rs-queue__head">
            <div><ListVideo size={20} /><strong>Download queue</strong><span>{completed} saved{failed ? ` · ${failed} failed` : ''}{busy ? ' · working' : ''}</span></div>
            <button className="rs-updater__details" onClick={() => setJobs(current => current.filter(job => !['saved', 'error'].includes(job.status)))}>
              <Trash2 size={14} /> Clear finished
            </button>
          </div>
          <div className="rs-queue__list">
            {jobs.map((job, index) => <article className={`rs-queue__item is-${job.status}`} key={job.id}>
              <span className="rs-queue__number">{index + 1}</span>
              <div className="rs-queue__info">
                <strong>{job.filename || sourceName(job.url)}</strong>
                <small>{job.mode === 'audio' ? 'MP3' : 'MP4'} · {job.status === 'queued' ? 'Waiting' : job.status === 'downloading' ? 'Downloading and processing…' : job.status === 'saved' ? `Saved to ${job.folder}` : job.error}</small>
              </div>
              {job.status === 'downloading' ? <span className="rs-spin rs-spin--purple" /> : job.status === 'saved'
                ? <CheckCircle2 className="rs-queue__ok" size={20} /> : job.status === 'error' ? <AlertCircle className="rs-queue__bad" size={20} /> : null}
            </article>)}
          </div>
        </section>}
      </div>
    </header>
  );
}
