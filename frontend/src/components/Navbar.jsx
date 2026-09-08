import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import Updater from './Updater';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={'rs-nav' + (scrolled ? ' rs-nav--scrolled' : '')}>
      <div className="rs-wrap rs-nav__inner">
        <a className="rs-nav__logo" href="#top" aria-label="ReelSave home">
          <img src="/assets/logo-full.svg" alt="ReelSave" />
        </a>
        <div className="rs-nav__links">
          <a className="rs-nav__link" href="#how">How it Works</a>
          <a className="rs-nav__link" href="#sites">Supported Sites</a>
          <a className="rs-nav__link" href="#features">Features</a>
        </div>
        <Updater />
        <a className="rs-nav__burger" href="#how" aria-label="How to use ReelSave">
          <Menu size={26} />
        </a>
      </div>
    </nav>
  );
}
