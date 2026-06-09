import { useState, useRef } from 'react';
import { Music, Film } from 'lucide-react';

export function MediaPlayer() {
  const [url, setUrl] = useState('');
  const [_playing, setPlaying] = useState(false);
  const [_currentTime, setCurrentTime] = useState(0);
  const [_duration, setDuration] = useState(0);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [mediaType, setMediaType] = useState<'video' | 'audio'>('video');

  const handleLoad = () => {
    if (!url) return;
    const ext = url.split('.').pop()?.toLowerCase() || '';
    const isAudio = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext);
    setMediaType(isAudio ? 'audio' : 'video');
  };

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          {mediaType === 'video' ? <Film className="w-5 h-5 text-indigo-400" /> : <Music className="w-5 h-5 text-pink-400" />}
          <h2 className="text-lg font-semibold text-white">Media Player</h2>
        </div>

        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoad()}
            placeholder="Paste media URL or local file path..."
            className="flex-1 h-9 px-3 rounded-lg bg-zinc-900/50 border border-white/[0.06] text-[13px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
          />
          <button onClick={handleLoad} className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-medium hover:bg-indigo-500 transition-colors">
            Load
          </button>
        </div>

        {url && (
          <div className="rounded-xl overflow-hidden bg-black mb-4">
            {mediaType === 'video' ? (
              <video
                ref={mediaRef as React.RefObject<HTMLVideoElement>}
                src={url}
                className="w-full max-h-[300px]"
                onTimeUpdate={() => setCurrentTime(mediaRef.current?.currentTime || 0)}
                onDurationChange={() => setDuration(mediaRef.current?.duration || 0)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                controls
              />
            ) : (
              <div className="p-8 text-center">
                <Music className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                <audio
                  ref={mediaRef as React.RefObject<HTMLAudioElement>}
                  src={url}
                  onTimeUpdate={() => setCurrentTime(mediaRef.current?.currentTime || 0)}
                  onDurationChange={() => setDuration(mediaRef.current?.duration || 0)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  controls
                  className="w-full"
                />
              </div>
            )}
          </div>
        )}

        {!url && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <Film className="w-16 h-16 mb-4" />
            <p className="text-sm">Enter a URL or drop a file to start playing</p>
          </div>
        )}
      </div>
    </div>
  );
}
