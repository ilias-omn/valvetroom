'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AgeVerification from '@/components/AgeVerification';
import PerformerCard from '@/components/PerformerCard';
import type { Performer } from '@/lib/types';

export default function LandingPage() {
  const [ageVerified, setAgeVerified] = useState(false);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [user, setUser] = useState<{ id: string; role: string; username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const verified = localStorage.getItem('age_verified') === '1';
    setAgeVerified(verified);
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setUser(d); });
    fetch('/api/performers')
      .then(r => r.json())
      .then(d => { setPerformers(d); setLoading(false); });
  }, []);

  if (!ageVerified) {
    return <AgeVerification onVerified={() => setAgeVerified(true)} />;
  }

  const onlinePerformers = performers.filter(p => p.is_online);
  const offlinePerformers = performers.filter(p => !p.is_online);

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="inline-block bg-primary-600/10 border border-primary-600/30 text-primary-400 text-sm px-4 py-1 rounded-full mb-6">
          18+ Adult Platform
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 leading-tight">
          Connect with<br />
          <span className="text-primary-400">Live Performers</span>
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto mb-8">
          Private video calls, audio sessions, and live chat with verified adult performers.
          Pay only for what you use with our token system.
        </p>
        {!user && (
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => router.push('/register')}
              className="bg-primary-600 hover:bg-primary-500 text-white px-8 py-3 rounded-xl font-bold text-lg transition-all"
            >
              Get Started Free
            </button>
            <button
              onClick={() => router.push('/login')}
              className="border border-dark-600 text-gray-300 hover:bg-dark-700 px-8 py-3 rounded-xl font-bold text-lg transition-all"
            >
              Login
            </button>
          </div>
        )}
      </section>

      {/* Performers */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="text-center py-20 text-gray-500">Loading performers...</div>
        ) : (
          <>
            {onlinePerformers.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <span className="w-2 h-2 bg-green-400 rounded-full" />
                  <h2 className="text-2xl font-bold text-white">Online Now</h2>
                  <span className="bg-green-400/10 text-green-400 text-sm px-3 py-1 rounded-full">
                    {onlinePerformers.length} available
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-12">
                  {onlinePerformers.map(p => (
                    <PerformerCard key={p.id} performer={p}  />
                  ))}
                </div>
              </>
            )}

            {offlinePerformers.length > 0 && (
              <>
                <h2 className="text-xl font-bold text-gray-500 mb-6">All Performers</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 opacity-60">
                  {offlinePerformers.map(p => (
                    <PerformerCard key={p.id} performer={p}  />
                  ))}
                </div>
              </>
            )}

            {performers.length === 0 && (
              <div className="text-center py-20 text-gray-600">No performers yet.</div>
            )}
          </>
        )}
      </section>

      {/* How it works */}
      <section className="bg-dark-800 border-y border-dark-600 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: '👤', title: 'Create Account', desc: 'Sign up free as a customer or performer.' },
              { icon: '🪙', title: 'Buy Tokens', desc: 'Purchase token bundles. Use them for calls.' },
              { icon: '📞', title: 'Start Calling', desc: 'Choose a performer and start your live session.' },
            ].map(step => (
              <div key={step.title} className="text-center">
                <div className="text-4xl mb-4">{step.icon}</div>
                <h3 className="text-white font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="text-center py-8 text-gray-700 text-sm">
        18+ Adult Content Platform. All performers are verified adults. © 2024
        <br />
        <span className="text-xs">Compliant with 18 U.S.C. § 2257</span>
      </footer>

    </div>
  );
}
