import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useDownloadStore } from '../../stores/downloadStore';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface GrabberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GrabbedResource {
  url: string;
  resource_type: string;
  filename: string;
}

export function GrabberModal({ isOpen, onClose }: GrabberModalProps) {
  const addDownload = useDownloadStore((state) => state.addDownload);
  const pathVideo = useSettingsStore((state) => state.pathVideo);
  const pathGeneral = useSettingsStore((state) => state.pathGeneral);
  const [siteUrl, setSiteUrl] = useState('');
  const [savePath, setSavePath] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [resources, setResources] = useState<GrabbedResource[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setSavePath(pathVideo || pathGeneral || '/tmp');
    }
  }, [isOpen, pathVideo, pathGeneral]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteUrl) return;
    setIsScanning(true);
    setResources([]);
    setSelectedUrls(new Set());
    
    try {
      console.log('Grabber: Scanning', siteUrl);
      const results = await invoke<GrabbedResource[]>('scrape_site_grabber', { url: siteUrl });
      console.log('Grabber: Got results:', results.length);
      setResources(results);
      // Auto-select actual files usually (Audio, Video, Document, Archive), not web pages
      const preSelected = results
        .filter(r => r.resource_type !== 'Webpage' && r.resource_type !== 'Link')
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
    };
    return paths[resourceType] || pathGeneral || '/tmp';
  };

  const handleDownloadSelected = async () => {
    const selected = resources.filter(r => selectedUrls.has(r.url));
    for (const res of selected) {
      const categoryPath = getCategoryPath(res.resource_type);
      const finalPath = `${categoryPath}/${res.filename}`;
      await addDownload(res.url, finalPath, 8, res.resource_type);
    }
    onClose();
  };

  const toggleSelection = (url: string) => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className="sm:max-w-[700px] p-0 overflow-hidden bg-zinc-950/90 backdrop-blur-2xl border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="relative flex flex-col h-full">
          <div className="absolute inset-0 bg-[url(&quot;data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E&quot;)] opacity-10 mix-blend-overlay pointer-events-none z-0"></div>
          
          <div className="flex justify-end p-4 absolute top-0 right-0 z-20">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-zinc-400 hover:text-white hover:bg-white/10" onClick={onClose}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            </Button>
          </div>

          <div className="px-8 pt-8 pb-6 relative z-10 flex flex-col h-full flex-1">
            <DialogHeader className="mb-6 text-left space-y-1.5 shrink-0">
              <DialogTitle className="text-2xl font-bold tracking-tight text-white">Site Grabber</DialogTitle>
              <DialogDescription className="text-sm text-zinc-400">
                Scan a webpage for download links, media, and documents.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleScan} className="flex space-x-3 mb-6 shrink-0">
              <Input 
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="Enter website URL (e.g. https://wikipedia.org)"
                className="flex-1 bg-zinc-900/50 border-white/10 text-white h-11 rounded-xl focus-visible:ring-purple-500/50 shadow-inner"
              />
              <Button type="submit" disabled={isScanning} className="px-6 h-11 font-semibold rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_20px_rgba(147,51,234,0.4)] border border-purple-500/50 transition-all">
                {isScanning ? 'Scanning...' : 'Scan Site'}
              </Button>
            </form>

            <div className="flex-1 overflow-y-auto border rounded-2xl p-2 bg-zinc-900/30 border-white/10 shadow-inner min-h-[300px]">
                {resources.length === 0 && !isScanning && (
                    <div className="h-full flex items-center justify-center text-zinc-500 font-medium">
                        No resources grabbed yet.
                    </div>
                )}
                
                <div className="space-y-1">
                    {resources.map((res, i) => (
                        <div key={i} className={`flex items-center space-x-4 py-3 px-4 rounded-xl transition-all cursor-pointer border ${
                            selectedUrls.has(res.url) 
                                ? 'bg-purple-500/10 border-purple-500/30 shadow-sm' 
                                : 'hover:bg-white/5 border-transparent'
                        }`} onClick={() => toggleSelection(res.url)}>
                            <div className="flex items-center justify-center pt-0.5">
                                <Checkbox 
                                    checked={selectedUrls.has(res.url)} 
                                    onCheckedChange={() => toggleSelection(res.url)} 
                                    className={selectedUrls.has(res.url) ? "border-purple-500 data-[state=checked]:bg-purple-500 data-[state=checked]:text-white" : "border-zinc-600"}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-zinc-100 truncate">{res.filename}</p>
                                <p className="text-xs text-zinc-500 truncate mt-0.5">{res.url}</p>
                            </div>
                            <Badge variant="outline" className="bg-zinc-800/50 text-zinc-300 border-white/10">{res.resource_type}</Badge>
                        </div>
                    ))}
                </div>
            </div>

            <DialogFooter className="mt-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-0 shrink-0">
              <div className="flex items-center text-xs font-bold tracking-wider text-zinc-500 uppercase w-full sm:w-auto">
                {selectedUrls.size} of {resources.length} selected
              </div>
              <div className="flex-1 sm:max-w-[300px] sm:mx-auto flex items-center space-x-2 w-full">
                <Input value={savePath} readOnly className="h-10 text-xs font-mono bg-zinc-900/50 border-white/10 text-zinc-400 rounded-xl" />
                <Button type="button" size="sm" variant="secondary" className="h-10 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/5 transition-all font-semibold" onClick={async () => {
                    const selected = await open({ directory: true, multiple: false });
                    if (selected) setSavePath(selected as string);
                }}>
                    Browse
                </Button>
              </div>
              <div className="flex space-x-3 w-full sm:w-auto justify-end">
                <Button variant="outline" className="h-10 px-5 font-semibold rounded-xl bg-transparent border-white/10 hover:bg-white/5 text-zinc-300 transition-all" onClick={() => { setResources([]); setSelectedUrls(new Set()); }}>Clear</Button>
                <Button className="h-10 px-6 font-semibold rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_20px_rgba(147,51,234,0.4)] border border-purple-500/50 transition-all" onClick={handleDownloadSelected} disabled={selectedUrls.size === 0}>
                    Download
                </Button>
              </div>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
