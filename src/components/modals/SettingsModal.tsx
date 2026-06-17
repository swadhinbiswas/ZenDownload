import { useState, useEffect } from 'react';
import { useSettingsStore, SettingsState } from '@/stores/settingsStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Network, HardDrive, Shield, Save, DownloadCloud, FileType, Bell, Languages, RefreshCw, Check, Loader2, Palette, Calendar, Database, MonitorSmartphone, FolderOpen } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from '@/i18n/useTranslation';
import { availableLanguages } from '@/i18n';
import { WatchFolderSection, BandwidthProfileSection, VirusTotalSection } from '@/components/settings/AdvancedSections';
import { BackupManager } from '@/components/settings/BackupManager';
import { ThemeSection } from '@/components/settings/ThemeSection';
import { BrowserExtensionSection } from '@/components/settings/BrowserExtensionSection';
import { SystemSection } from '@/components/settings/SystemSection';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [localSettings, setLocalSettings] = useState<Partial<SettingsState>>({});
  const [updateState, setUpdateState] = useState<{ checking: boolean; installing: boolean; available: boolean; version?: string; notes?: string; error?: string }>({
    checking: false,
    installing: false,
    available: false,
  });
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(useSettingsStore.getState());
    }
  }, [isOpen]);

  const updateLocal = (key: keyof SettingsState, val: any) => {
    setLocalSettings(prev => ({ ...prev, [key]: val }));
  };

  const handleApply = async () => {
    await useSettingsStore.getState().saveSettings(localSettings);
    onClose();
  };

  const tabs = [
    { id: 'general', name: t.settings.general, icon: <HardDrive className="w-5 h-5 mr-3" /> },
    { id: 'connection', name: t.settings.connection, icon: <Network className="w-5 h-5 mr-3" /> },
    { id: 'downloads', name: t.settings.downloads, icon: <DownloadCloud className="w-5 h-5 mr-3" /> },
    { id: 'filetypes', name: t.settings.fileTypes, icon: <FileType className="w-5 h-5 mr-3" /> },
    { id: 'cookies', name: t.settings.cookies, icon: <Shield className="w-5 h-5 mr-3" /> },
    { id: 'proxy', name: t.settings.proxy, icon: <Globe className="w-5 h-5 mr-3" /> },
    { id: 'notifications', name: t.settings.notifications, icon: <Bell className="w-5 h-5 mr-3" /> },
    { id: 'language', name: t.settings.language, icon: <Languages className="w-5 h-5 mr-3" /> },
    { id: 'updates', name: t.settings.updates, icon: <RefreshCw className="w-5 h-5 mr-3" /> },
    { id: 'automation', name: 'Automation', icon: <Calendar className="w-5 h-5 mr-3" /> },
    { id: 'security', name: 'Security', icon: <Shield className="w-5 h-5 mr-3" /> },
    { id: 'theme', name: 'Theme', icon: <Palette className="w-5 h-5 mr-3" /> },
    { id: 'backup', name: 'Backup', icon: <Database className="w-5 h-5 mr-3" /> },
    { id: 'browser', name: 'Browser', icon: <MonitorSmartphone className="w-5 h-5 mr-3" /> },
    { id: 'advanced', name: t.settings.advanced, icon: <Shield className="w-5 h-5 mr-3" /> },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className="sm:max-w-[90vw] md:max-w-[900px] p-0 overflow-hidden bg-zinc-950 border-white/[0.08] shadow-2xl">
        <div className="flex h-[650px]">
          {/* Sidebar */}
          <div className="w-52 bg-zinc-900/30 border-r border-white/[0.06] p-5 flex flex-col relative z-10">
            <DialogHeader className="mb-6 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight text-white">Settings</DialogTitle>
            </DialogHeader>
            <nav className="flex-1 space-y-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 ${
                    activeTab === tab.id
                      ? 'bg-indigo-500/[0.08] text-indigo-400'
                      : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
                  }`}
                >
                  {tab.icon}
                  {tab.name}
                </button>
              ))}
            </nav>
            <div className="text-[10px] text-zinc-700 font-mono mt-auto pt-4 text-center tracking-wider">
              v0.1.0
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col bg-zinc-950 relative">
            <div className="flex justify-end p-3 absolute top-0 right-0 z-20">
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06]" onClick={onClose}>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
              </Button>
            </div>

            <div className="flex-1 p-8 overflow-y-auto w-full relative z-10">
              
              {/* === GENERAL TAB === */}
              {activeTab === 'general' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">System Integration</h3>
                    <p className="text-sm text-zinc-400 mb-8 mt-1">Manage how ZenDownload binds to your Operating System.</p>
                    
                    <div className="space-y-4 max-w-2xl">
                      <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors shadow-sm">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-blue-500/50 h-4 w-4 transition-all" 
                               checked={localSettings.launchOnStartup || false} 
                               onChange={e => updateLocal('launchOnStartup', e.target.checked)} />
                        <div className="space-y-1.5">
                          <span className="block font-semibold text-zinc-100 text-base">Launch ZenDownload on system startup</span>
                          <span className="block text-sm text-zinc-500">Starts automatically minimized perfectly catching URLs from reboot.</span>
                        </div>
                      </Label>

                      <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors shadow-sm">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-blue-500/50 h-4 w-4 transition-all" 
                               checked={localSettings.osClipboard || false}
                               onChange={e => updateLocal('osClipboard', e.target.checked)} />
                        <div className="space-y-1.5">
                          <span className="block font-semibold text-zinc-100 text-base">Enable OS Clipboard Interception</span>
                          <span className="block text-sm text-zinc-500">Automatically watches clipboard hashes generating Add Modal popups securely.</span>
                        </div>
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              {/* === CONNECTION TAB === */}
              {activeTab === 'connection' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Network Limits & Threads</h3>
                    <p className="text-sm text-zinc-400 mb-8 mt-1">Configure bandwidth caps and asynchronous tunneling limits.</p>
                    
                    <div className="space-y-8 max-w-xl">
                      <div className="grid gap-3">
                        <Label htmlFor="connProfile" className="text-zinc-300 font-semibold">Connection Type / Profile</Label>
                        <Select value={localSettings.connectionProfile} onValueChange={v => updateLocal('connectionProfile', v)}>
                          <SelectTrigger className="w-full bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl">
                            <SelectValue placeholder="Select network bound" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                            <SelectItem value="lowspeed">Low Speed (Dial-Up / Mobile)</SelectItem>
                            <SelectItem value="mediumspeed">Medium Speed (ADSL / 4G)</SelectItem>
                            <SelectItem value="highspeed">High Speed (Fiber / LAN / 5G)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="border border-white/5 my-6"></div>
                      
                      <div className="grid grid-cols-2 gap-8">
                        <div className="grid gap-3">
                          <Label htmlFor="maxConnections" className="text-zinc-300 font-semibold">Max Default Connections</Label>
                          <Select value={localSettings.maxConnections} onValueChange={v => updateLocal('maxConnections', v)}>
                            <SelectTrigger className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                              <SelectItem value="1">1</SelectItem>
                              <SelectItem value="2">2</SelectItem>
                              <SelectItem value="4">4</SelectItem>
                              <SelectItem value="8">8</SelectItem>
                              <SelectItem value="16">16</SelectItem>
                              <SelectItem value="32">32</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="grid gap-3">
                          <Label htmlFor="speedLimit" className="text-zinc-300 font-semibold">Speed Limit (KB/s)</Label>
                          <Input id="speedLimit" type="number" value={localSettings.speedLimit} onChange={e => updateLocal('speedLimit', e.target.value)} placeholder="0 = Unlimited" className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-blue-500/50" />
                          <p className="text-xs text-zinc-500">Zero natively allows infinite buffer pulling.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* === DOWNLOADS TAB === */}
              {activeTab === 'downloads' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Directories & Routing</h3>
                    <p className="text-sm text-zinc-400 mb-8 mt-1">Modify exactly where categorized files securely route physically onto disk.</p>
                    
                    <div className="space-y-5 max-w-3xl">
                      {[ 
                        { label: 'General', key: 'pathGeneral' },
                        { label: 'Compressed', key: 'pathCompressed' },
                        { label: 'Documents', key: 'pathDocuments' },
                        { label: 'Music', key: 'pathMusic' },
                        { label: 'Programs', key: 'pathPrograms' },
                        { label: 'Video', key: 'pathVideo' },
                      ].map(cat => (
                        <div key={cat.label} className="grid grid-cols-4 items-center gap-4 border-b border-white/5 pb-5 last:border-0">
                          <Label className="text-right font-semibold text-zinc-300">{cat.label}</Label>
                          <div className="col-span-3 flex space-x-3">
                            <Input value={localSettings[cat.key as keyof SettingsState] as string || ''} onChange={e => updateLocal(cat.key as keyof SettingsState, e.target.value)} className="flex-1 bg-zinc-900/50 border-white/10 text-zinc-300 font-mono text-xs h-10 rounded-xl focus-visible:ring-blue-500/50" />
                            <Button type="button" variant="secondary" onClick={async () => {
                                const folder = await open({ directory: true, multiple: false, title: `Select ${cat.label} download folder` });
                                if (folder) updateLocal(cat.key as keyof SettingsState, folder);
                              }} className="px-6 h-10 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/5 transition-all flex items-center gap-2"><FolderOpen className="h-4 w-4" />Browse</Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <h3 className="text-xl font-bold text-white tracking-tight mt-8">Post-Processing Intelligence</h3>
                    <p className="text-sm text-zinc-400 mb-6 mt-1">Configure automated file management after completion.</p>

                    <div className="space-y-4 max-w-2xl mb-8">
                      <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors shadow-sm">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-blue-500/50 h-4 w-4 transition-all"
                               checked={localSettings.smartSortingEnabled ?? true}
                               onChange={e => updateLocal('smartSortingEnabled', e.target.checked)} />
                        <div className="space-y-1.5 flex-1">
                          <span className="block font-semibold text-zinc-100 text-base">Smart Sorting</span>
                          <span className="block text-sm text-zinc-500">Automatically move completed files to their respective category folder.</span>
                        </div>
                      </Label>

                      <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors shadow-sm">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-blue-500/50 h-4 w-4 transition-all"
                               checked={localSettings.avScanEnabled ?? true}
                               onChange={e => updateLocal('avScanEnabled', e.target.checked)} />
                        <div className="space-y-1.5 flex-1">
                          <span className="block font-semibold text-zinc-100 text-base">Automatic Antivirus Scan</span>
                          <span className="block text-sm text-zinc-500">Trigger Windows Defender CLI scan immediately after a file finishes.</span>
                        </div>
                      </Label>
                    </div>

                    <div className="border border-white/5 my-8 max-w-3xl"></div>

                    <h3 className="text-xl font-bold text-white tracking-tight mt-8">Cloud Mirroring (Auto-Upload)</h3>
                    <p className="text-sm text-zinc-400 mb-6 mt-1">Automatically upload completed files to your cloud storage.</p>
                    
                    <div className="space-y-4 max-w-2xl">
                      <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors shadow-sm">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-blue-500/50 h-4 w-4 transition-all" 
                               checked={localSettings.cloudMirroringEnabled || false}
                               onChange={e => updateLocal('cloudMirroringEnabled', e.target.checked)} />
                        <div className="space-y-1.5 flex-1">
                          <span className="block font-semibold text-zinc-100 text-base">Enable Cloud Mirroring</span>
                          <span className="block text-sm text-zinc-500">Once a download finishes, securely upload it to the selected cloud provider.</span>
                          
                           {localSettings.cloudMirroringEnabled && (
                               <div className="pt-4 grid gap-3 max-w-xs" onClick={e => e.preventDefault()}>
                                 <Label className="text-zinc-300 font-semibold">Cloud Provider</Label>
                                 <Select value={localSettings.cloudMirroringProvider || 'google_drive'} onValueChange={v => updateLocal('cloudMirroringProvider', v)}>
                                  <SelectTrigger className="bg-zinc-950 border-white/10 text-white h-11 rounded-xl">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                    <SelectItem value="google_drive">Google Drive</SelectItem>
                                    <SelectItem value="onedrive">Microsoft OneDrive</SelectItem>
                                  </SelectContent>
                                 </Select>
                               </div>
                           )}
                        </div>
                      </Label>

                      {localSettings.cloudMirroringEnabled && (
                        <div className="grid gap-3">
                          <Label className="font-semibold text-zinc-300">Access Token</Label>
                          <Input value={localSettings.cloudAccessToken || ''} onChange={e => updateLocal('cloudAccessToken', e.target.value)} placeholder="OAuth access token" className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-blue-500/50 font-mono text-xs" />
                          <Label className="font-semibold text-zinc-300 mt-2">Folder ID</Label>
                          <Input value={localSettings.cloudFolderId || ''} onChange={e => updateLocal('cloudFolderId', e.target.value)} placeholder="Drive folder ID" className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-blue-500/50 font-mono text-xs" />
                        </div>
                      )}
                    </div>

                    <div className="border border-white/5 my-8 max-w-3xl"></div>

                    <h3 className="text-xl font-bold text-white tracking-tight mt-8">Stream Quality Preference</h3>
                    <p className="text-sm text-zinc-400 mb-6 mt-1">Set the default format yt-dlp uses when automatically capturing streams.</p>
                    
                    <div className="grid gap-3 max-w-xl">
                      <Select value={localSettings.defaultStreamFormat} onValueChange={v => updateLocal('defaultStreamFormat', v)}>
                        <SelectTrigger className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl">
                          <SelectValue placeholder="Select default quality" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                          <SelectItem value="bestvideo+bestaudio/best">Best Video + Best Audio (Highest Quality)</SelectItem>
                          <SelectItem value="bestvideo[height<=1080]+bestaudio/best">1080p Limit</SelectItem>
                          <SelectItem value="bestvideo[height<=720]+bestaudio/best">720p Limit</SelectItem>
                          <SelectItem value="bestaudio/best">Audio Only</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-zinc-500">This automatically applies to URLs pasted into the generic Add Modal.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* === FILE TYPES TAB === */}
              {activeTab === 'filetypes' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Extension Catchers</h3>
                    <p className="text-sm text-zinc-400 mb-8 mt-1">Define which explicit formats bypass browsers and route safely into ZenDownload.</p>
                    
                    <div className="space-y-5 max-w-3xl">
                      <div className="grid gap-3">
                        <Label className="font-semibold text-zinc-300">Automatically intercepted extensions</Label>
                        <textarea 
                          className="w-full h-40 p-4 text-sm font-mono border rounded-2xl bg-zinc-900/50 text-zinc-300 border-white/10 focus:ring-2 focus:ring-blue-500/50 outline-none resize-none"
                          value={localSettings.extensions || ''}
                          onChange={e => updateLocal('extensions', e.target.value)}
                        />
                        <p className="text-xs text-zinc-500">Space-separated extension list natively watched by generic HTTP listeners.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* === COOKIES & AUTH TAB === */}
              {activeTab === 'cookies' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Cookies & Authentication</h3>
                    <p className="text-sm text-zinc-400 mb-8 mt-1">Extract session cookies to download subscriber-only, age-gated, or private media (e.g. from YouTube, Pornhub, Bilibili).</p>
                    
                    <div className="space-y-8 max-w-xl">
                      <div className="grid gap-3">
                        <Label className="font-semibold text-zinc-300">Read Cookies From Browser</Label>
                        <Select value={localSettings.browserForCookies} onValueChange={v => updateLocal('browserForCookies', v)}>
                          <SelectTrigger className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl">
                            <SelectValue placeholder="Select a browser" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                            <SelectItem value="none">None (Anonymous Browsing)</SelectItem>
                            <SelectItem value="chrome">Google Chrome</SelectItem>
                            <SelectItem value="firefox">Mozilla Firefox</SelectItem>
                            <SelectItem value="edge">Microsoft Edge</SelectItem>
                            <SelectItem value="safari">Apple Safari</SelectItem>
                            <SelectItem value="opera">Opera</SelectItem>
                            <SelectItem value="brave">Brave Browser</SelectItem>
                            <SelectItem value="vivaldi">Vivaldi</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-zinc-500">Extracts logged-in session cookies natively from your browser's local database.</p>
                      </div>

                      <div className="border border-white/5 my-6"></div>

                      <div className="grid gap-3">
                        <Label className="font-semibold text-zinc-300">Import Cookies File (.txt)</Label>
                        <div className="flex space-x-3">
                          <Input 
                            value={localSettings.cookiesPath || ''} 
                            onChange={e => updateLocal('cookiesPath', e.target.value)} 
                            placeholder="Select a Netscape format cookies.txt file..." 
                            className="flex-1 bg-zinc-900/50 border-white/10 text-zinc-300 h-11 rounded-xl focus-visible:ring-blue-500/50 text-xs font-mono" 
                          />
                          <Button 
                            type="button" 
                            variant="secondary" 
                            className="px-6 h-11 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/5 transition-all"
                            onClick={async () => {
                              const { open } = await import('@tauri-apps/plugin-dialog');
                              const selected = await open({
                                multiple: false,
                                filters: [{ name: 'Text Files', extensions: ['txt'] }]
                              });
                              if (selected) updateLocal('cookiesPath', selected as string);
                            }}
                          >
                            Browse
                          </Button>
                        </div>
                        <p className="text-xs text-zinc-500">Required if browser extraction fails. Export cookies using a browser extension like "Get cookies.txt LOCALLY".</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* === PROXY TAB === */}
              {activeTab === 'proxy' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Secure Tunnels & Proxy</h3>
                    <p className="text-sm text-zinc-400 mb-8 mt-1">Route global traffic through localized relays bypassing external blocks.</p>
                    
                    <div className="space-y-8 max-w-xl">
                      <div className="grid gap-3">
                        <Label className="font-semibold text-zinc-300">Proxy Protocol Setup</Label>
                        <Select value={localSettings.proxyType} onValueChange={v => updateLocal('proxyType', v)}>
                          <SelectTrigger className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                            <SelectItem value="none">No Proxy (Direct Connection)</SelectItem>
                            <SelectItem value="http">Secure HTTP/HTTPS Proxy</SelectItem>
                            <SelectItem value="socks5">SOCKS 5 Routing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-3 gap-6">
                        <div className="col-span-2 grid gap-3">
                          <Label className="font-semibold text-zinc-300">Proxy Address</Label>
                          <Input value={localSettings.proxyHost || ''} onChange={e => updateLocal('proxyHost', e.target.value)} placeholder="127.0.0.1" className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-blue-500/50" />
                        </div>
                        <div className="col-span-1 grid gap-3">
                          <Label className="font-semibold text-zinc-300">Port</Label>
                          <Input value={localSettings.proxyPort || ''} onChange={e => updateLocal('proxyPort', e.target.value)} placeholder="1080" className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-blue-500/50" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="grid gap-3">
                          <Label className="font-semibold text-zinc-300">Username</Label>
                          <Input value={localSettings.proxyUsername || ''} onChange={e => updateLocal('proxyUsername', e.target.value)} placeholder="(Optional)" className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-blue-500/50" />
                        </div>
                        <div className="grid gap-3">
                          <Label className="font-semibold text-zinc-300">Password</Label>
                          <Input type="password" value={localSettings.proxyPassword || ''} onChange={e => updateLocal('proxyPassword', e.target.value)} placeholder="(Optional)" className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-blue-500/50" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* === NOTIFICATIONS TAB === */}
              {activeTab === 'notifications' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Events & OS Feedback</h3>
                    <p className="text-sm text-zinc-400 mb-8 mt-1">Control visual UI modes and push notification mechanics.</p>

                    <div className="space-y-4 max-w-2xl">
                      <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors shadow-sm">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-blue-500/50 h-4 w-4 transition-all"
                               checked={localSettings.osNotifications || false}
                               onChange={e => updateLocal('osNotifications', e.target.checked)} />
                        <div className="space-y-1.5">
                          <span className="block font-semibold text-zinc-100 text-base">Show native OS popup when download completes</span>
                          <span className="block text-sm text-zinc-500">Injects directly onto Windows/Mac Action Center.</span>
                        </div>
                      </Label>

                      <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors shadow-sm">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-blue-500/50 h-4 w-4 transition-all"
                               checked={localSettings.forceDarkMode || false}
                               onChange={e => updateLocal('forceDarkMode', e.target.checked)} />
                        <div className="space-y-1.5">
                          <span className="block font-semibold text-zinc-100 text-base">Force Dark Mode</span>
                          <span className="block text-sm text-zinc-500">Overrides global html class="dark" explicitly.</span>
                        </div>
                      </Label>
                    </div>
                  </div>
                  <div className="border border-white/5 my-8 max-w-3xl"></div>
                  <SystemSection />
                </div>
              )}

              {activeTab === 'language' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">{t.settings.language}</h3>
                    <p className="text-sm text-zinc-400 mb-8 mt-1">{t.settings.language}.</p>
                    <div className="space-y-3 max-w-md">
                      <Label className="font-semibold text-zinc-300">{t.settings.language}</Label>
                        <Select value={localSettings.language || 'en'} onValueChange={v => updateLocal('language', v)}>
                        <SelectTrigger className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl">
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                          {availableLanguages.map(lang => (
                            <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'updates' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">{t.settings.updates}</h3>
                    <p className="text-sm text-zinc-400 mb-8 mt-1">{t.settings.checkUpdatesDesc}</p>
                    <div className="space-y-6 max-w-2xl">
                      <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors shadow-sm">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-blue-500/50 h-4 w-4 transition-all"
                               checked={localSettings.autoCheckUpdates || false}
                               onChange={e => updateLocal('autoCheckUpdates', e.target.checked)} />
                        <div className="space-y-1.5">
                          <span className="block font-semibold text-zinc-100 text-base">{t.settings.checkUpdates}</span>
                          <span className="block text-sm text-zinc-500">{t.settings.checkUpdatesDesc}</span>
                        </div>
                      </Label>

                      <div className="grid gap-3">
                        <Label className="font-semibold text-zinc-300">{t.settings.updateEndpoint}</Label>
                        <Input value={localSettings.updateEndpoint || ''} onChange={e => updateLocal('updateEndpoint', e.target.value)} placeholder="https://example.com/latest.json" className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-blue-500/50" />
                      </div>

                      <div className="grid gap-3">
                        <Label className="font-semibold text-zinc-300">{t.settings.updatePublicKey}</Label>
                        <textarea value={localSettings.updatePublicKey || ''} onChange={e => updateLocal('updatePublicKey', e.target.value)} className="w-full min-h-32 p-4 text-xs font-mono rounded-2xl bg-zinc-900/50 text-zinc-300 border border-white/10 focus:ring-2 focus:ring-blue-500/50 outline-none resize-y" placeholder="Paste the Tauri updater public key here" />
                      </div>

                      <div className="border border-white/5 my-6"></div>

                      <div className="space-y-4">
                        <h4 className="text-lg font-semibold text-white">{t.settings.checkNow}</h4>
                        
                        {updateState.error && (
                          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                            {updateState.error}
                          </div>
                        )}

                        {updateState.available && updateState.version && (
                          <div className="p-5 bg-green-500/10 border border-green-500/20 rounded-2xl space-y-3">
                            <div className="flex items-center space-x-2">
                              <Check className="w-5 h-5 text-green-400" />
                              <span className="font-semibold text-green-400">{t.settings.updateAvailable}</span>
                            </div>
                            <div className="text-sm text-zinc-300 space-y-1">
                              <p>{t.settings.currentVersion}: {localSettings.updateEndpoint ? 'configured' : 'not set'}</p>
                              <p>{t.settings.latestVersion}: {updateState.version}</p>
                            </div>
                            {updateState.notes && (
                              <div className="mt-3">
                                <p className="text-sm font-semibold text-zinc-300 mb-2">{t.settings.releaseNotes}:</p>
                                <p className="text-sm text-zinc-400 whitespace-pre-wrap">{updateState.notes}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {!updateState.available && !updateState.checking && !updateState.error && (
                          <div className="p-4 bg-zinc-900/30 border border-white/5 rounded-xl text-zinc-400 text-sm">
                            {t.settings.noUpdates}
                          </div>
                        )}

                        <div className="flex space-x-3">
                          <Button 
                            variant="outline" 
                            className="px-5 h-10 font-medium rounded-xl bg-transparent border-white/[0.08] hover:bg-white/[0.04] text-zinc-300"
                            disabled={updateState.checking || updateState.installing}
                            onClick={async () => {
                              setUpdateState(prev => ({ ...prev, checking: true, error: undefined }));
                              try {
                                const { invoke } = await import('@tauri-apps/api/core');
                                const result = await invoke<{ available: boolean; latest_version?: string; notes?: string }>('check_updates');
                                setUpdateState({
                                  checking: false,
                                  installing: false,
                                  available: result.available,
                                  version: result.latest_version,
                                  notes: result.notes,
                                });
                              } catch (err) {
                                setUpdateState(prev => ({ 
                                  ...prev, 
                                  checking: false, 
                                  error: String(err) 
                                }));
                              }
                            }}
                          >
                            {updateState.checking ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 mr-2" />
                            )}
                            {t.settings.checkNow}
                          </Button>

                          {updateState.available && (
                            <Button 
                              className="px-5 h-10 font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white"
                              disabled={updateState.installing}
                              onClick={async () => {
                                setUpdateState(prev => ({ ...prev, installing: true, error: undefined }));
                                try {
                                  const { invoke } = await import('@tauri-apps/api/core');
                                  await invoke('install_update');
                                  setUpdateState(prev => ({ ...prev, installing: false }));
                                } catch (err) {
                                  setUpdateState(prev => ({ 
                                    ...prev, 
                                    installing: false, 
                                    error: String(err) 
                                  }));
                                }
                              }}
                            >
                              {updateState.installing ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : null}
                              {t.settings.installUpdate}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* === AUTOMATION TAB === */}
              {activeTab === 'automation' && (
                <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                  <WatchFolderSection
                    watchPath={localSettings.watchFolderPath || ''}
                    watchAutoAdd={localSettings.watchFolderAutoAdd ?? true}
                    watchCategory={localSettings.watchFolderCategory || 'General'}
                    onChange={(patch) => setLocalSettings(prev => ({ ...prev, ...patch }))}
                  />
                  <div className="border border-white/5 my-8 max-w-3xl"></div>
                  <BandwidthProfileSection
                    enabled={localSettings.bandwidthProfileEnabled ?? false}
                    defaultLimitKbps={localSettings.bandwidthDefaultLimitKbps ?? 0}
                    rules={localSettings.bandwidthRules || []}
                    onChange={(patch) => setLocalSettings(prev => ({ ...prev, ...patch }))}
                  />
                </div>
              )}

              {/* === SECURITY TAB === */}
              {activeTab === 'security' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <VirusTotalSection
                    apiKey={localSettings.virustotalApiKey || ''}
                    autoScan={localSettings.virustotalAutoScan ?? false}
                    threshold={localSettings.virustotalThreatThreshold ?? 3}
                    onChange={(patch) => setLocalSettings(prev => ({ ...prev, ...patch }))}
                  />
                </div>
              )}

              {/* === THEME TAB === */}
              {activeTab === 'theme' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <ThemeSection
                    accent={localSettings.themeAccent || 'indigo'}
                    fontSize={localSettings.themeFontSize || 'default'}
                    compactMode={localSettings.themeCompactMode ?? false}
                    backgroundDensity={localSettings.themeBackgroundDensity || 'default'}
                    onChange={(patch) => setLocalSettings(prev => ({ ...prev, ...patch }))}
                  />
                  <div className="border border-white/5 my-8 max-w-3xl"></div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">Display Mode</h3>
                    <p className="text-sm text-zinc-400 mt-1">Force light or dark mode regardless of OS setting.</p>
                    <div className="mt-4">
                      <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors max-w-md">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-indigo-500 focus:ring-indigo-500/50 h-4 w-4"
                               checked={localSettings.forceDarkMode || false}
                               onChange={e => updateLocal('forceDarkMode', e.target.checked)} />
                        <div className="space-y-1.5">
                          <span className="block font-semibold text-zinc-100 text-base">Force Dark Mode</span>
                          <span className="block text-sm text-zinc-500">Always use the dark theme even if your OS prefers light mode.</span>
                        </div>
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              {/* === BACKUP TAB === */}
              {activeTab === 'backup' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <BackupManager
                    onChange={(patch) => setLocalSettings(prev => ({ ...prev, ...patch }))}
                    autoBackupEnabled={localSettings.autoBackupEnabled ?? false}
                  />
                </div>
              )}

              {/* === BROWSER TAB === */}
              {activeTab === 'browser' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <BrowserExtensionSection />
                </div>
              )}

              {/* === ADVANCED TAB === */}
              {activeTab === 'advanced' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Premium Integrations</h3>
                    <p className="text-sm text-zinc-400 mb-6 mt-1">Connect premium Debrid services for high-speed file hosting downloads.</p>

                    <div className="space-y-6 max-w-2xl mb-8">
                      <div className="grid gap-3">
                        <Label className="font-semibold text-zinc-300">Real-Debrid API Key</Label>
                        <Input type="password" value={localSettings.debridApiKey || ''} onChange={e => updateLocal('debridApiKey', e.target.value)} placeholder="Paste your Real-Debrid API key here" className="bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-blue-500/50" />
                        <p className="text-xs text-zinc-500">Automatically unlocks links from Rapidgator, Uploaded, 1Fichier, Mega, etc.</p>
                      </div>
                    </div>

                    <div className="border border-white/5 my-8 max-w-3xl"></div>

                    <h3 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                      <span className="text-2xl">🔞</span>
                      Adult Sites Downloader
                    </h3>
                    <p className="text-sm text-zinc-400 mb-6 mt-1">Enable downloading from supported adult content platforms via yt-dlp. Age verification required.</p>

                    <div className="space-y-4 max-w-2xl mb-8">
                      <Label className="flex p-5 bg-pink-500/[0.05] border border-pink-500/20 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-pink-500/[0.08] transition-colors shadow-sm">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-pink-500 focus:ring-pink-500/50 h-4 w-4 transition-all"
                               checked={localSettings.adultSitesEnabled || false}
                               onChange={e => updateLocal('adultSitesEnabled', e.target.checked)} />
                        <div className="space-y-1.5 flex-1">
                          <span className="block font-semibold text-pink-300 text-base">Enable Adult Sites Downloader</span>
                          <span className="block text-sm text-zinc-400">Adds support for Pornhub, xHamster, XVideos, RedTube, and 10+ other adult content sites via yt-dlp.</span>
                        </div>
                      </Label>

                      {localSettings.adultSitesEnabled && (
                        <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm space-y-2">
                          <p className="text-red-400 font-semibold flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Age Verification Notice
                          </p>
                          <p className="text-zinc-400">
                            You must be at least 18 years of age (or the age of majority in your jurisdiction) to use this feature. By enabling, you confirm this is the case. The first time you open the adult downloader, an age verification prompt will appear.
                          </p>
                        </div>
                      )}

                      {localSettings.adultSitesEnabled && (
                        <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors shadow-sm">
                          <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-pink-500 focus:ring-pink-500/50 h-4 w-4 transition-all"
                                 checked={localSettings.adultAgeVerified || false}
                                 onChange={e => updateLocal('adultAgeVerified', e.target.checked)} />
                          <div className="space-y-1.5">
                            <span className="block font-semibold text-zinc-100 text-base">I am 18 or older</span>
                            <span className="block text-sm text-zinc-500">Required to bypass the age verification prompt.</span>
                          </div>
                        </Label>
                      )}
                    </div>

                    <div className="border border-white/5 my-8 max-w-3xl"></div>

                    <h3 className="text-2xl font-bold text-white tracking-tight">Debug & Deep Overrides</h3>
                    <div className="p-5 bg-amber-500/10 text-amber-400 rounded-2xl text-sm mb-8 mt-4 border border-amber-500/20 shadow-sm flex items-start space-x-3">
                      <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-amber-500 font-bold mb-1">Warning:</strong> 
                        Modifying parameters inside this structural tree natively impacts binary limits. Unstable interactions may occur if manipulated blindly.
                      </div>
                    </div>
                    
                    <div className="space-y-4 max-w-2xl">
                      <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors shadow-sm">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-blue-500/50 h-4 w-4 transition-all" 
                               checked={localSettings.dhtTracker || false}
                               onChange={e => updateLocal('dhtTracker', e.target.checked)} />
                        <div className="space-y-1.5">
                          <span className="block font-semibold text-zinc-100 text-base">Enable BitTorrent DHT Tracker Discovery</span>
                          <span className="block text-sm text-zinc-500">Injects local network sweeps bypassing explicit tracker failures.</span>
                        </div>
                      </Label>
                      
                      <Label className="flex p-5 bg-zinc-900/30 border border-white/5 rounded-2xl items-start space-x-4 cursor-pointer hover:bg-zinc-800/40 transition-colors shadow-sm">
                        <input type="checkbox" className="mt-1 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-blue-500/50 h-4 w-4 transition-all" 
                               checked={localSettings.verboseSocket || false}
                               onChange={e => updateLocal('verboseSocket', e.target.checked)} />
                        <div className="space-y-1.5">
                          <span className="block font-semibold text-zinc-100 text-base">Verbose Socket Logging</span>
                          <span className="block text-sm text-zinc-500">Outputs 127.0.0.1:6800 Web Socket pings straight to developer console.</span>
                        </div>
                      </Label>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-white/[0.06] bg-zinc-950 flex justify-end gap-2 z-20">
              <Button variant="outline" className="px-5 h-9 font-medium rounded-lg bg-transparent border-white/[0.08] hover:bg-white/[0.04] text-zinc-400 text-[13px]" onClick={onClose}>Cancel</Button>
              <Button onClick={handleApply} className="px-6 h-9 font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px]">
                <Save className="w-3.5 h-3.5 mr-1.5" />
                Apply
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
