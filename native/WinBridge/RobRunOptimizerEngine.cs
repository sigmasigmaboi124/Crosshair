using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32;

namespace WinBridge;

public sealed class RobRunOptimizerConfigDto
{
    public bool autoOptimizeOnLaunch { get; set; } = true;
    public bool autoRestoreDesktopOnExit { get; set; } = true;
    public string targetProcessName { get; set; } = "ROB RUN.exe";
    public string steamAppId { get; set; } = "4262460";
    public string customInstallDir { get; set; } = "";
    public int targetMonitorIndex { get; set; } = 0;

    // Competitive Graphics Tweaks (ROB RUN settings_steam_*.dat)
    public string preset { get; set; } = "competitive";
    public string grassQuality { get; set; } = "low";             // "low" | "medium" | "high"
    public string grassDistance { get; set; } = "low";            // "low" | "medium" | "high"
    public string shadows { get; set; } = "disabled";             // "disabled" | "low" | "medium" | "high"
    public bool hbao { get; set; } = false;
    public bool reflections { get; set; } = false;
    public bool depthOfField { get; set; } = false;
    public bool autoExposure { get; set; } = false;
    public string waterQuality { get; set; } = "minimum";         // "minimum" | "low" | "medium"
    public string antiAliasing { get; set; } = "disabled";        // "disabled" | "fxaa" | "smaa" | "taa"
    public float lodBias { get; set; } = 0.8f;                    // 0.5 .. 2.0 (Render detail distance)
    public string cullingDistance { get; set; } = "low";          // "low" | "medium" | "high"
    public float renderScale { get; set; } = 1.0f;                // 0.5 .. 1.0
    public int textureMipmapLimit { get; set; } = 2;              // 0 = Full, 1 = Half, 2 = Quarter (Max FPS)
    public int anisotropicFiltering { get; set; } = 0;            // 0 | 2 | 4 | 8 | 16
    public int vramBudgetMb { get; set; } = 2048;                 // 1024 .. 4096
    public bool showFpsCounter { get; set; } = true;

    // Stretched Res + Refresh Rate + GPU
    public bool applyStretchedDisplayOnLaunch { get; set; } = true;
    public int resWidth { get; set; } = 1440;
    public int resHeight { get; set; } = 1080;
    public int refreshRateHz { get; set; } = 240;
    public int fullscreenMode { get; set; } = 1;                  // 1 = Borderless Fullscreen (Crosshair Compatible), 0 = Exclusive
    public bool gpuHighPerformance { get; set; } = true;

    // Launch Flags & Config Lock
    public bool lockConfigReadOnly { get; set; } = true;
    public bool flagNoLog { get; set; } = true;
    public bool flagBorderless { get; set; } = true;
    public bool flagForceD3d11 { get; set; } = false;
    public string extraLaunchFlags { get; set; } = "";
}

public sealed class DisplayModeOptionDto
{
    public int width { get; set; }
    public int height { get; set; }
    public int maxHz { get; set; }
    public string aspectLabel { get; set; } = "";
}

internal static class RobRunOptimizerEngine
{
    private const string ROBRUN_REG_KEY = @"Software\Kefir\ROB RUN";
    private const string GPU_PREFS_REG_KEY = @"Software\Microsoft\DirectX\UserGpuPreferences";

    private static readonly object _lock = new();
    private static RobRunOptimizerConfigDto _config = new();
    private static string _backupFilePath = "";
    private static Action<object>? _emitCallback;
    private static Action? _refreshMonitorsCallback;
    private static Func<int, string?>? _resolveMonitorDeviceCallback;

    private static volatile bool _running = false;
    private static Thread? _watchThread;

    private static bool _displayOverridden = false;
    private static string _overriddenDeviceName = "";
    private static DEVMODEW _savedDesktopDevMode;
    private static bool _hasSavedDesktopMode = false;
    private static bool _wasGameRunning = false;

