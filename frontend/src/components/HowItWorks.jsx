import { Link2, ClipboardPaste, Download } from 'lucide-react';

const STEPS = [
  { Icon: Link2, title: 'Copy Link', body: "Tap Share on any reel and copy its link — YouTube, Instagram, Facebook, or TikTok." },
  { Icon: ClipboardPaste, title: 'Paste URL', body: "Drop the link into ReelSave's bar above. We detect the platform automatically." },
  { Icon: Download, title: 'Download', body: 'Choose MP4 video or MP3 audio, pick a quality, then save the file to your PC.' },
];

export default function HowItWorks() {
  return (
    <section className="rs-section" id="how">
      <div className="rs-wrap">
        <div className="rs-section__head">
          <span className="rs-eyebrow">How it Works</span>
          <h2>Three steps to save a favorite</h2>
          <p>Open ReelSave, paste a link, and keep your favorites on your PC.</p>
        </div>
        <div className="rs-steps">
          {STEPS.map((s, i) => (
            <div className="rs-step" key={s.title}>
              <span className="rs-step__n">{i + 1}</span>
              <div className="rs-step__num"><s.Icon size={26} /></div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
