import { useState, useRef, useEffect } from 'react';
import { Play, Music, Globe, Volume2, Radio } from 'lucide-react';

interface RadioStation {
  name: string;
  url: string;
  genre?: string;
  country?: string;
}

const DEFAULT_STATIONS: RadioStation[] = [
  { name: 'BBC Radio 1', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one', genre: 'Pop', country: 'UK' },
  { name: 'BBC Radio 4', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_fourfm', genre: 'Talk', country: 'UK' },
  { name: 'NPR News', url: 'https://npr-ice.streamguys1.com/live.mp3', genre: 'News', country: 'US' },
  { name: 'Classical WQXR', url: 'https://stream.wqxr.org/wqxr', genre: 'Classical', country: 'US' },
  { name: 'Jazz24', url: 'https://stream.jazz24.net/Jazz24-aac', genre: 'Jazz', country: 'US' },
  { name: 'KEXP', url: 'https://kexp.streamguys1.com/kexp160.aac', genre: 'Alternative', country: 'US' },
  { name: 'Triple J', url: 'https://live-radio01.mediahubaustralia.com/2TJW/aac/', genre: 'Alternative', country: 'AU' },
  { name: 'FIP Radio', url: 'https://icecast.radiofrance.fr/fip-midfi.mp3', genre: 'Eclectic', country: 'FR' },
];

export function RadioPlayer({ pageConfig: _pageConfig }: { pageConfig?: any }) {
  const [stations, _setStations] = useState<RadioStation[]>(DEFAULT_STATIONS);
  const [current, setCurrent] = useState<RadioStation | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.onended = () => setPlaying(false);
    audioRef.current.onerror = () => { setPlaying(false); setCurrent(null); };
    return () => { audioRef.current?.pause(); audioRef.current = null; };
  }, []);

  const toggle = (station: RadioStation) => {
    if (!audioRef.current) return;
    if (current?.url === station.url && playing) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    audioRef.current.src = station.url;
    audioRef.current.play().then(() => {
      setCurrent(station);
      setPlaying(true);
    }).catch(() => {});
  };

  const stop = () => {
    audioRef.current?.pause();
    setPlaying(false);
    setCurrent(null);
  };

  return (
    <div className="flex flex-col h-full">
      {current && playing && (
        <div className="px-6 py-3 border-b border-white/[0.04] bg-indigo-500/5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <Radio className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <p className="text-[13px] text-white font-medium">{current.name}</p>
                <p className="text-[11px] text-zinc-500">Now Playing</p>
              </div>
            </div>
            <button onClick={stop} className="px-3 py-1.5 rounded-lg text-[12px] text-zinc-400 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors">Stop</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center gap-2 mb-4">
          <Music className="w-4 h-4 text-zinc-400" />
          <h2 className="text-[13px] font-medium text-white">Radio Stations</h2>
          <span className="text-[11px] text-zinc-600">{stations.length} stations</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {stations.map((s) => (
            <button
              key={s.url}
              onClick={() => toggle(s)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                current?.url === s.url && playing
                  ? 'border-indigo-500/30 bg-indigo-500/10'
                  : 'border-white/[0.04] bg-zinc-900/30 hover:bg-zinc-900/50 hover:border-white/[0.08]'
              }`}
            >
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                current?.url === s.url && playing ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {current?.url === s.url && playing ? <Volume2 className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-zinc-200 truncate">{s.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {s.genre && <span className="text-[10px] text-zinc-600">{s.genre}</span>}
                  {s.country && (
                    <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                      <Globe className="w-2.5 h-2.5" /> {s.country}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
