'use client';
import { useRouter } from 'next/navigation';
import type { Performer } from '@/lib/types';

interface Props {
  performer: Performer;
}

export default function PerformerCard({ performer }: Props) {
  const router = useRouter();
  const initials = performer.display_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div
      className="bg-dark-700 border border-dark-600 rounded-2xl overflow-hidden flex flex-col hover:border-primary-600/50 transition-all cursor-pointer group"
      onClick={() => router.push(`/performer/${performer.id}`)}
    >
      {/* Big photo */}
      <div className="relative w-full overflow-hidden" style={{ paddingBottom: '125%' }}>
        {performer.photos?.[0] ? (
          <img
            src={performer.photos[0].url}
            alt={performer.display_name}
            className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-white font-bold text-4xl"
            style={{ backgroundColor: performer.avatar_color }}
          >
            {initials}
          </div>
        )}
        {/* Online badge */}
        <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${
          performer.is_online ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-black/40 text-gray-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${performer.is_online ? 'bg-green-400' : 'bg-gray-500'}`} />
          {performer.is_online ? 'Online' : 'Offline'}
        </div>
        {/* Rate badge */}
        <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-yellow-400 font-bold text-sm px-2.5 py-1 rounded-full">
          {performer.rate_per_minute} tkn/m
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <h3 className="text-white font-semibold text-base truncate">{performer.display_name}</h3>
          {performer.bio && (
            <p className="text-gray-400 text-xs mt-1 line-clamp-2">{performer.bio}</p>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); router.push(`/performer/${performer.id}`); }}
          className="w-full py-2.5 rounded-xl font-semibold text-sm bg-primary-600 hover:bg-primary-500 text-white transition-all mt-auto"
        >
          Book
        </button>
      </div>
    </div>
  );
}
