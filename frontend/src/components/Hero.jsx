import { useRef, useState } from 'react';
import {
  Sparkles, Link as LinkIcon, Clipboard, ShieldCheck, Download,
  Play, ChevronDown, Video, Music,
} from 'lucide-react';

import { apiFetch } from '../api';

const PLATFORMS = [
  { name: 'Instagram', slug: 'instagram', color: 'E1306C' },
  { name: 'TikTok', slug: 'tiktok', color: '010101' },
  { name: 'Facebook', slug: 'facebook', color: '1877F2' },
  { name: 'YouTube', slug: 'youtube', color: 'FF0000' },
];

function platformIcon(slug, color, size = 20) {
  return (
    <img
      src={`https://cdn.simpleicons.org/${slug}/${color}`}
      width={size}
      height={size}
      alt=""
    />
  );
}

function ResultCard({ platform, mode, data, quality, onQualityChange, refreshing, onError }) {
  const [downloading, setDownloading] = useState(false);
  const p = platform || PLATFORMS[0];

  const title = data?.title || 'Untitled video';
  const author = data?.author;
  const isAudio = mode === 'audio';

  // Build quality/resolution label from real data where possible
  const qualityLabel = isAudio
    ? (quality === 'hi' ? '320kbps' : '128kbps')
    : (quality === 'hd' ? 'Up to 1080p' : 'Up to 480p');

  const sizeLabel = data?.filesize
    ? `${(data.filesize / (1024 * 1024)).toFixed(1)} MB`
    : null;

  const ext = isAudio ? 'MP3' : 'MP4';
  const meta = [author, qualityLabel, sizeLabel, ext]
    .filter(Boolean)
    .join(' · ');

  const handleDownload = async () => {
    if (downloading || refreshing) return;
    setDownloading(true);
    onError('');
    try {
      const res = await apiFetch(isAudio ? '/download-audio' : '/download-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: data.original_url, format: mode, quality }),
      });
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${(data.title || 'download').replace(/[<>:"/\\|?*]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      onError(err.message || 'Download failed. Try again.');
    } finally {
      setDownloading(false);
    }
  };

  const isBusy = downloading || refreshing;
  const buttonLabel = downloading
    ? (isAudio ? 'Preparing MP3…' : 'Downloading…')
    : 'Download';

  return (
    <div className="rs-result">
      <div className="rs-result__thumb">
        <span className="rs-result__badge">
          {platformIcon(p.slug, p.color, 13)} {p.name.split(' ')[0]}
        </span>
        <div className="rs-result__play"><Play size={20} /></div>
        <span className="rs-result__dur">{data?.duration || 'Unknown'}</span>
      </div>
      <div className="rs-result__body">
        <h4 className="rs-result__title">{title}</h4>
        <p className="rs-result__meta">{meta}</p>
        <div className="rs-result__actions">
          <label className="rs-select">
            <select
              value={quality}
              onChange={(e) => onQualityChange(e.target.value)}
              aria-label="Quality"
              disabled={isBusy}
            >
              {isAudio ? (
                <>
                  <option value="hi">Hi · 320kbps</option>
                  <option value="lo">Lo · 128kbps</option>
                </>
              ) : (
                <>
                  <option value="hd">HD / Up to 1080p</option>
                  <option value="sd">SD / Up to 480p</option>
                </>
              )}
            </select>
            <ChevronDown size={16} />
          </label>
          <button className="rs-btn rs-btn--green" onClick={handleDownload} disabled={isBusy}>
            {isBusy ? (
              <><span className="rs-spin" /> {buttonLabel}</>
            ) : (
              <><Download size={18} /> Download</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState('video');
  const [quality, setQuality] = useState('hd');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const inputRef = useRef(null);

  const onPaste = async () => {
    try {
      const text = await window.reelSaveDesktop.readClipboard();
      if (text) setUrl(text);
    } catch {
      // clipboard read blocked — leave it
    }
    if (status === 'done') setStatus('idle');
    if (inputRef.current) inputRef.current.focus();
  };

  const fetchDownload = async (fetchMode, fetchQuality, isRefresh = false) => {
    setError('');
    if (!isRefresh) {
      setStatus('loading');
    } else {
      setRefreshing(true);
    }
    try {
      const res = await apiFetch('/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), format: fetchMode, quality: fetchQuality }),
      });
      const data = await res.json();
      // Store the original page URL so the audio branch can use it
      setResult({ ...data, original_url: url.trim() });
      setStatus('done');
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
      setStatus('error');
    } finally {
      setRefreshing(false);
    }
  };

  const onDownload = () => {
    if (status === 'loading' || refreshing) return;
    if (!url.trim()) {
      setError('Paste a video link to get started.');
      return;
    }
    fetchDownload(mode, quality);
  };

  const handleQualityChange = (newQuality) => {
    setQuality(newQuality);
    if (result !== null) {
      fetchDownload(mode, newQuality, true);
    }
  };

  const handleModeChange = (newMode) => {
    const newQuality = newMode === 'video' ? 'hd' : 'hi';
    setMode(newMode);
    setQuality(newQuality);
    setError('');
    if (result !== null) {
      fetchDownload(newMode, newQuality, true);
    }
  };

  return (
    <header className="rs-hero" id="top">
      <div className="rs-hero__bg" />
      <div className="rs-hero__blob rs-hero__blob--1" />
      <div className="rs-hero__blob rs-hero__blob--2" />
      <div className="rs-hero__blob rs-hero__blob--3" />

      <div className="rs-wrap rs-hero__inner">
        <span className="rs-hero__eyebrow">
          <Sparkles size={16} /> Personal edition / Runs on your PC
        </span>
        <h1>
          Your videos. Your audio.<br />
          <span className="rs-gradient-text">Saved locally.</span>
        </h1>
        <p className="rs-hero__sub">
          Paste a YouTube, Instagram, or Facebook link. Choose MP4 video or MP3 audio,
          and save it to your PC.
        </p>

        <div className="rs-mode" role="tablist" aria-label="Download format">
          <button
            role="tab"
            aria-selected={mode === 'video'}
            className={'rs-mode__opt' + (mode === 'video' ? ' is-active' : '')}
            disabled={status === 'loading' || refreshing}
            onClick={() => handleModeChange('video')}
          >
            <Video size={18} /> Video
          </button>
          <button
            role="tab"
            aria-selected={mode === 'audio'}
            className={'rs-mode__opt' + (mode === 'audio' ? ' is-active' : '')}
            disabled={status === 'loading' || refreshing}
            onClick={() => handleModeChange('audio')}
          >
            <Music size={18} /> Audio
          </button>
        </div>

        <div className="rs-input-card rs-glass">
          <div className="rs-input-row">
            <div className="rs-input">
              <LinkIcon size={20} />
              <input
                ref={inputRef}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (status === 'done' || status === 'error') setStatus('idle');
                  if (error) setError('');
                }}
                placeholder="🔗 Paste link here…"
                aria-label="Video URL"
                onKeyDown={(e) => { if (e.key === 'Enter') onDownload(); }}
              />
              <button className="rs-input__paste" onClick={onPaste}>
                <Clipboard size={15} /> Paste
              </button>
            </div>
            <button
              className="rs-btn rs-btn--grad"
              onClick={onDownload}
              disabled={status === 'loading' || refreshing}
            >
              {status === 'loading' ? (
                <><span className="rs-spin" /> Grabbing your {mode}…</>
              ) : (
                <><Download size={19} /> Download Now</>
              )}
            </button>
          </div>
          <p className="rs-input__hint">
            {error ? (
              <span style={{ color: 'var(--rs-danger)' }}>{error}</span>
            ) : (
              <>
                <ShieldCheck size={16} style={{ color: 'var(--rs-success)', verticalAlign: '-3px' }} />{' '}
                Keep ReelSave running while your file downloads.
              </>
            )}
          </p>
        </div>

        <div className="rs-platforms" id="sites">
          {PLATFORMS.map((p) => (
            <span className="rs-pill" key={p.name}>
              {platformIcon(p.slug, p.color)} {p.name}
            </span>
          ))}
        </div>

        {status === 'done' && (
          <ResultCard
            platform={PLATFORMS.find((p) => p.name === result?.platform)}
            mode={mode}
            data={result}
            quality={quality}
            onQualityChange={handleQualityChange}
            refreshing={refreshing}
            onError={setError}
          />
        )}
      </div>
    </header>
  );
}
