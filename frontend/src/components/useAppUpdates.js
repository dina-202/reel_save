import { useEffect, useState } from 'react';

export default function useAppUpdates() {
  const bridge = window.reelSaveDesktop;
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    const read = () => bridge.updateStatus().then(value => { if (active) setState(value); }).catch(err => { if (active) setError(err.message); });
    read();
    const timer = setInterval(read, 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function action(name) {
    setError('');
    try { setState(await bridge[name]()); }
    catch (err) { setError(err.message); }
  }
  return { state, error, action };
}
