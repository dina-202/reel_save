import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Link as LinkIcon, Clipboard, ShieldCheck, Download,
  Video, Music, FolderOpen, CheckCircle2, AlertCircle, ListVideo, Trash2,
  StopCircle, Play, X, ArrowUp, ArrowDown, LoaderCircle,
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

function looksLikePlaylist(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('list') || parsed.searchParams.has('playlist')) return true;
    return /\/(playlist|playlists|sets|album|albums|collection|series)(\/|$)/i.test(parsed.pathname);
  } catch { return false; }
}

function durationLabel(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function messageOf(error, fallback) {
  return (error?.message || fallback).replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
}

export default function Hero({ onReport }) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('video');
  const [quality, setQuality] = useState('hd');
  const [jobs, setJobs] = useState([]);
  const [paused, setPaused] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [message, setMessage] = useState('');
  const [folder, setFolder] = useState('');
  const [folderDraft, setFolderDraft] = useState('');
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState('');
  const [playlistMode, setPlaylistMode] = useState(false);
  const [playlistBusy, setPlaylistBusy] = useState(false);
  const [playlistReview, setPlaylistReview] = useState(null);
  const active = useRef(false);
  const activeJobId = useRef(null);
  const stoppedJobs = useRef(new Set());
  const inputRef = useRef(null);

  useEffect(() => {
    window.reelSaveDesktop.downloadLocation().then(({ folder: saved }) => {
      setFolder(saved); setFolderDraft(saved);
    }).catch(() => setFolderError('Could not load the saved download location.'));
  }, []);

  useEffect(() => {
    if (paused || stopping || active.current) return;
    const next = jobs.find(job => job.status === 'queued');
    if (!next) return;
    active.current = true;
    activeJobId.current = next.id;
    setJobs(current => current.map(job => job.id === next.id ? { ...job, status: 'downloading', error: '' } : job));
    (async () => {
      try {
        const saved = await window.reelSaveDesktop.downloadMedia({
          url: next.url, format: next.mode, quality: next.quality, playlistIndex: next.playlistIndex,
        });
        setJobs(current => current.map(job => job.id === next.id ? { ...job, status: 'saved', ...saved } : job));
      } catch (error) {
        const wasStopped = stoppedJobs.current.delete(next.id);
        setJobs(current => current.map(job => job.id === next.id ? {
          ...job, status: wasStopped ? 'paused' : 'error',
          error: wasStopped ? '' : messageOf(error, 'Download failed.'),
        } : job));
      } finally {
        active.current = false;
        activeJobId.current = null;
        setStopping(false);
      }
    })();
  }, [jobs, paused, stopping]);

  function addJobs(items) {
    const now = Date.now();
    setJobs(current => [...current, ...items.map((item, index) => ({
      id: `${now}-${index}-${Math.random().toString(36).slice(2)}`,
      url: item.url, title: item.title, playlistIndex: item.playlistIndex,
      mode, quality, status: paused ? 'paused' : 'queued',
    }))]);
  }

  function enqueue(text) {
    const nonempty = text.split(/\r?\n/).map(link => link.trim()).filter(Boolean);
    const links = validLinks(text).slice(0, 50);
    if (!links.length) {
      setMessage('Paste a valid video link. For bulk downloads, put one link on each line.');
      return false;
    }
    addJobs(links.map(url => ({ url })));
    const skipped = nonempty.length - links.length;
    setMessage(`${links.length} ${links.length === 1 ? 'download' : 'downloads'} added${skipped > 0 ? `; ${skipped} invalid or over the 50-link limit` : ''}.`);
    return true;
  }

  async function inspectPlaylist(url) {
    setPlaylistBusy(true);
    setMessage('Reading playlist items…');
    try {
      const result = await window.reelSaveDesktop.inspectPlaylist({ url });
      if (!result.is_playlist || !result.items?.length) {
        addJobs([{ url }]);
        setInput('');
        setMessage('No playlist was found, so the link was added as one download.');
        return;
      }
      setPlaylistReview({
        sourceUrl: url, title: result.title, total: result.total, truncated: result.truncated,
        items: result.items.map((item, position) => ({ ...item, key: `${item.index}-${position}`, selected: true })),
      });
      setMessage('Choose and arrange the playlist items before downloading.');
    } catch (error) {
      setMessage(messageOf(error, 'ReelSave could not read this playlist.'));
    } finally { setPlaylistBusy(false); }
  }

  function startManual() {
    const links = validLinks(input);
    if (playlistMode && links.length === 1) { inspectPlaylist(links[0]); return; }
    if (enqueue(input)) setInput('');
  }

  function autoPaste(text) {
    const links = validLinks(text);
    if (links.length === 1 && playlistMode) {
      setInput(text.trim());
      inspectPlaylist(links[0]);
    } else if (links.length === 1 && looksLikePlaylist(links[0])) {
      setInput(text.trim());
      setMessage('Playlist found. Turn on Playlist to choose its items, or click Download to save only the current item.');
    } else {
      setInput('');
      enqueue(text);
    }
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

  async function togglePlaylistMode() {
    const enabled = !playlistMode;
    setPlaylistMode(enabled);
    const links = validLinks(input);
    if (enabled && links.length === 1) await inspectPlaylist(links[0]);
  }

  function updateReviewItem(key, changes) {
    setPlaylistReview(current => ({ ...current, items: current.items.map(item => item.key === key ? { ...item, ...changes } : item) }));
  }

  function moveReviewItem(position, direction) {
    setPlaylistReview(current => {
      const target = position + direction;
      if (target < 0 || target >= current.items.length) return current;
      const items = [...current.items];
      [items[position], items[target]] = [items[target], items[position]];
      return { ...current, items };
    });
  }

  function addSelectedPlaylistItems() {
    const selected = playlistReview.items.filter(item => item.selected);
    if (!selected.length) { setMessage('Select at least one playlist item.'); return; }
    addJobs(selected.map(item => ({ url: playlistReview.sourceUrl, title: item.title, playlistIndex: item.index })));
    setInput('');
    setPlaylistReview(null);
    setMessage(`${selected.length} playlist ${selected.length === 1 ? 'item' : 'items'} added in your chosen order.`);
  }

  async function stopQueue(clear = false) {
    const current = jobs.find(job => job.id === activeJobId.current);
    setPaused(true);
    if (current) stoppedJobs.current.add(current.id);
    setStopping(Boolean(current));
    setJobs(existing => clear ? [] : existing.map(job => (
      job.id === activeJobId.current ? { ...job, status: 'stopping' }
        : job.status === 'queued' ? { ...job, status: 'paused' } : job
    )));
    try {
      if (current) await window.reelSaveDesktop.cancelDownload();
      setMessage(clear ? 'Queue cleared. Saved files were kept.' : 'Queue stopped. Resume when you are ready.');
      if (clear) setPaused(false);
    } catch (error) {
      setMessage(messageOf(error, 'ReelSave could not stop the active download.'));
      setStopping(false);
    }
    if (!current) setStopping(false);
  }

  function resumeQueue() {
    if (stopping) return;
    setJobs(current => current.map(job => job.status === 'paused' ? { ...job, status: 'queued' } : job));
    setPaused(false);
    setMessage('Queue resumed.');
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

  const working = jobs.some(job => ['queued', 'downloading', 'stopping'].includes(job.status));
  const hasPaused = jobs.some(job => job.status === 'paused');
  const completed = jobs.filter(job => job.status === 'saved').length;
  const failed = jobs.filter(job => job.status === 'error').length;
  const inputLinks = validLinks(input);
  const playlistDetected = !playlistMode && inputLinks.length === 1 && looksLikePlaylist(inputLinks[0]);
  const selectedCount = playlistReview?.items.filter(item => item.selected).length || 0;

  return (
    <header className="rs-hero" id="top">
      <div className="rs-hero__bg" />
      <div className="rs-hero__blob rs-hero__blob--1" />
      <div className="rs-hero__blob rs-hero__blob--2" />
      <div className="rs-hero__blob rs-hero__blob--3" />

      <div className="rs-wrap rs-hero__inner">
        <span className="rs-hero__eyebrow"><Sparkles size={16} /> Personal edition / Runs on your PC</span>
        <h1>Your videos. Your audio.<br /><span className="rs-gradient-text">Saved locally.</span></h1>
        <p className="rs-hero__sub">Paste one or many supported links and save them directly to your chosen folder.</p>

        <div className="rs-mode" role="group" aria-label="Download settings">
          <button className={'rs-mode__opt' + (mode === 'video' ? ' is-active' : '')} onClick={() => { setMode('video'); setQuality('hd'); }}>
            <Video size={18} /> Video
          </button>
          <button className={'rs-mode__opt' + (mode === 'audio' ? ' is-active' : '')} onClick={() => { setMode('audio'); setQuality('hi'); }}>
            <Music size={18} /> Audio
          </button>
          <button className={`rs-mode__opt rs-playlist-toggle${playlistMode ? ' is-active' : ''}${playlistDetected ? ' is-detected' : ''}`}
            onClick={togglePlaylistMode} disabled={playlistBusy} aria-pressed={playlistMode}>
            {playlistBusy ? <LoaderCircle className="rs-updater__spin" size={18} /> : <ListVideo size={18} />} Playlist
            {playlistDetected && <span className="rs-playlist-toggle__dot" aria-label="Playlist found" />}
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
            <button className="rs-btn rs-btn--grad" onClick={startManual} disabled={playlistBusy}><Download size={19} /> Download</button>
          </div>
          <p className="rs-input__hint">
            <ShieldCheck size={16} style={{ color: 'var(--rs-success)', verticalAlign: '-3px' }} />{' '}
            Pasting starts automatically. Playlist links pause so you can review their items first.
          </p>

          <div className="rs-location">
            <label htmlFor="download-folder"><FolderOpen size={17} /> Download location</label>
            <div className="rs-location__row">
              <input id="download-folder" value={folderDraft} disabled={folderBusy || working} onChange={event => setFolderDraft(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') saveFolder(); }} placeholder="C:\\Users\\Name\\Downloads" />
              <button className="rs-btn rs-btn--purple" disabled={folderBusy || working || folderDraft === folder} onClick={() => saveFolder()}>Save path</button>
              <button className="rs-btn rs-btn--soft" disabled={folderBusy || working} onClick={browseFolder}>Browse</button>
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
            <div><ListVideo size={20} /><strong>Download queue</strong><span>{completed} saved{failed ? ` · ${failed} failed` : ''}{working ? ' · working' : hasPaused ? ' · paused' : ''}</span></div>
            <div className="rs-queue__actions">
              {working && <button className="rs-queue__control is-stop" onClick={() => stopQueue(false)} disabled={stopping}>
                <StopCircle size={15} /> {stopping ? 'Stopping…' : 'Stop'}
              </button>}
              {hasPaused && <button className="rs-queue__control is-resume" onClick={resumeQueue} disabled={stopping}>
                <Play size={15} /> Resume
              </button>}
              <button className="rs-queue__control" onClick={() => stopQueue(true)} disabled={stopping}>
                <Trash2 size={14} /> Clear queue
              </button>
            </div>
          </div>
          <div className="rs-queue__list">
            {jobs.map((job, index) => <article className={`rs-queue__item is-${job.status}`} key={job.id}>
              <span className="rs-queue__number">{index + 1}</span>
              <div className="rs-queue__info">
                <strong>{job.filename || job.title || sourceName(job.url)}</strong>
                <small>{job.mode === 'audio' ? 'MP3' : 'MP4'} · {job.status === 'queued' ? 'Waiting' : job.status === 'downloading' ? 'Downloading and processing…'
                  : job.status === 'stopping' ? 'Stopping safely…' : job.status === 'paused' ? 'Paused' : job.status === 'saved' ? `Saved to ${job.folder}` : job.error}</small>
              </div>
              {['downloading', 'stopping'].includes(job.status) ? <span className="rs-spin rs-spin--purple" /> : job.status === 'saved'
                ? <CheckCircle2 className="rs-queue__ok" size={20} /> : job.status === 'error' ? <AlertCircle className="rs-queue__bad" size={20} /> : null}
              {!['downloading', 'stopping'].includes(job.status) && <button className="rs-queue__remove" aria-label="Remove from queue"
                onClick={() => setJobs(current => current.filter(item => item.id !== job.id))}><X size={15} /></button>}
            </article>)}
          </div>
        </section>}
      </div>

      {playlistReview && <div className="rs-playlist-review" role="dialog" aria-modal="true" aria-labelledby="playlist-title">
        <div className="rs-playlist-review__card">
          <div className="rs-playlist-review__head">
            <div><span>Playlist review</span><h2 id="playlist-title">{playlistReview.title}</h2>
              <p>{selectedCount} of {playlistReview.items.length} selected{playlistReview.truncated ? ` · showing the first ${playlistReview.items.length} of ${playlistReview.total}` : ''}</p></div>
            <button onClick={() => setPlaylistReview(null)} aria-label="Close playlist review"><X size={20} /></button>
          </div>
          <div className="rs-playlist-review__tools">
            <button onClick={() => setPlaylistReview(current => ({ ...current, items: current.items.map(item => ({ ...item, selected: true })) }))}>Select all</button>
            <button onClick={() => setPlaylistReview(current => ({ ...current, items: current.items.map(item => ({ ...item, selected: false })) }))}>Select none</button>
            <span>Use the arrows to set download order.</span>
          </div>
          <div className="rs-playlist-review__list">
            {playlistReview.items.map((item, position) => <article key={item.key} className={item.selected ? 'is-selected' : ''}>
              <input type="checkbox" checked={item.selected} onChange={event => updateReviewItem(item.key, { selected: event.target.checked })}
                aria-label={`Select ${item.title}`} />
              <span className="rs-playlist-review__number">{position + 1}</span>
              <div><strong>{item.title}</strong><small>Original item {item.index}{item.duration ? ` · ${durationLabel(item.duration)}` : ''}</small></div>
              <button disabled={position === 0} onClick={() => moveReviewItem(position, -1)} aria-label={`Move ${item.title} up`}><ArrowUp size={15} /></button>
              <button disabled={position === playlistReview.items.length - 1} onClick={() => moveReviewItem(position, 1)} aria-label={`Move ${item.title} down`}><ArrowDown size={15} /></button>
              <button onClick={() => setPlaylistReview(current => ({ ...current, items: current.items.filter(entry => entry.key !== item.key) }))}
                aria-label={`Remove ${item.title}`}><Trash2 size={15} /></button>
            </article>)}
          </div>
          <div className="rs-playlist-review__actions">
            <button className="rs-btn rs-btn--soft" onClick={() => setPlaylistReview(null)}>Cancel</button>
            <button className="rs-btn rs-btn--grad" onClick={addSelectedPlaylistItems} disabled={!selectedCount}>
              <Download size={18} /> Download {selectedCount} selected
            </button>
          </div>
        </div>
      </div>}
    </header>
  );
}
