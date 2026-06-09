import { create } from 'zustand';
import { load, Store } from '@tauri-apps/plugin-store';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { homeDir } from '@tauri-apps/api/path';

let store: Store | null = null;

async function getStore() {
    if (!store) {
        store = await load('settings.json');
    }
    return store;
}

let _homeDir: string | null = null;
async function getHomeDir(): Promise<string> {
    if (!_homeDir) {
        _homeDir = await homeDir();
    }
    return _homeDir;
}

function resolveTilde(path: string): string {
    if (path.startsWith('~/')) {
        return path.replace(/^~/, _homeDir || '');
    }
    return path;
}

const pathKeys: Array<keyof SettingsState> = [
    'pathGeneral',
    'pathCompressed',
    'pathDocuments',
    'pathMusic',
    'pathPrograms',
    'pathVideo',
];

export type QualityPreset = 'best' | 'good' | 'normal' | 'bad' | 'worst';

export interface SettingsState {
    launchOnStartup: boolean;
    osClipboard: boolean;
    connectionProfile: string;
    maxConnections: string;
    speedLimit: string;
    pathGeneral: string;
    pathCompressed: string;
    pathDocuments: string;
    pathMusic: string;
    pathPrograms: string;
    pathVideo: string;
    proxyType: string;
    proxyHost: string;
    proxyPort: string;
    proxyUsername: string;
    proxyPassword: string;
    extensions: string;
    osNotifications: boolean;
    forceDarkMode: boolean;
    dhtTracker: boolean;
    verboseSocket: boolean;
    defaultStreamFormat: string;
    browserForCookies: string;
    cookiesPath: string;
    streamQualityPreset: QualityPreset;
    streamEmbedSubs: boolean;
    streamEmbedThumbnail: boolean;
    streamEmbedMetadata: boolean;
    streamEmbedChapters: boolean;
    cloudMirroringEnabled: boolean;
    cloudMirroringProvider: string;
    cloudAccessToken: string;
    cloudFolderId: string;
    language: string;
    autoCheckUpdates: boolean;
    updateEndpoint: string;
    updatePublicKey: string;
    smartSortingEnabled: boolean;
    avScanEnabled: boolean;
    debridApiKey: string;
    adultSitesEnabled: boolean;
    adultAgeVerified: boolean;
    // PHASE 2.2: Scheduler
    schedulerEnabled: boolean;
    // PHASE 2.3: Watch folder
    watchFolderPath: string;
    watchFolderAutoAdd: boolean;
    watchFolderCategory: string;
    // PHASE 4.1: Bandwidth profile
    bandwidthProfileEnabled: boolean;
    bandwidthDefaultLimitKbps: number;
    bandwidthRules: Array<{ dayOfWeek: number; startHour: number; endHour: number; limitKbps: number }>;
    // PHASE 4.4: VirusTotal
    virustotalApiKey: string;
    virustotalAutoScan: boolean;
    virustotalThreatThreshold: number;
    // PHASE 5.2: Settings backup
    autoBackupEnabled: boolean;
    // PHASE 5.4: Theme
    themeAccent: string;
    themeFontSize: string;
    themeBorderRadius: string;
    themeCompactMode: boolean;
    themeBackgroundDensity: string;
    // PHASE 2.1: Queue
    autoPrioritize: boolean;
}

