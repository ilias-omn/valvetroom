'use client';
import { useEffect, useState } from 'react';

interface Props {
  onSuccess?: (newBalance: number) => void;
  onClose?: () => void;
}

const PACKAGES = [
  { id: 'starter', tokens: 100, price: 10, label: 'Starter', popular: false },
  { id: 'popular', tokens: 250, price: 20, label: 'Popular', popular: true },
  { id: 'premium', tokens: 600, price: 40, label: 'Premium', popular: false },
];

interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban: string;
  swift: string;
  instructions: string;
}

type Step = 'select' | 'transfer' | 'done';

function generateRef() {
  return 'TOK-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

export default function TokenPurchase({ onSuccess, onClose }: Props) {
  const [selected, setSelected] = useState('popular');
  const [step, setStep] = useState<Step>('select');
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [reference] = useState(generateRef);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addedTokens, setAddedTokens] = useState(0);

  const pkg = PACKAGES.find(p => p.id === selected)!;

  useEffect(() => {
    fetch('/api/tokens/purchase').then(r => r.json()).then(setBankDetails);
  }, []);

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/tokens/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: selected, reference }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setAddedTokens(data.added);
      setStep('done');
      onSuccess?.(data.balance);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Buy Tokens</h2>
          {onClose && (
            <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">&times;</button>
          )}
        </div>

        {/* Step 1: Select package */}
        {step === 'select' && (
          <>
            <div className="grid gap-3 mb-6">
              {PACKAGES.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className={`relative p-4 rounded-xl border text-left transition-all ${
                    selected === p.id
                      ? 'border-primary-500 bg-primary-600/10'
                      : 'border-dark-600 bg-dark-700 hover:border-dark-500'
                  }`}
                >
                  {p.popular && (
                    <span className="absolute top-2 right-2 text-xs bg-yellow-500 text-dark-900 font-bold px-2 py-0.5 rounded-full">
                      POPULAR
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-semibold">{p.label}</div>
                      <div className="text-primary-400 text-lg font-bold">{p.tokens} tokens</div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-bold text-xl">${p.price}</div>
                      <div className="text-gray-500 text-xs">${(p.price / p.tokens * 100).toFixed(1)}¢ each</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep('transfer')}
              className="w-full py-3 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl transition-all"
            >
              Continue — Pay ${pkg.price}
            </button>
          </>
        )}

        {/* Step 2: Bank transfer instructions */}
        {step === 'transfer' && (
          <>
            <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-sm text-blue-300">
              Send exactly <span className="font-bold text-white">${pkg.price}</span> to the bank account below.
              Use your reference code as the payment description.
            </div>

            {bankDetails && (bankDetails.bankName || bankDetails.iban || bankDetails.accountNumber) ? (
              <div className="bg-dark-700 rounded-xl p-4 mb-4 space-y-2 text-sm">
                {bankDetails.bankName && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Bank</span>
                    <span className="text-white font-medium">{bankDetails.bankName}</span>
                  </div>
                )}
                {bankDetails.accountName && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Account Name</span>
                    <span className="text-white font-medium">{bankDetails.accountName}</span>
                  </div>
                )}
                {bankDetails.accountNumber && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Account No.</span>
                    <span className="text-white font-medium font-mono">{bankDetails.accountNumber}</span>
                  </div>
                )}
                {bankDetails.iban && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">IBAN</span>
                    <span className="text-white font-medium font-mono">{bankDetails.iban}</span>
                  </div>
                )}
                {bankDetails.swift && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">SWIFT / BIC</span>
                    <span className="text-white font-medium font-mono">{bankDetails.swift}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-dark-700 rounded-xl p-4 mb-4 text-sm text-gray-400 text-center">
                Bank details not configured yet. Contact support.
              </div>
            )}

            <div className="bg-dark-900 border border-dark-600 rounded-xl p-4 mb-4 text-center">
              <div className="text-gray-500 text-xs mb-1">Your payment reference</div>
              <div className="text-white font-mono text-2xl font-bold tracking-widest">{reference}</div>
              <div className="text-gray-600 text-xs mt-1">Include this in your transfer description</div>
            </div>

            {bankDetails?.instructions && (
              <p className="text-gray-500 text-xs mb-4">{bankDetails.instructions}</p>
            )}

            {error && <p className="text-red-400 text-sm mb-4 bg-red-400/10 p-3 rounded-lg">{error}</p>}

            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white font-bold rounded-xl transition-all mb-2"
            >
              {loading ? 'Processing...' : "I've sent the payment — Add my tokens"}
            </button>
            <button
              onClick={() => setStep('select')}
              className="w-full py-2 text-gray-500 hover:text-white text-sm transition-colors"
            >
              Back
            </button>
          </>
        )}

        {/* Step 3: Done */}
        {step === 'done' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-white font-bold text-xl mb-2">Tokens Added!</h3>
            <p className="text-green-400 mb-1">+{addedTokens} tokens added to your balance</p>
            <p className="text-gray-500 text-sm mb-6">
              Please complete your bank transfer with reference{' '}
              <span className="text-white font-mono font-bold">{reference}</span> if you haven't yet.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl transition-all"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