    public static void Start(
        string stateFilePath,
        Action<object> emitCallback,
        Action refreshMonitorsCallback,
        Func<int, string?> resolveMonitorDeviceCallback)
    {
        _emitCallback = emitCallback;
        _refreshMonitorsCallback = refreshMonitorsCallback;
        _resolveMonitorDeviceCallback = resolveMonitorDeviceCallback;

        if (!string.IsNullOrWhiteSpace(stateFilePath))
        {
            string? dir = Path.GetDirectoryName(stateFilePath);
            if (!string.IsNullOrEmpty(dir))
                _backupFilePath = Path.Combine(dir, "robrun-original-backup.json");
        }
        if (string.IsNullOrEmpty(_backupFilePath))
        {
            _backupFilePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "zeropoint",
                "robrun-original-backup.json");
        }

        if (_running) return;
        _running = true;
        _watchThread = new Thread(ProcessWatcherLoop)
        {
            IsBackground = true,
            Name = "ZeroPointRobRunWatcher"
        };
        _watchThread.Start();
    }

    public static void Stop()
    {
        _running = false;
        try { _watchThread?.Join(300); } catch { }
        RestoreDesktopDisplayNow();
    }

    public static void SetBackupDirFromStatePath(string stateFilePath)
    {
        if (string.IsNullOrWhiteSpace(stateFilePath)) return;
        string? dir = Path.GetDirectoryName(stateFilePath);
        if (!string.IsNullOrEmpty(dir))
        {
            lock (_lock)
            {
                _backupFilePath = Path.Combine(dir, "robrun-original-backup.json");
            }
        }
    }

    public static void UpdateConfig(RobRunOptimizerConfigDto next)
    {
        lock (_lock)
        {
            _config = next;
        }
    }

    public static object BuildStatusPayload()
    {
        RobRunOptimizerConfigDto cfg;
        lock (_lock) { cfg = _config; }

        string? installDir = ResolveInstallDir(cfg.customInstallDir);
        string? exePath = !string.IsNullOrEmpty(installDir) ? Path.Combine(installDir, "ROB RUN.exe") : null;
        var settingsFiles = FindSettingsFiles();
        bool hasBackup = !string.IsNullOrEmpty(_backupFilePath) && File.Exists(_backupFilePath);
        bool isRunning = IsTargetProcessRunning(cfg.targetProcessName, out int runningPid);

        // Read live summary from ROB RUN settings file if present
        object? liveConfigSummary = null;
        if (settingsFiles.Count > 0)
        {
            try
            {
                var node = JsonNode.Parse(File.ReadAllText(settingsFiles[0])) as JsonObject;
                if (node != null)
                {
                    liveConfigSummary = new
                    {
                        resolution = node["resolution_setting"]?.GetValue<string>() ?? "",
                        grass = node["settings_grass"]?.GetValue<string>() ?? "",
                        shadows = node["cast_shadow_setting"]?.GetValue<string>() ?? "",
                        hbao = node["hbao_setting"]?.GetValue<bool>() ?? false,
                        reflections = node["screen_space_reflections_setting"]?.GetValue<bool>() ?? false,
                        depthOfField = node["depth_of_field"]?.GetValue<bool>() ?? false,
                        lodBias = node["lod_bias_setting"]?.GetValue<double>() ?? 1.0,
                        culling = node["renderers_culling_preset_id_setting"]?.GetValue<string>() ?? ""
                    };
                }
            }
            catch { }
        }

        string? monDevice = _resolveMonitorDeviceCallback?.Invoke(cfg.targetMonitorIndex);
        var supportedModes = CollectMonitorDisplayModes(monDevice);
        int desktopW = 0, desktopH = 0, desktopHz = 0;
        if (TryGetCurrentDisplayMode(monDevice, out var curDm))
        {
            desktopW = (int)curDm.dmPelsWidth;
            desktopH = (int)curDm.dmPelsHeight;
            desktopHz = (int)curDm.dmDisplayFrequency;
        }

        return new
        {
            type = "optimizerStatus",
            detectedInstallDir = installDir ?? "",
            detectedExePath = exePath ?? "",
            settingsFilePaths = settingsFiles,
            hasBackup,
            gameRunning = isRunning,
            gamePid = runningPid,
            displayStretchedActive = _displayOverridden,
            currentDesktopWidth = desktopW,
            currentDesktopHeight = desktopH,
            currentDesktopHz = desktopHz,
            launchFlagsString = BuildLaunchFlagsString(cfg),
            supportedModes,
            liveConfigSummary
        };
    }

    public static (bool ok, string message) ApplyConfigToDisk(RobRunOptimizerConfigDto cfg)
    {
        lock (_lock) { _config = cfg; }

        EnsureOriginalBackupSaved(cfg.customInstallDir);

        var settingsFiles = FindSettingsFiles();
        string? installDir = ResolveInstallDir(cfg.customInstallDir);
        string? exePath = !string.IsNullOrEmpty(installDir) ? Path.Combine(installDir, "ROB RUN.exe") : null;

        int patchedCount = 0;
        foreach (var file in settingsFiles)
        {
            try
            {
                // Unlock ReadOnly attribute first so we can cleanly write the competitive config
                var attrs = File.GetAttributes(file);
                if ((attrs & FileAttributes.ReadOnly) != 0)
                {
                    File.SetAttributes(file, attrs & ~FileAttributes.ReadOnly);
                }

                var parsed = JsonNode.Parse(File.ReadAllText(file)) as JsonObject ?? new JsonObject();
                parsed["setting_quality"] = "custom";
                parsed["settings_grass"] = cfg.grassQuality;
                parsed["grass_vibile_distance_factor_setting"] = cfg.grassDistance;
                parsed["cast_shadow_setting"] = cfg.shadows;
                parsed["hbao_setting"] = cfg.hbao;
                parsed["screen_space_reflections_setting"] = cfg.reflections;
                parsed["depth_of_field"] = cfg.depthOfField;
                parsed["auto_exposure_setting"] = cfg.autoExposure;
                parsed["settings_water"] = cfg.waterQuality;
                parsed["anti_aliasing_mode_id_setting"] = cfg.antiAliasing;
                parsed["lod_bias_setting"] = Math.Round(Math.Clamp(cfg.lodBias, 0.4f, 2.5f), 2);
                parsed["renderers_culling_preset_id_setting"] = cfg.cullingDistance;
                parsed["render_scale_setting"] = Math.Round(Math.Clamp(cfg.renderScale, 0.5f, 1.0f), 2);
                parsed["global_texture_mipmap_limit"] = Math.Clamp(cfg.textureMipmapLimit, 0, 3);
                parsed["anisotropic_filtering"] = cfg.anisotropicFiltering;
                parsed["streaming_mipmaps_memory_budget"] = Math.Clamp(cfg.vramBudgetMb, 512, 8192);
                parsed["fullscreen_setting"] = true;
                parsed["resolution_setting"] = $"{cfg.resWidth}x{cfg.resHeight}";
                parsed["performance_info_fps"] = cfg.showFpsCounter;

                File.WriteAllText(file, parsed.ToJsonString());

                if (cfg.lockConfigReadOnly)
                {
                    File.SetAttributes(file, File.GetAttributes(file) | FileAttributes.ReadOnly);
                }
                patchedCount++;
            }
            catch { }
        }

        // Sync Unity Screenmanager Registry specifically for ROB RUN
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(ROBRUN_REG_KEY, true);
            if (key != null)
            {
                key.SetValue("Screenmanager Resolution Width_h182942802", cfg.resWidth, RegistryValueKind.DWord);
                key.SetValue("Screenmanager Resolution Height_h2627697771", cfg.resHeight, RegistryValueKind.DWord);
                key.SetValue("Screenmanager Resolution Window Width_h2524650974", cfg.resWidth, RegistryValueKind.DWord);
                key.SetValue("Screenmanager Resolution Window Height_h1684712807", cfg.resHeight, RegistryValueKind.DWord);
                key.SetValue("Screenmanager Native RefreshRate Numerator_h4243137005", cfg.refreshRateHz, RegistryValueKind.DWord);
                key.SetValue("Screenmanager Native RefreshRate Denominator_h3121420550", 1, RegistryValueKind.DWord);
                key.SetValue("Screenmanager Fullscreen mode_h3630240806", cfg.fullscreenMode, RegistryValueKind.DWord);
                key.SetValue("Screenmanager Resolution Use Native_h1405027254", cfg.applyStretchedDisplayOnLaunch ? 0 : 1, RegistryValueKind.DWord);
            }
        }
        catch { }

        // Per-Process Windows GPU High Performance + Windowed Flip-Model Upgrade ONLY for ROB RUN.exe
        if (!string.IsNullOrEmpty(exePath) && File.Exists(exePath))
        {
            try
            {
                using var gpuKey = Registry.CurrentUser.CreateSubKey(GPU_PREFS_REG_KEY, true);
                if (gpuKey != null)
                {
                    if (cfg.gpuHighPerformance)
                    {
                        gpuKey.SetValue(exePath, "GpuPreference=2;SwapEffectUpgradeEnable=1;", RegistryValueKind.String);
                    }
                }
            }
            catch { }
        }

        if (patchedCount == 0)
        {
            return (true, "Saved ROB RUN registry & GPU settings (launch ROB RUN once to generate settings.dat).");
        }
        return (true, $"Applied competitive config to ROB RUN ({cfg.resWidth}×{cfg.resHeight} @ {cfg.refreshRateHz}Hz).");
    }

    public static (bool ok, string message) RestoreOriginalBackup()
    {
        RestoreDesktopDisplayNow();

        if (string.IsNullOrEmpty(_backupFilePath) || !File.Exists(_backupFilePath))
        {
            return (false, "No original backup recorded yet.");
        }

        try
        {
            var root = JsonNode.Parse(File.ReadAllText(_backupFilePath)) as JsonObject;
            if (root == null) return (false, "Backup file could not be parsed.");

            if (root["settingsFiles"] is JsonObject filesObj)
            {
                foreach (var kv in filesObj)
                {
                    string path = kv.Key;
                    string? rawContent = kv.Value?.GetValue<string>();
                    if (!string.IsNullOrEmpty(path) && rawContent != null)
                    {
                        string? dir = Path.GetDirectoryName(path);
                        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                        if (File.Exists(path))
                        {
                            var attrs = File.GetAttributes(path);
                            if ((attrs & FileAttributes.ReadOnly) != 0)
                                File.SetAttributes(path, attrs & ~FileAttributes.ReadOnly);
                        }
                        File.WriteAllText(path, rawContent);
                    }
                }
            }

            if (root["registry"] is JsonObject regObj)
            {
                using var key = Registry.CurrentUser.CreateSubKey(ROBRUN_REG_KEY, true);
                if (key != null)
                {
                    foreach (var kv in regObj)
                    {
                        if (kv.Value != null)
                        {
                            key.SetValue(kv.Key, kv.Value.GetValue<int>(), RegistryValueKind.DWord);
                        }
                    }
                }
            }

            string? origExe = root["exePath"]?.GetValue<string>();
            string? origGpuPref = root["origGpuPref"]?.GetValue<string>();
            if (!string.IsNullOrEmpty(origExe))
            {
                using var gpuKey = Registry.CurrentUser.OpenSubKey(GPU_PREFS_REG_KEY, true);
                if (gpuKey != null)
                {
                    if (string.IsNullOrEmpty(origGpuPref))
                        gpuKey.DeleteValue(origExe, false);
                    else
                        gpuKey.SetValue(origExe, origGpuPref, RegistryValueKind.String);
                }
            }

            return (true, "Restored ROB RUN's original graphics config, GPU preference, and desktop display.");
        }
        catch (Exception ex)
        {
            return (false, $"Restore failed: {ex.Message}");
        }
    }

    public static (bool ok, string message) LaunchRobRunOptimized(RobRunOptimizerConfigDto cfg)
    {
        ApplyConfigToDisk(cfg);

        if (cfg.applyStretchedDisplayOnLaunch)
        {
            ApplyStretchedDisplayForGame(cfg);
        }

        string flags = BuildLaunchFlagsString(cfg);
        string steamUri = string.IsNullOrWhiteSpace(flags)
            ? $"steam://rungameid/{cfg.steamAppId}"
            : $"steam://rungameid/{cfg.steamAppId}//{Uri.EscapeDataString(flags)}";

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = steamUri,
                UseShellExecute = true
            });
            return (true, $"Launching ROB RUN via Steam ({cfg.resWidth}×{cfg.resHeight} @ {cfg.refreshRateHz}Hz)...");
        }
        catch (Exception ex)
        {
            return (false, $"Failed to launch Steam URI: {ex.Message}");
        }
    }

    public static string BuildLaunchFlagsString(RobRunOptimizerConfigDto cfg)
    {
        var parts = new List<string>();
        if (cfg.flagBorderless)
        {
            parts.Add("-window-mode borderless");
        }
        parts.Add($"-screen-width {cfg.resWidth}");
        parts.Add($"-screen-height {cfg.resHeight}");
        if (cfg.flagNoLog) parts.Add("-nolog");
        if (cfg.flagForceD3d11) parts.Add("-force-d3d11");
        if (!string.IsNullOrWhiteSpace(cfg.extraLaunchFlags))
        {
            parts.Add(cfg.extraLaunchFlags.Trim());
        }
        return string.Join(" ", parts);
    }

    public static bool ApplyStretchedDisplayForGame(RobRunOptimizerConfigDto cfg)
    {
        string? devName = _resolveMonitorDeviceCallback?.Invoke(cfg.targetMonitorIndex);
        if (!_displayOverridden)
        {
            if (TryGetCurrentDisplayMode(devName, out var current))
            {
                _savedDesktopDevMode = current;
                _hasSavedDesktopMode = true;
                _overriddenDeviceName = devName ?? "";
            }
        }

        if (!TryGetCurrentDisplayMode(devName, out var dm)) return false;

        // Already at desired stretched mode?
        if (dm.dmPelsWidth == cfg.resWidth && dm.dmPelsHeight == cfg.resHeight && dm.dmDisplayFrequency == cfg.refreshRateHz)
        {
            _displayOverridden = true;
            return true;
        }

        // Find closest supported refresh rate if exact Hz isn't listed for that stretched res
        int bestHz = FindBestSupportedRefreshRate(devName, cfg.resWidth, cfg.resHeight, cfg.refreshRateHz);

        dm.dmSize = (ushort)Marshal.SizeOf<DEVMODEW>();
        dm.dmPelsWidth = (uint)cfg.resWidth;
        dm.dmPelsHeight = (uint)cfg.resHeight;
        dm.dmDisplayFrequency = (uint)bestHz;
        dm.dmDisplayFixedOutput = 1; // DMDFO_STRETCH (Full-panel stretch, no black bars)
        dm.dmFields = DM_PELSWIDTH | DM_PELSHEIGHT | DM_DISPLAYFREQUENCY | DM_DISPLAYFIXEDOUTPUT;

        int res = string.IsNullOrEmpty(devName)
            ? ChangeDisplaySettingsExW(null, ref dm, IntPtr.Zero, CDS_FULLSCREEN, IntPtr.Zero)
            : ChangeDisplaySettingsExW(devName, ref dm, IntPtr.Zero, CDS_FULLSCREEN, IntPtr.Zero);

        if (res != 0)
        {
            // Fallback without DM_DISPLAYFIXEDOUTPUT if GPU handles scaling in driver panel
            dm.dmFields = DM_PELSWIDTH | DM_PELSHEIGHT | DM_DISPLAYFREQUENCY;
            res = string.IsNullOrEmpty(devName)
                ? ChangeDisplaySettingsExW(null, ref dm, IntPtr.Zero, CDS_FULLSCREEN, IntPtr.Zero)
                : ChangeDisplaySettingsExW(devName, ref dm, IntPtr.Zero, CDS_FULLSCREEN, IntPtr.Zero);
        }

        if (res == 0)
        {
            _displayOverridden = true;
            _overriddenDeviceName = devName ?? "";
            _refreshMonitorsCallback?.Invoke();
            return true;
        }
        return false;
    }

    public static bool RestoreDesktopDisplayNow()
    {
        if (!_displayOverridden && !_hasSavedDesktopMode) return false;
        string? dev = string.IsNullOrEmpty(_overriddenDeviceName) ? null : _overriddenDeviceName;
        int res = -1;

        if (_hasSavedDesktopMode)
        {
            var restore = _savedDesktopDevMode;
            restore.dmSize = (ushort)Marshal.SizeOf<DEVMODEW>();
            restore.dmFields = DM_PELSWIDTH | DM_PELSHEIGHT | DM_DISPLAYFREQUENCY;
            res = ChangeDisplaySettingsExW(dev, ref restore, IntPtr.Zero, 0, IntPtr.Zero);
        }

        if (res != 0)
        {
            // Reset to Windows Registry saved desktop display mode
            res = ChangeDisplaySettingsExW(dev, IntPtr.Zero, IntPtr.Zero, 0, IntPtr.Zero);
        }

        _displayOverridden = false;
        _hasSavedDesktopMode = false;
        _refreshMonitorsCallback?.Invoke();
        return res == 0;
    }

    private static void ProcessWatcherLoop()
    {
        while (_running)
        {
            RobRunOptimizerConfigDto cfg;
            lock (_lock) { cfg = _config; }

            bool isRunning = IsTargetProcessRunning(cfg.targetProcessName, out int pid);

            if (isRunning && !_wasGameRunning)
            {
                _wasGameRunning = true;
                SystemTunerEngine.OnWatchedGameStarted();
                if (cfg.autoOptimizeOnLaunch)
                {
                    ApplyConfigToDisk(cfg);
                    if (cfg.applyStretchedDisplayOnLaunch)
                    {
                        ApplyStretchedDisplayForGame(cfg);
                    }
                }
                _emitCallback?.Invoke(BuildStatusPayload());
            }
            else if (!isRunning && _wasGameRunning)
            {
                _wasGameRunning = false;
                if (cfg.autoRestoreDesktopOnExit && _displayOverridden)
                {
                    RestoreDesktopDisplayNow();
                }
                _emitCallback?.Invoke(BuildStatusPayload());
            }

            Thread.Sleep(1000);
        }
    }

    private static bool IsTargetProcessRunning(string targetExeName, out int foundPid)
    {
        foundPid = 0;
        string procBase = (targetExeName ?? "ROB RUN").Trim();
        if (procBase.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            procBase = procBase[..^4];
        if (string.IsNullOrEmpty(procBase)) return false;

        try
        {
            var procs = Process.GetProcessesByName(procBase);
            foreach (var p in procs)
            {
                if (foundPid == 0 && p.Id > 4) foundPid = p.Id;
                p.Dispose();
            }
            return foundPid > 0;
        }
        catch
        {
            return false;
        }
    }

    private static void EnsureOriginalBackupSaved(string customInstallDir)
    {
        if (string.IsNullOrEmpty(_backupFilePath) || File.Exists(_backupFilePath)) return;

        try
        {
            var backupRoot = new JsonObject
            {
                ["createdAt"] = DateTime.UtcNow.ToString("O")
            };

            var filesNode = new JsonObject();
            foreach (var f in FindSettingsFiles())
            {
                try { filesNode[f] = File.ReadAllText(f); } catch { }
            }
            backupRoot["settingsFiles"] = filesNode;

            var regNode = new JsonObject();
            using (var key = Registry.CurrentUser.OpenSubKey(ROBRUN_REG_KEY, false))
            {
                if (key != null)
                {
                    string[] watchedReg =
                    {
                        "Screenmanager Resolution Width_h182942802",
                        "Screenmanager Resolution Height_h2627697771",
                        "Screenmanager Resolution Window Width_h2524650974",
                        "Screenmanager Resolution Window Height_h1684712807",
                        "Screenmanager Native RefreshRate Numerator_h4243137005",
                        "Screenmanager Native RefreshRate Denominator_h3121420550",
                        "Screenmanager Fullscreen mode_h3630240806",
                        "Screenmanager Resolution Use Native_h1405027254"
                    };
                    foreach (var valName in watchedReg)
                    {
                        object? val = key.GetValue(valName);
                        if (val is int iv) regNode[valName] = iv;
                    }
                }
            }
            backupRoot["registry"] = regNode;

            string? installDir = ResolveInstallDir(customInstallDir);
            if (!string.IsNullOrEmpty(installDir))
            {
                string exePath = Path.Combine(installDir, "ROB RUN.exe");
                backupRoot["exePath"] = exePath;
                using var gpuKey = Registry.CurrentUser.OpenSubKey(GPU_PREFS_REG_KEY, false);
                backupRoot["origGpuPref"] = gpuKey?.GetValue(exePath) as string ?? "";
            }

            string? dir = Path.GetDirectoryName(_backupFilePath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            File.WriteAllText(_backupFilePath, backupRoot.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }

    private static List<string> FindSettingsFiles()
    {
        var results = new List<string>();
        try
        {
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string settingsDir = Path.Combine(userProfile, "AppData", "LocalLow", "Kefir", "ROB RUN", "settings");
            if (Directory.Exists(settingsDir))
            {
                foreach (var f in Directory.GetFiles(settingsDir, "settings*.dat"))
                {
                    results.Add(f);
                }
            }
        }
        catch { }
        return results;
    }

    private static string? ResolveInstallDir(string customDir)
    {
        if (!string.IsNullOrWhiteSpace(customDir))
        {
            string trimmed = customDir.Trim().Trim('"');
            if (File.Exists(trimmed) && trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                trimmed = Path.GetDirectoryName(trimmed) ?? trimmed;
            if (File.Exists(Path.Combine(trimmed, "ROB RUN.exe")))
                return trimmed;
        }

        // 1. Parse Steam libraryfolders.vdf
        try
        {
            using var steamKey = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam", false);
            string? steamPath = steamKey?.GetValue("SteamPath") as string;
            if (!string.IsNullOrEmpty(steamPath))
            {
                string vdf = Path.Combine(steamPath.Replace('/', '\\'), "steamapps", "libraryfolders.vdf");
                if (File.Exists(vdf))
                {
                    string text = File.ReadAllText(vdf);
                    foreach (Match m in Regex.Matches(text, "\"path\"\\s+\"([^\"]+)\""))
                    {
                        string lib = m.Groups[1].Value.Replace("\\\\", "\\");
                        string candidate = Path.Combine(lib, "steamapps", "common", "Rob Run");
                        if (File.Exists(Path.Combine(candidate, "ROB RUN.exe")))
                            return candidate;
                    }
                }
            }
        }
        catch { }

        // 2. Check fixed drives for standard SteamLibrary paths
        try
        {
            foreach (var drive in DriveInfo.GetDrives())
            {
                if (!drive.IsReady || drive.DriveType != DriveType.Fixed) continue;
                string root = drive.RootDirectory.FullName;
                string[] candidates =
                {
                    Path.Combine(root, "SteamLibrary", "steamapps", "common", "Rob Run"),
                    Path.Combine(root, "Program Files (x86)", "Steam", "steamapps", "common", "Rob Run"),
                    Path.Combine(root, "Steam", "steamapps", "common", "Rob Run")
                };
                foreach (var c in candidates)
                {
                    if (File.Exists(Path.Combine(c, "ROB RUN.exe")))
                        return c;
                }
            }
        }
        catch { }

        return null;
    }

    #region Win32 Display Mode Switching (ChangeDisplaySettingsEx)

    private const int ENUM_CURRENT_SETTINGS = -1;
    private const uint DM_PELSWIDTH = 0x00080000;
    private const uint DM_PELSHEIGHT = 0x00100000;
    private const uint DM_DISPLAYFREQUENCY = 0x00400000;
    private const uint DM_DISPLAYFIXEDOUTPUT = 0x20000000;
    private const uint CDS_FULLSCREEN = 0x00000004;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DEVMODEW
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmDeviceName;
        public ushort dmSpecVersion;
        public ushort dmDriverVersion;
        public ushort dmSize;
        public ushort dmDriverExtra;
        public uint dmFields;
        public int dmPositionX;
        public int dmPositionY;
        public uint dmDisplayOrientation;
        public uint dmDisplayFixedOutput;
        public short dmColor;
        public short dmDuplex;
        public short dmYResolution;
        public short dmTTOption;
        public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmFormName;
        public ushort dmLogPixels;
        public uint dmBitsPerPel;
        public uint dmPelsWidth;
        public uint dmPelsHeight;
        public uint dmDisplayFlags;
        public uint dmDisplayFrequency;
        public uint dmICMMethod;
        public uint dmICMIntent;
        public uint dmMediaType;
        public uint dmDitherType;
        public uint dmReserved1;
        public uint dmReserved2;
        public uint dmPanningWidth;
        public uint dmPanningHeight;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool EnumDisplaySettingsExW(string? lpszDeviceName, int iModeNum, ref DEVMODEW lpDevMode, uint dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int ChangeDisplaySettingsExW(string? lpszDeviceName, ref DEVMODEW lpDevMode, IntPtr hwnd, uint dwflags, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int ChangeDisplaySettingsExW(string? lpszDeviceName, IntPtr lpDevMode, IntPtr hwnd, uint dwflags, IntPtr lParam);

    private static bool TryGetCurrentDisplayMode(string? deviceName, out DEVMODEW dm)
    {
        dm = new DEVMODEW { dmSize = (ushort)Marshal.SizeOf<DEVMODEW>() };
        return EnumDisplaySettingsExW(string.IsNullOrWhiteSpace(deviceName) ? null : deviceName, ENUM_CURRENT_SETTINGS, ref dm, 0);
    }

    private static int FindBestSupportedRefreshRate(string? deviceName, int width, int height, int desiredHz)
    {
        int bestExactOrLower = 0;
        int maxFound = 0;
        var dm = new DEVMODEW { dmSize = (ushort)Marshal.SizeOf<DEVMODEW>() };
        string? dev = string.IsNullOrWhiteSpace(deviceName) ? null : deviceName;

        for (int i = 0; EnumDisplaySettingsExW(dev, i, ref dm, 0); i++)
        {
            if (dm.dmPelsWidth == width && dm.dmPelsHeight == height)
            {
                int hz = (int)dm.dmDisplayFrequency;
                if (hz == desiredHz) return desiredHz;
                if (hz > maxFound) maxFound = hz;
                if (hz <= desiredHz && hz > bestExactOrLower) bestExactOrLower = hz;
            }
        }
        return bestExactOrLower > 0 ? bestExactOrLower : (maxFound > 0 ? maxFound : desiredHz);
    }

    private static List<DisplayModeOptionDto> CollectMonitorDisplayModes(string? deviceName)
    {
        var maxHzByRes = new Dictionary<(int w, int h), int>();
        var dm = new DEVMODEW { dmSize = (ushort)Marshal.SizeOf<DEVMODEW>() };
        string? dev = string.IsNullOrWhiteSpace(deviceName) ? null : deviceName;

        for (int i = 0; EnumDisplaySettingsExW(dev, i, ref dm, 0); i++)
        {
            int w = (int)dm.dmPelsWidth;
            int h = (int)dm.dmPelsHeight;
            int hz = (int)dm.dmDisplayFrequency;
            if (w < 1024 || h < 720) continue;
            var key = (w, h);
            if (!maxHzByRes.TryGetValue(key, out int prev) || hz > prev)
            {
                maxHzByRes[key] = hz;
            }
        }

        var list = new List<DisplayModeOptionDto>();
        foreach (var kv in maxHzByRes)
        {
            list.Add(new DisplayModeOptionDto
            {
                width = kv.Key.w,
                height = kv.Key.h,
                maxHz = kv.Value,
                aspectLabel = ClassifyAspect(kv.Key.w, kv.Key.h)
            });
        }

        list.Sort((a, b) =>
        {
            int cmpArea = (b.width * b.height).CompareTo(a.width * a.height);
            return cmpArea != 0 ? cmpArea : b.width.CompareTo(a.width);
        });
        return list;
    }

    private static string ClassifyAspect(int w, int h)
    {
        double r = (double)w / Math.Max(1, h);
        if (Math.Abs(r - 1.0) < 0.03) return "1:1 Stretched";
        if (Math.Abs(r - 1.25) < 0.03) return "5:4 Stretched";
        if (Math.Abs(r - 1.333) < 0.03) return "4:3 Stretched";
        if (Math.Abs(r - 1.5) < 0.03) return "3:2 Stretched";
        if (Math.Abs(r - 1.6) < 0.03) return "16:10 Stretched";
        if (Math.Abs(r - 1.777) < 0.04) return "16:9 Native";
        return $"{w}:{h}";
    }

    #endregion
}
