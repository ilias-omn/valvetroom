'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import TokenPurchase from './TokenPurchase';

interface User { username: string; role: string; }

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUser(data); });
  }, []);

  useEffect(() => {
    if (user && user.role === 'customer') {
      fetch('/api/tokens').then(r => r.json()).then(d => setTokens(d.balance));
    }
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const logout = async () => {
    await fetch('/api/auth/me', { method: 'DELETE' });
    router.push('/');
    router.refresh();
  };

  const dashboardHref = user?.role === 'performer'
    ? '/performer/dashboard'
    : user?.role === 'admin'
    ? '/admin'
    : '/profile';

  return (
    <>
      <nav className="bg-dark-800/80 backdrop-blur-sm border-b border-dark-600 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">
            Velvet<span className="text-primary-400">Room</span>
          </Link>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                {/* Token balance */}
                {tokens !== null && (
                  <button
                    onClick={() => setShowBuy(true)}
                    className="flex items-center gap-1.5 text-yellow-400 font-semibold text-sm bg-dark-700 px-3 py-1 rounded-full border border-yellow-500/30 hover:border-yellow-400/60 transition-colors"
                  >
                    {tokens} tokens <span className="text-yellow-500 font-bold">+</span>
                  </button>
                )}

                {/* Profile dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(o => !o)}
                    className="flex items-center gap-2 text-gray-300 hover:text-white text-sm transition-colors"
                  >
                    <span>{user.username}</span>
                    <span className="text-gray-600 text-xs">{dropdownOpen ? '▲' : '▼'}</span>
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-44 bg-dark-800 border border-dark-600 rounded-xl shadow-xl overflow-hidden z-50">
                      <Link
                        href={dashboardHref}
                        onClick={() => setDropdownOpen(false)}
                        className="block px-4 py-3 text-sm text-gray-300 hover:bg-dark-700 hover:text-white transition-colors"
                      >
                        My Profile
                      </Link>
                      <button
                        onClick={() => { setDropdownOpen(false); logout(); }}
                        className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-dark-700 transition-colors border-t border-dark-600"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link href="/login" className="text-gray-300 hover:text-white text-sm transition-colors">
                  Login
                </Link>
                <Link
                  href="/register"
                  className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {showBuy && <TokenPurchase onClose={() => setShowBuy(false)} />}
    </>
  );
}