const defaultSettings: SettingsState = {
    launchOnStartup: false,
    osClipboard: true,
    connectionProfile: 'highspeed',
    maxConnections: '16',
    speedLimit: '0',
    pathGeneral: '~/Downloads/',
    pathCompressed: '~/Downloads/Compressed',
    pathDocuments: '~/Downloads/Documents',
    pathMusic: '~/Downloads/Music',
    pathPrograms: '~/Downloads/Programs',
    pathVideo: '~/Downloads/Video',
    proxyType: 'none',
    proxyHost: '',
    proxyPort: '1080',
    proxyUsername: '',
    proxyPassword: '',
    extensions: '3GP 7Z AAC ACE APE ARJ ASF AVI BIN BZ2 EXE GZ GZIP IMG ISO LZH M4A M4V MKV MOV MP3 MP4 MPA MPE MPEG MPG MSI MSU OGG OGM OGV PDF PLJ PPT PPTX QT R0* R1* RA RAR RM RMVB SEA SIT SITX TAR TIF TIFF WMA WMV Z ZIP',
    osNotifications: true,
    forceDarkMode: false,
    dhtTracker: true,
    verboseSocket: false,
    defaultStreamFormat: 'bestvideo+bestaudio/best',
    browserForCookies: 'none',
    cookiesPath: '',
    streamQualityPreset: 'best',
    streamEmbedSubs: true,
    streamEmbedThumbnail: true,
    streamEmbedMetadata: true,
    streamEmbedChapters: true,
    cloudMirroringEnabled: false,
    cloudMirroringProvider: 'google_drive',
    cloudAccessToken: '',
    cloudFolderId: '',
    language: 'en',
    autoCheckUpdates: false,
    updateEndpoint: '',
    updatePublicKey: '',
    smartSortingEnabled: true,
    avScanEnabled: true,
    debridApiKey: '',
    adultSitesEnabled: false,
    adultAgeVerified: false,
    schedulerEnabled: false,
    watchFolderPath: '',
    watchFolderAutoAdd: true,
    watchFolderCategory: 'General',
    bandwidthProfileEnabled: false,
    bandwidthDefaultLimitKbps: 0,
    bandwidthRules: [],
    virustotalApiKey: '',
    virustotalAutoScan: false,
    virustotalThreatThreshold: 3,
    autoBackupEnabled: false,
    themeAccent: 'indigo',
    themeFontSize: 'default',
    themeBorderRadius: 'none',
    themeCompactMode: false,
    autoPrioritize: true,
    themeBackgroundDensity: 'default',
};

