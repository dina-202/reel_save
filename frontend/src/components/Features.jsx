import { Gift, Sparkles, BadgeCheck, UserX, Zap, MonitorSmartphone } from 'lucide-react';

const FEATURES = [
  { Icon: Gift,              title: 'Personal Use', body: 'Your own downloader, running locally on your computer.',  c: 'var(--rs-purple)', bg: 'var(--rs-purple-100)' },
  { Icon: Sparkles,          title: 'No Watermark', body: "Clean video, every time — none of our branding baked in.",     c: 'var(--rs-pink)',   bg: '#FCE7F3' },
  { Icon: BadgeCheck,        title: 'HD Quality',   body: 'Save up to 1080p when available, or choose a smaller SD file.',     c: 'var(--rs-coral)',  bg: 'var(--rs-coral-100)' },
  { Icon: UserX,             title: 'No Login',     body: 'ReelSave needs no account. Some source videos may require a login.',          c: 'var(--rs-success)',bg: 'var(--rs-success-100)' },
  { Icon: Zap,               title: 'MP3 Audio',body: 'Keep just the audio at your choice of 128 or 320 kbps.',       c: 'var(--rs-warning)',bg: '#FEF3C7' },
  { Icon: MonitorSmartphone, title: 'Save to Your PC', body: 'Choose a folder and save your videos and audio straight to your PC.', c: 'var(--rs-purple)', bg: 'var(--rs-purple-100)' },
];

export default function Features() {
  return (
    <section className="rs-section rs-section--alt" id="features">
      <div className="rs-wrap">
        <div className="rs-section__head">
          <span className="rs-eyebrow">Why ReelSave</span>
          <h2>Everything you need. Nothing you don't.</h2>
          <p>Your familiar workspace for saving videos and audio.</p>
        </div>
        <div className="rs-features">
          {FEATURES.map((f) => (
            <div className="rs-feature" key={f.title}>
              <div className="rs-feature__ic" style={{ background: f.bg, color: f.c }}>
                <f.Icon size={26} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
