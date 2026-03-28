'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

async function firebaseLogin(idToken: string, role?: string, username?: string) {
  const res = await fetch('/api/auth/firebase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, role, username }),
  });
  return res.json();
}

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'customer' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const redirect = (role: string) => {
    if (role === 'performer') router.push('/performer/dashboard');
    else router.push('/dashboard');
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (!auth) { setError('Configuration error. Please contact support.'); setLoading(false); return; }
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName: form.username });
      const idToken = await cred.user.getIdToken();
      const data = await firebaseLogin(idToken, form.role, form.username);
      if (data.error) { setError(data.error); return; }
      redirect(data.role);
    } catch (err: any) {
      const msg: Record<string, string> = {
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/weak-password': 'Password must be at least 6 characters.',
      };
      setError(msg[err.code] || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true); setError('');
    try {
      if (!auth) { setError('Configuration error. Please contact support.'); setLoading(false); return; }
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      const data = await firebaseLogin(idToken, form.role);
      if (data.error) { setError(data.error); return; }
      redirect(data.role);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Google sign-in failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-white">
            Call<span className="text-primary-400">Connect</span>
          </Link>
          <p className="text-cream-300 mt-2">Create your account</p>
        </div>

        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-8">
          <h1 className="text-xl font-bold text-white mb-6">Join VelvetRoom</h1>

          {/* Role selector */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {(['customer', 'performer'] as const).map(role => (
              <button
                key={role}
                type="button"
                onClick={() => set('role', role)}
                className={`py-3 rounded-xl border font-medium capitalize transition-all ${
                  form.role === role
                    ? 'border-primary-500 bg-primary-600/10 text-white'
                    : 'border-dark-600 text-cream-400 hover:border-dark-500'
                }`}
              >
                {role === 'customer' ? '👤 Customer' : '⭐ Performer'}
              </button>
            ))}
          </div>
          <p className="text-cream-500 text-xs mb-5">
            {form.role === 'customer'
              ? 'Browse performers, buy tokens, and start private calls.'
              : 'Set your schedule, rate, and earn from calls.'}
          </p>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-cream-50 text-gray-800 py-3 rounded-xl font-semibold transition-all mb-4 disabled:opacity-60"
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.4 35.5 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.2 5.5l6.2 5.2C37 38.3 44 33 44 24c0-1.3-.1-2.6-.4-3.9z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-dark-600" />
            <span className="text-cream-400 text-xs">or</span>
            <div className="flex-1 h-px bg-dark-600" />
          </div>

          <form onSubmit={handleEmailRegister} className="space-y-4">
            <div>
              <label className="block text-cream-300 text-sm mb-1">Username</label>
              <input
                value={form.username}
                onChange={e => set('username', e.target.value)}
                required
                placeholder="cooluser123"
                className="w-full bg-dark-700 text-white px-4 py-3 rounded-xl border border-dark-500 focus:outline-none focus:border-primary-500 placeholder-cream-500"
              />
            </div>
            <div>
              <label className="block text-cream-300 text-sm mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-dark-700 text-white px-4 py-3 rounded-xl border border-dark-500 focus:outline-none focus:border-primary-500 placeholder-cream-500"
              />
            </div>
            <div>
              <label className="block text-cream-300 text-sm mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                required
                placeholder="Min 6 characters"
                className="w-full bg-dark-700 text-white px-4 py-3 rounded-xl border border-dark-500 focus:outline-none focus:border-primary-500 placeholder-cream-500"
              />
            </div>
            {error && (
              <p className="text-red-400 text-sm bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>
            )}
            <div className="bg-dark-700 rounded-xl p-3 text-xs text-cream-500">
              By registering, you confirm you are 18+ and agree to our Terms of Service.
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white py-3 rounded-xl font-bold transition-all"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-cream-400 text-sm mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-primary-400 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
