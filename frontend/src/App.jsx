import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import Features from './components/Features.jsx';
import Footer from './components/Footer.jsx';
import { useState } from 'react';
import Diagnostics from './components/Diagnostics.jsx';

export default function App() {
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <>
      <Navbar />
      <Hero onReport={() => setReportOpen(true)} />
      <HowItWorks />
      <Features />
      <Footer />
      <Diagnostics open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  );
}
