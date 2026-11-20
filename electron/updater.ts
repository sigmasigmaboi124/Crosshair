import { app, BrowserWindow, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type UpdateChannel = 'both' | 'releases' | 'commits';

export interface BuildMeta {
  version: string;
  commitSha: string;
  shortSha: string;
  commitMessage: string;
  branch: string;
  builtAt: string;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
}

export interface RemoteReleaseInfo {
  tag: string;
  name: string;
  version: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
  prerelease: boolean;
  assetsCount: number;
}

export interface RemoteCommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
}

export interface UpdaterState {
  status:
    | 'idle'
    | 'checking'
    | 'up-to-date'
    | 'update-available'
    | 'downloading'
    | 'downloaded'
    | 'building-commit'
    | 'error';
  channel: UpdateChannel;
  autoCheck: boolean;
  autoDownload: boolean;
  checkIntervalMinutes: number;
  isPackaged: boolean;
  hasLocalGit: boolean;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  branch: string;
  currentVersion: string;
  currentCommitSha: string;
  currentShortSha: string;
  builtAt: string;
  latestRelease: RemoteReleaseInfo | null;
  latestCommit: RemoteCommitInfo | null;
  recentCommits: RemoteCommitInfo[];
  updateAvailableKind: 'none' | 'release' | 'commit' | 'both';
  canAutoInstallBinary: boolean;
  canPullCommitLocally: boolean;
  downloadProgress: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  } | null;
  commitSyncStep: string | null;
  lastCheckedAt: number | null;
  error: string | null;
}

const DEFAULT_META: BuildMeta = {
  version: app.getVersion() || '1.0.0',
  commitSha: 'local-dev',
  shortSha: 'local',
  commitMessage: '',
  branch: 'main',
  builtAt: new Date().toISOString(),
  repoOwner: 'sigmasigmaboi124',
  repoName: 'Crosshair',
  repoUrl: 'https://github.com/sigmasigmaboi124/Crosshair',
};

function loadBuildMeta(): BuildMeta {
  const candidates = [
    path.join(__dirname, 'build-meta.json'),
    path.join(process.resourcesPath || '', 'build-meta.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return { ...DEFAULT_META, ...JSON.parse(fs.readFileSync(p, 'utf-8')) };
      }
    } catch {
      // ignore
    }
  }
  return DEFAULT_META;
}

