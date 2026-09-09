import { useEffect, useRef, useState } from 'react';
import { ExternalLink, ShieldCheck, X } from 'lucide-react';

export default function Diagnostics({ open, onClose }) {
  const dialog = useRef(null);
  const [info, setInfo] = useState(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    let active = true;
    dialog.current.showModal();
    setInfo(null);
    setMessage('');
    window.reelSaveDesktop.diagnosticReports().then(data => {
      if (active) { setInfo(data); setSelected(data.records[0]?.id || ''); }
    }).catch(() => { if (active) setMessage('Could not load diagnostics. Close and reopen ReelSave, then retry.'); });
    return () => { active = false; };
  }, [open]);

  const report = info?.records.find(item => item.id === selected);
  async function openReport() {
    setBusy(true);
    setMessage('');
    try {
      await window.reelSaveDesktop.openDiagnosticReport(selected);
      setMessage('Opened in your browser. Sign in to GitHub and submit the issue there; nothing has been submitted yet.');
    } catch { setMessage('Could not open the report. Please retry.'); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true);
    try {
      const data = await window.reelSaveDesktop.clearDiagnosticReports();
      setInfo(data);
      setSelected(data.records[0]?.id || '');
      setMessage(data.storageError ? 'Could not clear saved reports on disk. Please retry.' : 'Local diagnostics cleared. Published GitHub issues are unchanged.');
    } catch { setMessage('Could not clear diagnostics. Please retry.'); }
    finally { setBusy(false); }
  }

  return <dialog className="rs-report" ref={dialog} onClose={onClose} aria-labelledby="report-title">
    <div className="rs-report__heading">
      <h2 id="report-title">Report a problem</h2>
      <button className="rs-report__close" onClick={onClose} aria-label="Close report preview"><X size={22} /></button>
    </div>
    <p><ShieldCheck size={17} aria-hidden="true" /> Diagnostics stay on this PC until you choose to share them. Only the fields below are included.</p>
    {info && <>
      <label className="rs-report__label" htmlFor="report-choice">Choose a report</label>
      <select id="report-choice" value={selected} onChange={event => { setSelected(event.target.value); setMessage(''); }} disabled={busy}>
        {info.records.map(item => <option key={item.id} value={item.id}>{item.id === 'general' ? 'General problem / no specific error' : `${item.stage}: ${item.code}`}</option>)}
      </select>
      <pre className="rs-report__preview" aria-label="Exact diagnostic report">{report?.text}</pre>
      <p className="rs-report__notice">GitHub issues are public and show your GitHub username. Review the report before submitting, and avoid adding private links or screenshots.</p>
      {info.storageError && <p role="alert">Diagnostics are available for this session, but could not be saved on disk.</p>}
      <div className="rs-report__actions">
        <button className="rs-btn rs-btn--purple" onClick={openReport} disabled={busy || !report}><ExternalLink size={17} /> Open GitHub report</button>
        <button className="rs-updater__details" onClick={clear} disabled={busy || info.records.length < 2}>Clear local diagnostics</button>
      </div>
    </>}
    {!info && !message && <p>Loading diagnostics...</p>}
    {message && <p role="status">{message}</p>}
  </dialog>;
}