interface SettingsStore extends SettingsState {
    loadSettings: () => Promise<void>;
    saveSettings: (newSettings: Partial<SettingsState>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
    ...defaultSettings,
    loadSettings: async () => {
        try {
            const storeInstance = await getStore();
            const keys = Object.keys(defaultSettings) as Array<keyof SettingsState>;
            const loadedData: Partial<SettingsState> = {};

            for (const key of keys) {
                const val = await storeInstance.get<any>(key);
                if (val !== null && val !== undefined) {
                    (loadedData as any)[key] = val;
                }
            }

            // Sync with actual OS autostart state
            try {
                loadedData.launchOnStartup = await isEnabled();
            } catch (e) {
                console.error("Failed to read autostart status", e);
            }

            // Resolve ~ to actual home directory for path settings
            await getHomeDir();
            for (const key of pathKeys) {
                const current = (loadedData as any)[key] !== undefined ? (loadedData as any)[key] : (defaultSettings as any)[key];
                if (typeof current === 'string') {
                    const resolved = resolveTilde(current);
                    (loadedData as any)[key] = resolved;
                }
            }

            loadedData.language = (loadedData.language as string) || defaultSettings.language;
            loadedData.autoCheckUpdates = loadedData.autoCheckUpdates ?? defaultSettings.autoCheckUpdates;
            loadedData.updateEndpoint = (loadedData.updateEndpoint as string) || defaultSettings.updateEndpoint;
            loadedData.updatePublicKey = (loadedData.updatePublicKey as string) || defaultSettings.updatePublicKey;
            loadedData.smartSortingEnabled = loadedData.smartSortingEnabled ?? defaultSettings.smartSortingEnabled;
            loadedData.avScanEnabled = loadedData.avScanEnabled ?? defaultSettings.avScanEnabled;
            loadedData.debridApiKey = (loadedData.debridApiKey as string) || defaultSettings.debridApiKey;
            loadedData.adultSitesEnabled = loadedData.adultSitesEnabled ?? defaultSettings.adultSitesEnabled;
            loadedData.adultAgeVerified = loadedData.adultAgeVerified ?? defaultSettings.adultAgeVerified;

            // Force theme to square corners (the Corner Roundness option has been removed)
            loadedData.themeBorderRadius = 'none';

            set(loadedData);

            // Persist the reset so it sticks across launches
            try {
                const storeInstance = await getStore();
                await storeInstance.set('themeBorderRadius', 'none');
                await storeInstance.save();
            } catch (e) {
                console.error('Failed to persist reset of themeBorderRadius', e);
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    },
    saveSettings: async (newSettings: Partial<SettingsState>) => {
        try {
            const prevState = get();
            // Resolve ~ to actual home directory for path settings
            await getHomeDir();
            const resolvedSettings = { ...newSettings };
            for (const key of pathKeys) {
                if (typeof (resolvedSettings as any)[key] === 'string') {
                    (resolvedSettings as any)[key] = resolveTilde((resolvedSettings as any)[key]);
                }
            }
            if (newSettings.language !== undefined) resolvedSettings.language = newSettings.language;
            if (newSettings.autoCheckUpdates !== undefined) resolvedSettings.autoCheckUpdates = newSettings.autoCheckUpdates;
            if (newSettings.updateEndpoint !== undefined) resolvedSettings.updateEndpoint = newSettings.updateEndpoint;
            if (newSettings.updatePublicKey !== undefined) resolvedSettings.updatePublicKey = newSettings.updatePublicKey;
            if (newSettings.smartSortingEnabled !== undefined) resolvedSettings.smartSortingEnabled = newSettings.smartSortingEnabled;
            if (newSettings.avScanEnabled !== undefined) resolvedSettings.avScanEnabled = newSettings.avScanEnabled;
            if (newSettings.debridApiKey !== undefined) resolvedSettings.debridApiKey = newSettings.debridApiKey;
            if (newSettings.adultSitesEnabled !== undefined) resolvedSettings.adultSitesEnabled = newSettings.adultSitesEnabled;
            if (newSettings.adultAgeVerified !== undefined) resolvedSettings.adultAgeVerified = newSettings.adultAgeVerified;
            set(resolvedSettings);
            const storeInstance = await getStore();
            // Only persist keys that were actually provided in newSettings,
            // otherwise the Tauri plugin-store's `set` command rejects `undefined`.
            for (const [key, value] of Object.entries(newSettings)) {
                if (value !== undefined) {
                    await storeInstance.set(key, value);
                }
            }
            await storeInstance.save();

            await import('@tauri-apps/api/core').then(({ invoke }) => {
                return invoke('save_runtime_settings', {
                    settings: {
                        cloudMirroringEnabled: newSettings.cloudMirroringEnabled,
                        cloudMirroringProvider: newSettings.cloudMirroringProvider,
                        cloudAccessToken: newSettings.cloudAccessToken,
                        cloudFolderId: newSettings.cloudFolderId,
                        language: newSettings.language,
                        autoCheckUpdates: newSettings.autoCheckUpdates,
                        updateEndpoint: newSettings.updateEndpoint,
                        updatePublicKey: newSettings.updatePublicKey,
                        smartSortingEnabled: newSettings.smartSortingEnabled,
                        avScanEnabled: newSettings.avScanEnabled,
                        debridApiKey: newSettings.debridApiKey,
                    }
                });
            });
            
            // Handle autostart logic
            if (newSettings.launchOnStartup !== undefined && newSettings.launchOnStartup !== prevState.launchOnStartup) {
                try {
                    if (newSettings.launchOnStartup) {
                        await enable();
                    } else {
                        await disable();
                    }
                } catch (e) {
                    console.error("Failed to toggle autostart", e);
                    // Revert UI state if it fails
                    set({ launchOnStartup: prevState.launchOnStartup });
                }
            }
        } catch (err) {
            console.error('Failed to save settings:', err);
        }
    },
}));
