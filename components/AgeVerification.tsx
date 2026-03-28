'use client';
import { useState } from 'react';

interface Props {
  onVerified: () => void;
}

export default function AgeVerification({ onVerified }: Props) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = () => {
    setLoading(true);
    localStorage.setItem('age_verified', '1');
    setTimeout(onVerified, 300);
  };

  const handleDeny = () => {
    window.location.href = 'https://google.com';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm">
      <div className="max-w-md w-full mx-4 bg-dark-800 border border-primary-700/50 rounded-2xl p-8 text-center shadow-2xl">
        <div className="text-5xl mb-4">18+</div>
        <h1 className="text-2xl font-bold text-white mb-2">Adults Only</h1>
        <p className="text-gray-400 mb-2 text-sm">
          This website contains adult content intended only for individuals who are 18 years of age
          or older.
        </p>
        <p className="text-gray-500 mb-8 text-xs">
          By entering, you confirm that you are at least 18 years old and agree to our Terms of
          Service and Privacy Policy. This site complies with 18 U.S.C. § 2257.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleDeny}
            className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-400 hover:bg-dark-700 transition-colors font-medium"
          >
            I am under 18
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold transition-all disabled:opacity-60"
          >
            {loading ? 'Entering...' : 'I am 18+ — Enter'}
          </button>
        </div>
        <p className="text-gray-600 text-xs mt-4">
          Leaving this site? Click "I am under 18" to exit safely.
        </p>
      </div>
    </div>
  );
}
