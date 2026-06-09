import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, HardDrive, Globe, Clock, FileType, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import { Download } from '@/stores/downloadStore';
import { formatBytes } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DownloadPropertiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  download: Download | null;
}

export function DownloadPropertiesModal({ isOpen, onClose, download }: DownloadPropertiesModalProps) {
  const [newUrl, setNewUrl] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!download) return null;

  const progressPercentage = download.total_size ? (download.downloaded / download.total_size) * 100 : 0;

  const handleRefreshLink = async () => {
    if (!newUrl) return;
    setIsRefreshing(true);
    try {
      await invoke('refresh_download_link', { id: download.id, newUrl });
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to refresh link: ' + e);
    } finally {
      setIsRefreshing(false);
      setNewUrl('');
    }
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

          {/* Header Ribbon */}
          <div className="bg-zinc-900/40 border-b border-white/5 p-8 flex items-start space-x-5 relative z-10 shrink-0">
            <div className="p-4 bg-blue-500/10 text-blue-400 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border border-blue-500/20">
              <FileType className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0 pt-1">
               <DialogTitle className="text-2xl font-bold tracking-tight text-white truncate pr-6">
                  {download.file_name || 'Untitled'}
               </DialogTitle>
               <div className="flex items-center space-x-4 mt-3 text-xs font-semibold text-zinc-400">
                 <Badge variant="outline" className={`font-bold tracking-wider uppercase px-2.5 py-0.5 ${
                     download.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                     download.status === 'Error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                     download.status === 'Needs Refresh' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                     'bg-blue-500/10 text-blue-400 border-blue-500/20'
                 }`}>
                   {download.status}
                 </Badge>
                 <span>•</span>
                 <span className="font-mono text-zinc-300">{progressPercentage.toFixed(2)}%</span>
                 <span>•</span>
                 <span className="font-mono text-zinc-300">{download.total_size ? formatBytes(download.total_size) : 'Unknown'}</span>
               </div>
            </div>
          </div>

          {/* Content Body */}
          <div className="p-8 space-y-8 overflow-y-auto flex-1 relative z-10">
             <div className="space-y-6">
               {/* Progress Map */}
               <div className="p-5 rounded-2xl border border-white/5 bg-zinc-900/30 shadow-inner space-y-4">
                   <div className="flex items-center justify-between text-sm font-semibold text-zinc-300">
                       <span>Transfer Pipeline</span>
                       <span className="font-mono text-zinc-400">{formatBytes(download.downloaded)} / {download.total_size ? formatBytes(download.total_size) : 'Unknown'}</span>
                   </div>
                   <div className="relative h-3 w-full bg-zinc-950 rounded-full overflow-hidden border border-white/5">
                        <div 
                          className={`h-full transition-all duration-500 ease-out shadow-[0_0_15px_currentColor] ${download.status === 'Completed' ? 'bg-emerald-500 text-emerald-500' : 'bg-blue-500 text-blue-500'}`}
                          style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                   {download.status === 'Downloading' && (
                       <div className="text-xs font-mono font-medium text-cyan-400 text-right w-full flex justify-between">
                          <span>Speed: {download.currentSpeed ? `${formatBytes(download.currentSpeed)}/s` : 'Calculating...'}</span>
                       </div>
                   )}
               </div>

               {/* Smart Link Refresh */}
               {download.status === 'Needs Refresh' && (
                 <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 space-y-4 shadow-inner">
                    <Label className="text-[13px] font-bold text-amber-400 flex items-center gap-2"><RefreshCw className="w-4 h-4"/> Smart Link Refresh</Label>
                    <p className="text-xs text-amber-300/80">The download link has expired. Paste a new link below to resume from {formatBytes(download.downloaded)} without restarting.</p>
                    <div className="flex gap-2">
                      <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="Paste new download link here..." className="bg-zinc-900/50 border-amber-500/30 text-zinc-300 h-11 rounded-xl shadow-inner" />
                      <Button onClick={handleRefreshLink} disabled={isRefreshing || !newUrl} className="h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl px-6">
                        {isRefreshing ? 'Refreshing...' : 'Resume'}
                      </Button>
                    </div>
                 </div>
               )}

               {/* Network Traces */}
               <div className="space-y-3">
                  <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2.5"><Globe className="w-4 h-4 text-zinc-400"/> Origin Metrics</Label>
                  <div className="relative group">
                      <Input readOnly value={download.url} className="bg-zinc-900/50 font-mono text-xs pr-12 border-white/10 text-zinc-300 h-11 rounded-xl shadow-inner" />
                      <Button variant="ghost" size="icon" className="absolute right-1 top-1.5 h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg" onClick={() => navigator.clipboard.writeText(download.url)}>
                          <Copy className="w-3.5 h-3.5" />
                      </Button>
                  </div>
               </div>

               {/* Output Diagnostics */}
               <div className="space-y-3">
                  <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2.5"><HardDrive className="w-4 h-4 text-zinc-400"/> Output Target</Label>
                  <div className="relative group">
                      <Input readOnly value={download.save_path} className="bg-zinc-900/50 font-mono text-xs pr-12 border-white/10 text-zinc-300 h-11 rounded-xl shadow-inner" />
                      <Button variant="ghost" size="icon" className="absolute right-1 top-1.5 h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg" onClick={() => navigator.clipboard.writeText(download.save_path)}>
                          <Copy className="w-3.5 h-3.5" />
                      </Button>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-5">
                   <div className="space-y-3">
                      <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2.5"><Clock className="w-4 h-4 text-zinc-400"/> Chronology</Label>
                      <div className="p-3.5 bg-zinc-900/50 rounded-xl border border-white/10 text-sm font-mono font-medium text-zinc-400 shadow-inner">
                          {(() => {
                            if (!download.created_at) return '-';
                            const d = new Date(download.created_at);
                            return !isNaN(d.getTime()) ? formatDistanceToNow(d, { addSuffix: true }) : '-';
                          })()}
                      </div>
                   </div>
                   <div className="space-y-3">
                      <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2.5"><ShieldCheck className="w-4 h-4 text-zinc-400"/> Integrity Status</Label>
                      <div className="p-3.5 flex items-center gap-3 bg-zinc-900/50 rounded-xl border border-white/10 text-sm font-semibold text-zinc-300 shadow-inner">
                          {download.status === 'Completed' ? <><CheckCircle2 className="w-4 h-4 text-emerald-400"/> Verified</> : <><AlertTriangle className="w-4 h-4 text-amber-400"/> Pending Hash</>}
                      </div>
                   </div>
               </div>

             </div>
          </div>
          
          {/* Footer Ribbon */}
          <div className="bg-zinc-950/80 border-t border-white/5 p-5 flex justify-between items-center z-20 shrink-0">
              <span className="text-[11px] font-mono text-zinc-500 ml-2 tracking-wide font-medium">UUID: {download.id}</span>
              <Button variant="outline" onClick={onClose} className="px-8 h-11 font-semibold rounded-xl bg-transparent border-white/10 hover:bg-white/5 text-zinc-300 transition-all">Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
