const COLS = [
  { h: 'ReelSave', links: ['My Downloader', 'How it Works', 'Features'] },
  { h: 'Platforms', links: ['Instagram Reels', 'TikTok Videos', 'YouTube Shorts', 'Facebook'] },
  { h: 'Formats', links: ['MP4 Video', 'MP3 Audio'] },
];

const SOCIAL = [
  { label: 'Instagram', slug: 'instagram' },
  { label: 'TikTok', slug: 'tiktok' },
  { label: 'YouTube', slug: 'youtube' },
  { label: 'X', slug: 'x' },
];

export default function Footer() {
  return (
    <footer className="rs-footer">
      <div className="rs-wrap">
        <div className="rs-footer__top">
          <div className="rs-footer__brand">
            <img src="/assets/logo-full-white.svg" alt="ReelSave" />
            <p>Your personal video and audio downloader. Run it on your PC and keep your favorites close.</p>
          </div>
          {COLS.map((col) => (
            <div className="rs-footer__col" key={col.h}>
              <h4>{col.h}</h4>
              {col.links.map((l) => (
                <a href={l === 'How it Works' ? '#how' : l === 'Features' ? '#features' : col.h === 'Platforms' ? '#sites' : '#top'} key={l}>{l}</a>
              ))}
            </div>
          ))}
        </div>
        <div className="rs-footer__bottom">
          <span>© 2026 ReelSave. Personal edition / Running on your PC.</span>
          <div className="rs-footer__social">
            {SOCIAL.map((s) => (
              <a href="#sites" key={s.label} aria-label={s.label}>
                <img src={`https://cdn.simpleicons.org/${s.slug}/ffffff`} alt="" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
