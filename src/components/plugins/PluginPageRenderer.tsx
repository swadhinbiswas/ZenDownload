import { usePluginStore } from '../../stores/pluginStore';
import { RadioPlayer } from './RadioPlayer';
import { RssReader } from './RssReader';
import { CustomPage } from './CustomPage';
import { SpeedTestPlugin } from './SpeedTestPlugin';
import { MediaPlayer } from './MediaPlayer';
import { TorrentSearch } from './TorrentSearch';
import { LinkChecker } from './LinkChecker';
import { DownloadScheduler } from './DownloadScheduler';
import { CalculatorPlugin } from './CalculatorPlugin';
import { NotesPlugin } from './NotesPlugin';
import { PasswordGenPlugin } from './PasswordGenPlugin';
import { ColorPickerPlugin } from './ColorPickerPlugin';
import { TimerPlugin } from './TimerPlugin';
import { Puzzle } from 'lucide-react';

const COMPONENT_MAP: Record<string, React.FC<{ pageConfig?: any }>> = {
  radio: RadioPlayer,
  rss: RssReader,
  custom: CustomPage,
  speed_test: SpeedTestPlugin,
  media_player: MediaPlayer,
  torrent_search: TorrentSearch,
  link_checker: LinkChecker,
  download_scheduler: DownloadScheduler,
  calculator: CalculatorPlugin,
  notes: NotesPlugin,
  password_gen: PasswordGenPlugin,
  color_picker: ColorPickerPlugin,
  timer: TimerPlugin,
  link_panel: CustomPage,
  clipboard_monitor: CustomPage,
  m3u_viewer: CustomPage,
};

export function PluginPageRenderer() {
  const uiPlugins = usePluginStore(s => s.uiPlugins);
  const currentPluginId = usePluginStore(s => s.currentPluginId);

  const plugin = uiPlugins.find(p => p.id === currentPluginId);
  if (!plugin || !plugin.ui) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Puzzle className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 text-[13px]">Select a plugin from the sidebar</p>
        </div>
      </div>
    );
  }

  const Component = COMPONENT_MAP[plugin.ui.component_type];
  if (!Component) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-zinc-500 text-[13px]">Unknown component type: <span className="text-zinc-400 font-mono">{plugin.ui.component_type}</span></p>
          <p className="text-zinc-700 text-[11px] mt-1">Plugin "{plugin.name}" requested an unsupported UI type</p>
        </div>
      </div>
    );
  }

  return <Component pageConfig={plugin.ui.page_config} />;
}