function compareSemver(a: string, b: string): number {
  const clean = (v: string) => v.replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pa = clean(a);
  const pb = clean(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export class AppAutoUpdater {
  private meta: BuildMeta;
  private state: UpdaterState;
  private getWindow: () => BrowserWindow | null;
  private onBeforeInstall?: () => void;
  private timer: NodeJS.Timeout | null = null;
  private commitsEtag: string | null = null;
  private releasesEtag: string | null = null;
  private workspaceDir: string;

  constructor(getWindow: () => BrowserWindow | null, onBeforeInstall?: () => void) {
    this.getWindow = getWindow;
    this.onBeforeInstall = onBeforeInstall;
    this.meta = loadBuildMeta();
    this.workspaceDir = path.resolve(__dirname, '..');
    const hasLocalGit = !app.isPackaged && fs.existsSync(path.join(this.workspaceDir, '.git'));

    this.state = {
      status: 'idle',
      channel: 'both',
      autoCheck: true,
      autoDownload: true,
      checkIntervalMinutes: 30,
      isPackaged: app.isPackaged,
      hasLocalGit,
      repoOwner: this.meta.repoOwner,
      repoName: this.meta.repoName,
      repoUrl: this.meta.repoUrl,
      branch: this.meta.branch || 'main',
      currentVersion: app.getVersion() || this.meta.version,
      currentCommitSha: this.meta.commitSha,
      currentShortSha: this.meta.shortSha,
      builtAt: this.meta.builtAt,
      latestRelease: null,
      latestCommit: null,
      recentCommits: [],
      updateAvailableKind: 'none',
      canAutoInstallBinary: false,
      canPullCommitLocally: false,
      downloadProgress: null,
      commitSyncStep: null,
      lastCheckedAt: null,
      error: null,
    };

    this.configureElectronUpdater();
  }

  private emit(): void {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:state', this.state);
    }
  }

  public getState(): UpdaterState {
    return this.state;
  }

  private configureElectronUpdater(): void {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = this.state.channel !== 'releases';

    autoUpdater.setFeedURL({
      provider: 'github',
      owner: this.meta.repoOwner,
      repo: this.meta.repoName,
      releaseType: this.state.channel === 'releases' ? 'release' : 'prerelease',
    });

    autoUpdater.on('update-available', (info) => {
      this.state.canAutoInstallBinary = true;
      this.state.status = 'update-available';
      this.state.error = null;
      if (!this.state.latestRelease) {
        this.state.latestRelease = {
          tag: `v${info.version}`,
          name: info.releaseName || `v${info.version}`,
          version: info.version,
          body: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
          publishedAt: info.releaseDate || new Date().toISOString(),
          htmlUrl: `${this.meta.repoUrl}/releases`,
          prerelease: info.version.includes('-'),
          assetsCount: info.files?.length ?? 1,
        };
      }
      this.emit();

      if (this.state.autoDownload && app.isPackaged) {
        this.downloadUpdate().catch(() => {});
      }
    });

    autoUpdater.on('download-progress', (p) => {
      this.state.status = 'downloading';
      this.state.downloadProgress = {
        percent: Math.round(p.percent * 10) / 10,
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      };
      this.emit();
    });

    autoUpdater.on('update-downloaded', () => {
      this.state.status = 'downloaded';
      this.state.downloadProgress = { percent: 100, bytesPerSecond: 0, transferred: 1, total: 1 };
      this.emit();
    });

    autoUpdater.on('error', (err) => {
      // Do not clobber a valid commit-only check if no binary release exists on GitHub yet
      const msg = err?.message || String(err);
      if (/404|No published versions|Cannot find latest\.yml/i.test(msg)) {
        this.state.canAutoInstallBinary = false;
        this.emit();
        return;
      }
      this.state.error = msg;
      this.emit();
    });
  }

  public updateSettings(patch: {
    channel?: UpdateChannel;
    autoCheck?: boolean;
    autoDownload?: boolean;
    checkIntervalMinutes?: number;
  }): void {
    if (patch.channel) this.state.channel = patch.channel;
    if (typeof patch.autoCheck === 'boolean') this.state.autoCheck = patch.autoCheck;
    if (typeof patch.autoDownload === 'boolean') this.state.autoDownload = patch.autoDownload;
    if (typeof patch.checkIntervalMinutes === 'number') {
      this.state.checkIntervalMinutes = Math.max(5, Math.min(1440, patch.checkIntervalMinutes));
    }

    autoUpdater.allowPrerelease = this.state.channel !== 'releases';
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: this.meta.repoOwner,
      repo: this.meta.repoName,
      releaseType: this.state.channel === 'releases' ? 'release' : 'prerelease',
    });

    this.schedulePeriodicCheck();
    this.emit();
  }

  public start(): void {
    this.schedulePeriodicCheck();
    if (this.state.autoCheck) {
      setTimeout(() => {
        this.checkForUpdates().catch(() => {});
      }, 5000);
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedulePeriodicCheck(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.state.autoCheck) return;
    const ms = Math.max(5, this.state.checkIntervalMinutes) * 60 * 1000;
    this.timer = setInterval(() => {
      this.checkForUpdates().catch(() => {});
    }, ms);
  }

  private async fetchGitHubJson<T>(url: string, etag: string | null): Promise<{ status: number; data: T | null; etag: string | null }> {
    const headers: Record<string, string> = {
      'User-Agent': `ZeroPoint/${this.state.currentVersion}`,
      Accept: 'application/vnd.github+json',
    };
    if (etag) headers['If-None-Match'] = etag;

    const resp = await fetch(url, { headers });
    const nextEtag = resp.headers.get('etag');
    if (resp.status === 304) {
      return { status: 304, data: null, etag: nextEtag ?? etag };
    }
    if (!resp.ok) {
      return { status: resp.status, data: null, etag: nextEtag };
    }
    const data = (await resp.json()) as T;
    return { status: resp.status, data, etag: nextEtag };
  }

  public async checkForUpdates(): Promise<UpdaterState> {
    if (this.state.status === 'downloading' || this.state.status === 'building-commit') {
      return this.state;
    }

    this.state.status = 'checking';
    this.state.error = null;
    this.emit();

    const baseApi = `https://api.github.com/repos/${this.meta.repoOwner}/${this.meta.repoName}`;
    let hasNewRelease = false;
    let hasNewCommit = false;

    try {
      // 1. Check GitHub Releases (Stable + optional Commit Pre-Releases)
      if (this.state.channel === 'releases' || this.state.channel === 'both' || this.state.channel === 'commits') {
        const relResp = await this.fetchGitHubJson<
          Array<{
            tag_name: string;
            name: string;
            body: string;
            published_at: string;
            html_url: string;
            prerelease: boolean;
            draft: boolean;
            assets?: unknown[];
          }>
        >(`${baseApi}/releases?per_page=10`, this.releasesEtag);

        if (relResp.status === 200 && Array.isArray(relResp.data)) {
          this.releasesEtag = relResp.etag;
          const eligible = relResp.data.filter((r) => !r.draft && (this.state.channel !== 'releases' || !r.prerelease));
          const top = eligible[0];
          if (top) {
            const cleanVer = top.tag_name.replace(/^v/i, '');
            this.state.latestRelease = {
              tag: top.tag_name,
              name: top.name || top.tag_name,
              version: cleanVer,
              body: top.body || '',
              publishedAt: top.published_at,
              htmlUrl: top.html_url,
              prerelease: top.prerelease,
              assetsCount: top.assets?.length ?? 0,
            };
          }
        }

        if (this.state.latestRelease) {
          const cmp = compareSemver(this.state.latestRelease.version, this.state.currentVersion);
          const isNewerTag = cmp > 0 || (this.state.latestRelease.prerelease && this.state.latestRelease.version !== this.state.currentVersion && this.state.channel !== 'releases');
          if (isNewerTag) {
            hasNewRelease = true;
          }
        }
      }

      // 2. Check GitHub Commits on main branch
      if (this.state.channel === 'commits' || this.state.channel === 'both') {
        const comResp = await this.fetchGitHubJson<
          Array<{
            sha: string;
            html_url: string;
            commit: {
              message: string;
              author?: { name?: string; date?: string };
            };
            author?: { login?: string };
          }>
        >(`${baseApi}/commits?sha=${encodeURIComponent(this.state.branch)}&per_page=5`, this.commitsEtag);

        if (comResp.status === 200 && Array.isArray(comResp.data)) {
          this.commitsEtag = comResp.etag;
          const mapped: RemoteCommitInfo[] = comResp.data.map((c) => ({
            sha: c.sha,
            shortSha: c.sha.slice(0, 7),
            message: (c.commit?.message || '').split('\n')[0],
            author: c.author?.login || c.commit?.author?.name || 'unknown',
            date: c.commit?.author?.date || '',
            htmlUrl: c.html_url,
          }));
          this.state.recentCommits = mapped;
          this.state.latestCommit = mapped[0] ?? null;
        }

        if (this.state.latestCommit) {
          const localSha = await this.getLiveLocalCommitSha();
          if (localSha) {
            this.state.currentCommitSha = localSha;
            this.state.currentShortSha = localSha.slice(0, 7);
          }
          if (
            this.state.currentCommitSha &&
            this.state.currentCommitSha !== 'local-dev' &&
            this.state.latestCommit.sha !== this.state.currentCommitSha
          ) {
            hasNewCommit = true;
          } else if (this.state.currentCommitSha === 'local-dev') {
            hasNewCommit = true;
          }
        }
      }

      // 3. If running as packaged Windows .exe, ask electron-updater to inspect latest.yml for binary auto-install
      if (app.isPackaged) {
        try {
          const result = await autoUpdater.checkForUpdates();
          if (result?.updateInfo?.version && result.updateInfo.version !== this.state.currentVersion) {
            this.state.canAutoInstallBinary = true;
            hasNewRelease = true;
          }
        } catch {
          // Silently handled — repo may not have a published binary release yet
        }
      }

      this.state.canPullCommitLocally = !app.isPackaged && this.state.hasLocalGit && hasNewCommit;
      this.state.lastCheckedAt = Date.now();
      const liveStatus = this.state.status as UpdaterState['status'];

      if (hasNewRelease && hasNewCommit) {
        this.state.updateAvailableKind = 'both';
        this.state.status = liveStatus === 'downloaded' ? 'downloaded' : 'update-available';
      } else if (hasNewRelease) {
        this.state.updateAvailableKind = 'release';
        this.state.status = liveStatus === 'downloaded' ? 'downloaded' : 'update-available';
      } else if (hasNewCommit) {
        this.state.updateAvailableKind = 'commit';
        this.state.status = 'update-available';
      } else {
        this.state.updateAvailableKind = 'none';
        this.state.status = 'up-to-date';
      }
    } catch (err) {
      this.state.status = 'error';
      this.state.error = err instanceof Error ? err.message : 'Unable to reach GitHub.';
      this.state.lastCheckedAt = Date.now();
    }

    this.emit();
    return this.state;
  }

  private getLiveLocalCommitSha(): Promise<string | null> {
    if (!this.state.hasLocalGit) return Promise.resolve(null);
    return new Promise((resolve) => {
      execFile('git', ['rev-parse', 'HEAD'], { cwd: this.workspaceDir }, (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout.trim() || null);
      });
    });
  }

  public async downloadUpdate(): Promise<void> {
    if (app.isPackaged && this.state.canAutoInstallBinary) {
      this.state.status = 'downloading';
      this.state.error = null;
      this.emit();
      try {
        await autoUpdater.downloadUpdate();
      } catch (err) {
        this.state.status = 'error';
        this.state.error = err instanceof Error ? err.message : 'Download failed.';
        this.emit();
      }
      return;
    }

    if (this.state.canPullCommitLocally) {
      await this.pullCommitAndRebuild();
      return;
    }

    // Fallback: open latest release or commit page on GitHub
    const url = this.state.latestRelease?.htmlUrl || this.state.latestCommit?.htmlUrl || `${this.meta.repoUrl}/releases`;
    shell.openExternal(url).catch(() => {});
  }

  public installDownloadedUpdate(): void {
    if (app.isPackaged && this.state.status === 'downloaded') {
      this.onBeforeInstall?.();
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 250);
    }
  }

  private runCmd(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: this.workspaceDir,
        shell: true,
        windowsHide: true,
      });
      let errText = '';
      child.stderr.on('data', (d) => (errText += d.toString()));
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(errText.trim() || `${cmd} ${args.join(' ')} exited with code ${code}`));
      });
    });
  }

  public async pullCommitAndRebuild(): Promise<void> {
    if (app.isPackaged || !this.state.hasLocalGit) return;
    this.state.status = 'building-commit';
    this.state.error = null;
    try {
      this.state.commitSyncStep = `Fetching latest commits from ${this.meta.repoOwner}/${this.meta.repoName}...`;
      this.emit();
      await this.runCmd('git', ['fetch', 'origin', this.state.branch]);

      this.state.commitSyncStep = `Pulling origin/${this.state.branch} (fast-forward)...`;
      this.emit();
      await this.runCmd('git', ['pull', '--ff-only', 'origin', this.state.branch]);

      this.state.commitSyncStep = 'Rebuilding WinBridge, Electron & Studio UI...';
      this.emit();
      await this.runCmd('npm', ['run', 'build']);

      this.state.commitSyncStep = 'Update ready — relaunching ZeroPoint...';
      this.emit();

      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 800);
    } catch (err) {
      this.state.status = 'error';
      this.state.commitSyncStep = null;
      this.state.error = err instanceof Error ? err.message : 'Git pull/rebuild failed.';
      this.emit();
    }
  }

  public openExternalUrl(url?: string): void {
    const target = url && url.startsWith('https://github.com/') ? url : this.meta.repoUrl;
    shell.openExternal(target).catch(() => {});
  }
}
