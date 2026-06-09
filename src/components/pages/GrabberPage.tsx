import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useDownloadStore } from '../../stores/downloadStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Globe, Video, Image as ImageIcon, Music, 
  FileText, Archive as ArchiveIcon, Binary, Layout, CheckSquare, 
  Square, RefreshCw, Download, AlertCircle, HelpCircle
} from 'lucide-react';

interface GrabbedResource {
  url: string;
  resource_type: string;
  filename: string;
}

export function GrabberPage() {
  const addDownload = useDownloadStore((state) => state.addDownload);
  const pathVideo = useSettingsStore((state) => state.pathVideo);
  const pathGeneral = useSettingsStore((state) => state.pathGeneral);
  
  const [siteUrl, setSiteUrl] = useState('');
  const [savePath, setSavePath] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [resources, setResources] = useState<GrabbedResource[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setSavePath(pathVideo || pathGeneral || '/tmp');
  }, [pathVideo, pathGeneral]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteUrl) return;
    setIsScanning(true);
    setResources([]);
    setSelectedUrls(new Set());
    
    try {
      let formattedUrl = siteUrl.trim();
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = 'https://' + formattedUrl;
        setSiteUrl(formattedUrl);
      }
      
      const results = await invoke<GrabbedResource[]>('scrape_site_grabber', { url: formattedUrl });
      setResources(results);
      
      // Auto-select files (Audio, Video, Document, Archive, Program, Icon), skip Webpages
      const preSelected = results
        .filter(r => !['Webpage', 'Link'].includes(r.resource_type))
        .map(r => r.url);
      setSelectedUrls(new Set(preSelected));
    } catch (error) {
      console.error('Failed to grab site:', error);
      alert('Error grabbing site: ' + error);
    } finally {
      setIsScanning(false);
    }
  };

  const getCategoryPath = (resourceType: string): string => {
    const paths: Record<string, string> = {
      Video: pathVideo || pathGeneral || '/tmp',
      Music: useSettingsStore.getState().pathMusic || pathGeneral || '/tmp',
      Image: pathGeneral || '/tmp',
      Document: useSettingsStore.getState().pathDocuments || pathGeneral || '/tmp',
      Archive: useSettingsStore.getState().pathCompressed || pathGeneral || '/tmp',
      Program: useSettingsStore.getState().pathPrograms || pathGeneral || '/tmp',
      Audio: useSettingsStore.getState().pathMusic || pathGeneral || '/tmp',
      Icon: pathGeneral || '/tmp',
    };
    return paths[resourceType] || pathGeneral || '/tmp';
  };

  const handleDownloadSelected = async () => {
    const selected = resources.filter(r => selectedUrls.has(r.url));
    if (selected.length === 0) return;
    
    const items = selected.map(res => {
      const categoryPath = getCategoryPath(res.resource_type);
      const finalPath = `${categoryPath}/${res.filename}`;
      return {
        url: res.url,
        savePath: finalPath,
        threads: 8,
        category: res.resource_type,
        extraMeta: null as string | null,
      };
    });

    try {
      await invoke('add_downloads_batch', { items });
    } catch (error) {
      console.error('Failed to add batch downloads:', error);
      // Fallback: add individually
      for (const item of items) {
        try {
          await addDownload(item.url, item.savePath, item.threads, item.category);
        } catch (e) {
          console.error('Failed to add download:', e);
        }
      }
    }
    
    // Refresh download list
    useDownloadStore.getState().fetchDownloads();
    // Notify or switch to downloads
    useDownloadStore.getState().setCurrentView('downloads');
  };

  const toggleSelection = (url: string) => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  // Grouped counts
  const categoryCounts = resources.reduce((acc, r) => {
    const type = r.resource_type;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const getIconForType = (type: string) => {
    switch (type) {
      case 'Video': return <Video className="w-4 h-4 text-purple-400" />;
      case 'Image': return <ImageIcon className="w-4 h-4 text-pink-400" />;
      case 'Icon': return <Layout className="w-4 h-4 text-teal-400" />;
      case 'Audio': return <Music className="w-4 h-4 text-cyan-400" />;
      case 'Document': return <FileText className="w-4 h-4 text-blue-400" />;
      case 'Archive': return <ArchiveIcon className="w-4 h-4 text-amber-500" />;
      case 'Program': return <Binary className="w-4 h-4 text-emerald-400" />;
      case 'Webpage': return <Globe className="w-4 h-4 text-zinc-400" />;
      default: return <HelpCircle className="w-4 h-4 text-zinc-500" />;
    }
  };

  // Map user-friendly filters to backend resource types
  const filterMap: Record<string, string[]> = {
    All: [],
    Videos: ['Video'],
    Images: ['Image'],
    Icons: ['Icon'],
    Websites: ['Webpage', 'Link'],
    Audios: ['Audio'],
    Documents: ['Document'],
    Archives: ['Archive'],
    Programs: ['Program'],
  };

  const filteredResources = resources.filter(res => {
    // 1. Filter by category Rel
    const types = filterMap[activeFilter];
    if (types && types.length > 0) {
      if (!types.includes(res.resource_type)) return false;
    }
    // 2. Filter by search query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return res.filename.toLowerCase().includes(q) || res.url.toLowerCase().includes(q);
    }
    return true;
  });

  const selectAllFiltered = () => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      filteredResources.forEach(res => next.add(res.url));
      return next;
    });
  };

  const deselectAllFiltered = () => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      filteredResources.forEach(res => next.delete(res.url));
      return next;
    });
  };

  const invertSelectionFiltered = () => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      filteredResources.forEach(res => {
        if (next.has(res.url)) next.delete(res.url);
        else next.add(res.url);
      });
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url(&quot;data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E&quot;)] opacity-5 mix-blend-overlay pointer-events-none z-0"></div>
      
      {/* Search Header */}
      <div className="px-6 py-5 border-b border-white/[0.04] bg-zinc-950 shrink-0 z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-purple-400" />
            Advanced Site Grabber
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Scan, filter, preview, and batch-download resources from any webpage.</p>
        </div>
        <form onSubmit={handleScan} className="flex gap-2.5 max-w-xl flex-1 w-full">
          <Input 
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="Enter website URL (e.g., https://unsplash.com)"
            className="flex-1 bg-zinc-900/40 border-white/[0.08] text-white h-10 rounded-lg focus-visible:ring-purple-500/50 text-[13px]"
          />
          <Button type="submit" disabled={isScanning} className="px-5 h-10 font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 border border-purple-500/40 transition-all text-[13px] shrink-0">
            {isScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Scan Webpage'}
          </Button>
        </form>
      </div>

      {/* Main Body Grid */}
      <div className="flex-1 flex min-h-0 z-10">
        
        {/* Filters Sidebar */}
        <aside className="w-52 border-r border-white/[0.04] bg-zinc-950/40 p-4 space-y-4 overflow-y-auto shrink-0 hidden md:block">
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2.5 px-2">Filters</h3>
            <div className="space-y-1">
              {Object.keys(filterMap).map(filter => {
                const types = filterMap[filter];
                const count = types.length === 0 
                  ? resources.length 
                  : types.reduce((acc, t) => acc + (categoryCounts[t] || 0), 0);
                
                const isSelected = activeFilter === filter;
                return (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[12.5px] font-medium rounded-md transition-all ${
                      isSelected 
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                        : 'text-zinc-400 hover:bg-white/[0.02] border border-transparent'
                    }`}
                  >
                    <span className="truncate">{filter}</span>
                    {count > 0 && (
                      <span className={`text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-white/[0.04] ${isSelected ? 'text-purple-400' : 'text-zinc-600'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Content Container */}
        <div className="flex-1 flex flex-col min-h-0 bg-zinc-950">
          
          {/* Controls Bar */}
          <div className="px-6 py-3 border-b border-white/[0.04] bg-zinc-950 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllFiltered} className="h-8 px-2.5 text-zinc-400 hover:text-white text-[12px] flex items-center gap-1.5 hover:bg-white/[0.04]">
                <CheckSquare className="w-3.5 h-3.5" />
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAllFiltered} className="h-8 px-2.5 text-zinc-400 hover:text-white text-[12px] flex items-center gap-1.5 hover:bg-white/[0.04]">
                <Square className="w-3.5 h-3.5" />
                Deselect All
              </Button>
              <Button variant="ghost" size="sm" onClick={invertSelectionFiltered} className="h-8 px-2.5 text-zinc-400 hover:text-white text-[12px] flex items-center gap-1.5 hover:bg-white/[0.04]">
                <RefreshCw className="w-3.5 h-3.5" />
                Invert
              </Button>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Active filter mobile pill fallback */}
              <div className="md:hidden">
                <select 
                  value={activeFilter}
                  onChange={(e) => setActiveFilter(e.target.value)}
                  className="bg-zinc-900 border border-white/10 text-zinc-300 text-xs px-2.5 py-1 rounded-md appearance-none cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                >
                  {Object.keys(filterMap).map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search grabbed items..."
                className="w-48 h-8 bg-zinc-900/40 border-white/[0.08] text-white text-xs rounded-md"
              />
            </div>
          </div>

          {/* Scrape results container */}
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            {isScanning ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-3 text-center">
                <RefreshCw className="w-10 h-10 text-purple-400 animate-spin" />
                <div>
                  <p className="text-sm font-semibold text-zinc-300">Scanning webpage...</p>
                  <p className="text-xs text-zinc-600 mt-1">Extracting resources from {siteUrl}</p>
                </div>
              </div>
            ) : resources.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-3 text-center max-w-sm mx-auto">
                <Globe className="w-12 h-12 text-zinc-800" />
                <div>
                  <p className="text-sm font-semibold text-zinc-400">No resources grabbed yet</p>
                  <p className="text-xs text-zinc-600 mt-1">Enter a website URL above and click "Scan Webpage" to parse images, streams, icons, websites, and documents.</p>
                </div>
              </div>
            ) : filteredResources.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
                <AlertCircle className="w-8 h-8 text-zinc-700" />
                <p className="text-xs font-semibold">No items match your active filters or query</p>
              </div>
            ) : (
              // Previews for images/icons when requested, list layout for others
              (activeFilter === 'Images' || activeFilter === 'Icons') ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                  {filteredResources.map((res, i) => {
                    const isSelected = selectedUrls.has(res.url);
                    return (
                      <div 
                        key={i} 
                        onClick={() => toggleSelection(res.url)}
                        className={`group relative aspect-square rounded-xl border transition-all duration-150 cursor-pointer overflow-hidden flex flex-col items-center justify-between p-2 ${
                          isSelected 
                            ? 'border-purple-500 bg-purple-500/5 shadow-md shadow-purple-500/5' 
                            : 'border-white/[0.06] bg-zinc-900/20 hover:border-white/10 hover:bg-white/[0.02]'
                        }`}
                      >
                        {/* Selected overlay border/checkbox */}
                        <div className="absolute top-2 left-2 z-10">
                          <Checkbox 
                            checked={isSelected} 
                            onCheckedChange={() => toggleSelection(res.url)}
                            className={isSelected ? "border-purple-500 data-[state=checked]:bg-purple-500 data-[state=checked]:text-white" : "border-zinc-700 bg-zinc-950/70"}
                          />
                        </div>

                        {/* Image element with lazy fallback */}
                        <div className="flex-1 w-full flex items-center justify-center overflow-hidden rounded-lg bg-zinc-950/60 p-2 relative">
                          <img 
                            src={res.url} 
                            alt={res.filename} 
                            loading="lazy" 
                            className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                            onError={(e) => {
                              // If image fails to load, replace with a nice icon
                              e.currentTarget.style.display = 'none';
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                const placeholder = document.createElement('div');
                                placeholder.className = "text-zinc-600";
                                placeholder.innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;
                                parent.appendChild(placeholder);
                              }
                            }}
                          />
                        </div>

                        {/* Filename details */}
                        <div className="w-full mt-2 shrink-0">
                          <p className="text-[11px] font-medium text-zinc-300 truncate w-full text-center px-1">{res.filename}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredResources.map((res, i) => {
                    const isSelected = selectedUrls.has(res.url);
                    return (
                      <div 
                        key={i} 
                        onClick={() => toggleSelection(res.url)}
                        className={`flex items-center space-x-3 py-2 px-3 rounded-lg border transition-all duration-150 cursor-pointer ${
                          isSelected 
                            ? 'bg-purple-500/10 border-purple-500/20 shadow-sm' 
                            : 'bg-zinc-900/10 border-white/[0.04] hover:bg-white/[0.02] hover:border-white/[0.08]'
                        }`}
                      >
                        <Checkbox 
                          checked={isSelected} 
                          onCheckedChange={() => toggleSelection(res.url)}
                          className={isSelected ? "border-purple-500 data-[state=checked]:bg-purple-500 data-[state=checked]:text-white" : "border-zinc-700"}
                          onClick={(e) => e.stopPropagation()}
                        />
                        
                        <div className="shrink-0 w-7 h-7 rounded bg-zinc-900/60 border border-white/[0.04] flex items-center justify-center">
                          {getIconForType(res.resource_type)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-zinc-100 truncate">{res.filename}</p>
                        </div>

                        <Badge variant="outline" className="border-white/5 text-[10px] bg-zinc-900 text-zinc-400 capitalize px-2 font-medium shrink-0">
                          {res.resource_type}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* Footer Controls & Save Location */}
          <div className="px-6 py-3 border-t border-white/[0.04] bg-zinc-950/95 backdrop-blur-sm flex items-center justify-between gap-4 shrink-0 z-10">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                {selectedUrls.size} of {resources.length} selected
              </span>
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-zinc-600 bg-zinc-900/60 rounded-md px-2.5 py-1 border border-white/[0.04] max-w-[200px] truncate">
                <span className="truncate">{savePath}</span>
                <button onClick={async () => {
                  const selected = await open({ directory: true, multiple: false });
                  if (selected) setSavePath(selected as string);
                }} className="text-purple-400 hover:text-purple-300 font-semibold ml-1 shrink-0">Browse</button>
              </div>
            </div>
            
            <Button 
              onClick={handleDownloadSelected} 
              disabled={selectedUrls.size === 0}
              className="h-9 px-5 font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 border border-purple-500/40 transition-all text-[13px] shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Download {selectedUrls.size > 0 ? `(${selectedUrls.size})` : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
