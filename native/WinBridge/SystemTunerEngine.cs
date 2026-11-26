using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace WinBridge;

public sealed class SystemTunerConfigDto
{
    // Real-time session boosters
    public bool lockTimerResolution { get; set; } = true;         // 0.5ms kernel timer
    public bool activateUltimatePower { get; set; } = true;       // Ultimate / High Performance plan
    public bool autoTrimRamOnGameLaunch { get; set; } = true;     // Trim idle background apps when game starts

    // Instant HKCU Gaming Tweaks (No UAC required)
    public bool rawMouseInput { get; set; } = true;               // Disable Enhance Pointer Precision
    public bool disableGameDvr { get; set; } = true;              // Disable background Xbox GameDVR recording
    public bool enableGameMode { get; set; } = true;              // Enable Windows Game Mode thread scheduling
    public bool disableTransparency { get; set; } = false;        // Disable DWM desktop transparency
    public bool disableBackgroundApps { get; set; } = true;       // Disable background UWP apps
    public bool fastKeyboardResponse { get; set; } = true;        // Minimal key repeat delay

    // Deep HKLM Kernel, GPU & Network Tweaks (1-click UAC batch)
    public bool cpuForegroundBoost { get; set; } = true;          // Win32PrioritySeparation = 38 (0x26)
    public bool mmcssGamesPriority { get; set; } = true;          // SystemResponsiveness=0, Games Priority=6, GPU=8
    public bool disablePowerThrottling { get; set; } = true;      // PowerThrottlingOff = 1
    public bool enableHags { get; set; } = true;                  // HwSchMode = 2
    public bool disableMpo { get; set; } = false;                 // DWM OverlayTestMode = 5 (fixes borderless stutter)
    public bool tcpLowLatency { get; set; } = true;               // TcpAckFrequency=1 & TCPNoDelay=1 on active NICs
}

internal static class SystemTunerEngine
{
    private static readonly object _lock = new();
    private static SystemTunerConfigDto _config = new();
    private static string _backupPath = "";
    private static bool _timerLocked = false;
    private static string _cachedCpuName = "";
    private static string _cachedGpuName = "";

    private static readonly HashSet<string> SafeTrimProcessNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "SearchHost", "StartMenuExperienceHost", "Widgets", "WidgetService",
        "PhoneExperienceHost", "YourPhone", "OneDrive", "CalculatorApp",
        "GameBar", "GameBarFTServer", "GameBarPresenceWriter", "TextInputHost",
        "Microsoft.Photos", "LockApp", "HxTsr", "HxOutlook"
    };

    public static void Init(string stateFilePath)
    {
        string dir = !string.IsNullOrWhiteSpace(stateFilePath)
            ? (Path.GetDirectoryName(stateFilePath) ?? "")
            : "";
        if (string.IsNullOrEmpty(dir))
        {
            dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "zeropoint");
        }
        _backupPath = Path.Combine(dir, "system-tuner-backup.json");
        DetectHardwareNames();
    }

    public static void Shutdown()
    {
        SetTimerResolutionLock(false);
    }

    public static void UpdateConfig(SystemTunerConfigDto next)
    {
        lock (_lock)
        {
            _config = next;
        }
        SetTimerResolutionLock(next.lockTimerResolution);
    }

    public static void OnWatchedGameStarted()
    {
        SystemTunerConfigDto cfg;
        lock (_lock) { cfg = _config; }
        if (cfg.lockTimerResolution) SetTimerResolutionLock(true);
        if (cfg.activateUltimatePower) ActivateBestPowerPlan();
        if (cfg.autoTrimRamOnGameLaunch) PurgeBackgroundMemory();
    }

    public static void SetTimerResolutionLock(bool enable)
    {
        if (enable && !_timerLocked)
        {
            try
            {
                timeBeginPeriod(1);
                NtSetTimerResolution(5000, true, out _); // 0.50 ms
                _timerLocked = true;
            }
            catch { }
        }
        else if (!enable && _timerLocked)
        {
            try
            {
                NtSetTimerResolution(5000, false, out _);
                timeEndPeriod(1);
            }
            catch { }
            _timerLocked = false;
        }
    }

    public static object BuildStatusPayload()
    {
        DetectHardwareNames();

        // Live RAM stats
        var mem = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        GlobalMemoryStatusEx(ref mem);
        double totalRamGb = Math.Round(mem.ullTotalPhys / (1024.0 * 1024.0 * 1024.0), 1);
        double availRamGb = Math.Round(mem.ullAvailPhys / (1024.0 * 1024.0 * 1024.0), 1);
        double usedRamGb = Math.Round(Math.Max(0, totalRamGb - availRamGb), 1);

        // Live Kernel Timer Resolution
        double timerMs = 15.625;
        try
        {
            if (NtQueryTimerResolution(out _, out _, out uint current100Ns) == 0 && current100Ns > 0)
            {
                timerMs = Math.Round(current100Ns / 10000.0, 2);
            }
        }
        catch { }

        // Active Power Plan
        var (powerGuid, powerName) = ReadActivePowerPlan();

        // Live Windows Registry States (HKCU + HKLM read-only)
        bool liveRawMouse = ReadRegString(Registry.CurrentUser, @"Control Panel\Mouse", "MouseSpeed") == "0"
                         && ReadRegString(Registry.CurrentUser, @"Control Panel\Mouse", "MouseThreshold1") == "0";
        bool liveGameDvrOff = ReadRegInt(Registry.CurrentUser, @"System\GameConfigStore", "GameDVR_Enabled", 1) == 0;
        bool liveGameModeOn = ReadRegInt(Registry.CurrentUser, @"Software\Microsoft\GameBar", "AutoGameModeEnabled", 1) == 1;
        bool liveTransparencyOff = ReadRegInt(Registry.CurrentUser, @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "EnableTransparency", 1) == 0;
        bool liveBgAppsOff = ReadRegInt(Registry.CurrentUser, @"Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications", "GlobalUserDisabled", 0) == 1;
        bool liveFastKey = ReadRegString(Registry.CurrentUser, @"Control Panel\Keyboard", "KeyboardDelay") == "0";

        int prioSep = ReadRegInt(Registry.LocalMachine, @"SYSTEM\CurrentControlSet\Control\PriorityControl", "Win32PrioritySeparation", 2);
        bool liveCpuBoost = prioSep == 38 || prioSep == 0x26 || prioSep == 40;
        int sysResp = ReadRegInt(Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile", "SystemResponsiveness", 20);
        int gamesPrio = ReadRegInt(Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games", "Priority", 2);
        bool liveMmcss = sysResp <= 10 && gamesPrio >= 6;
        bool livePowerThrottleOff = ReadRegInt(Registry.LocalMachine, @"SYSTEM\CurrentControlSet\Control\Power\PowerThrottling", "PowerThrottlingOff", 0) == 1;
        bool liveHags = ReadRegInt(Registry.LocalMachine, @"SYSTEM\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode", 1) == 2;
        bool liveMpoOff = ReadRegInt(Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows\Dwm", "OverlayTestMode", 0) == 5;
        bool liveTcpNoDelay = CheckAnyNicTcpNoDelay();

        int activeCount =
            (_timerLocked || timerMs <= 1.05 ? 1 : 0) +
            (powerName.Contains("Ultimate", StringComparison.OrdinalIgnoreCase) || powerName.Contains("High", StringComparison.OrdinalIgnoreCase) ? 1 : 0) +
            (liveRawMouse ? 1 : 0) +
            (liveGameDvrOff ? 1 : 0) +
            (liveGameModeOn ? 1 : 0) +
            (liveBgAppsOff ? 1 : 0) +
            (liveCpuBoost ? 1 : 0) +
            (liveMmcss ? 1 : 0) +
            (livePowerThrottleOff ? 1 : 0) +
            (liveHags ? 1 : 0) +
            (liveTcpNoDelay ? 1 : 0);

        return new
        {
            type = "systemTunerStatus",
            cpuName = _cachedCpuName,
            cpuThreads = Environment.ProcessorCount,
            gpuName = _cachedGpuName,
            totalRamGb,
            usedRamGb,
            availRamGb,
            ramLoadPct = (int)mem.dwMemoryLoad,
            timerResolutionMs = timerMs,
            timerLocked = _timerLocked,
            activePowerPlanGuid = powerGuid,
            activePowerPlanName = powerName,
            hasSystemBackup = !string.IsNullOrEmpty(_backupPath) && File.Exists(_backupPath),
            optimizationScorePct = (int)Math.Round((activeCount / 11.0) * 100.0),
            liveStates = new
            {
                rawMouseInput = liveRawMouse,
                disableGameDvr = liveGameDvrOff,
                enableGameMode = liveGameModeOn,
                disableTransparency = liveTransparencyOff,
                disableBackgroundApps = liveBgAppsOff,
                fastKeyboardResponse = liveFastKey,
                cpuForegroundBoost = liveCpuBoost,
                win32PriorityValue = prioSep,
                mmcssGamesPriority = liveMmcss,
                disablePowerThrottling = livePowerThrottleOff,
                enableHags = liveHags,
                disableMpo = liveMpoOff,
                tcpLowLatency = liveTcpNoDelay
            }
        };
    }

    public static (bool ok, string message) ApplyUserTweaksNow(SystemTunerConfigDto cfg)
    {
        lock (_lock) { _config = cfg; }
        EnsureSystemBackupSaved();

        try
        {
            SetTimerResolutionLock(cfg.lockTimerResolution);

            if (cfg.activateUltimatePower)
            {
                ActivateBestPowerPlan();
            }

            // 1. Raw 1:1 Mouse Input (Disable Enhance Pointer Precision immediately via SPI_SETMOUSE)
            using (var mouseKey = Registry.CurrentUser.CreateSubKey(@"Control Panel\Mouse", true))
            {
                if (mouseKey != null)
                {
                    if (cfg.rawMouseInput)
                    {
                        mouseKey.SetValue("MouseSpeed", "0", RegistryValueKind.String);
                        mouseKey.SetValue("MouseThreshold1", "0", RegistryValueKind.String);
                        mouseKey.SetValue("MouseThreshold2", "0", RegistryValueKind.String);
                        int[] mouseParams = { 0, 0, 0 };
                        SystemParametersInfoW(0x0004 /* SPI_SETMOUSE */, 0, mouseParams, 0x03);
                    }
                    else
                    {
                        mouseKey.SetValue("MouseSpeed", "1", RegistryValueKind.String);
                        mouseKey.SetValue("MouseThreshold1", "6", RegistryValueKind.String);
                        mouseKey.SetValue("MouseThreshold2", "10", RegistryValueKind.String);
                        int[] mouseParams = { 6, 10, 1 };
                        SystemParametersInfoW(0x0004 /* SPI_SETMOUSE */, 0, mouseParams, 0x03);
                    }
                }
            }

            // 2. Disable GameDVR background capture
            using (var gcs = Registry.CurrentUser.CreateSubKey(@"System\GameConfigStore", true))
            {
                gcs?.SetValue("GameDVR_Enabled", cfg.disableGameDvr ? 0 : 1, RegistryValueKind.DWord);
                if (cfg.disableGameDvr)
                    gcs?.SetValue("GameDVR_FSEBehaviorMode", 2, RegistryValueKind.DWord);
            }
            using (var gdvr = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\GameDVR", true))
            {
                gdvr?.SetValue("AppCaptureEnabled", cfg.disableGameDvr ? 0 : 1, RegistryValueKind.DWord);
                gdvr?.SetValue("HistoricalCaptureEnabled", 0, RegistryValueKind.DWord);
            }

            // 3. Windows Game Mode
            using (var gb = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\GameBar", true))
            {
                gb?.SetValue("AllowAutoGameMode", cfg.enableGameMode ? 1 : 0, RegistryValueKind.DWord);
                gb?.SetValue("AutoGameModeEnabled", cfg.enableGameMode ? 1 : 0, RegistryValueKind.DWord);
            }

            // 4. Desktop Transparency
            using (var pers = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", true))
            {
                pers?.SetValue("EnableTransparency", cfg.disableTransparency ? 0 : 1, RegistryValueKind.DWord);
            }

            // 5. Background UWP Apps
            using (var bg = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications", true))
            {
                bg?.SetValue("GlobalUserDisabled", cfg.disableBackgroundApps ? 1 : 0, RegistryValueKind.DWord);
            }

            // 6. Fast Keyboard Repeat
            if (cfg.fastKeyboardResponse)
            {
                using var kb = Registry.CurrentUser.CreateSubKey(@"Control Panel\Keyboard", true);
                kb?.SetValue("KeyboardDelay", "0", RegistryValueKind.String);
                kb?.SetValue("KeyboardSpeed", "31", RegistryValueKind.String);
            }

            return (true, "Applied Windows gaming, mouse 1:1, power plan, and 0.5ms timer tweaks.");
        }
        catch (Exception ex)
        {
            return (false, "Failed to apply user tweaks: " + ex.Message);
        }
    }

    public static (bool ok, string message) ApplyElevatedKernelAndNetworkTweaks(SystemTunerConfigDto cfg)
    {
        lock (_lock) { _config = cfg; }
        EnsureSystemBackupSaved();
        ApplyUserTweaksNow(cfg);

        try
        {
            var cmds = new List<string>();

            // 1. CPU Foreground Quantum Boost (Win32PrioritySeparation = 38 / 0x26)
            int prioVal = cfg.cpuPrioritySeparationValue();
            cmds.Add($"reg add \"HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl\" /v Win32PrioritySeparation /t REG_DWORD /d {prioVal} /f");

            // 2. MMCSS Gaming CPU & GPU Priority
            if (cfg.mmcssGamesPriority)
            {
                cmds.Add("reg add \"HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\" /v SystemResponsiveness /t REG_DWORD /d 0 /f");
                cmds.Add("reg add \"HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\" /v NetworkThrottlingIndex /t REG_DWORD /d 4294967295 /f");
                cmds.Add("reg add \"HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games\" /v \"GPU Priority\" /t REG_DWORD /d 8 /f");
                cmds.Add("reg add \"HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games\" /v Priority /t REG_DWORD /d 6 /f");
                cmds.Add("reg add \"HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games\" /v \"Scheduling Category\" /t REG_SZ /d High /f");
                cmds.Add("reg add \"HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games\" /v \"SFIO Priority\" /t REG_SZ /d High /f");
            }

            // 3. Disable Power Throttling
            cmds.Add($"reg add \"HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling\" /v PowerThrottlingOff /t REG_DWORD /d {(cfg.disablePowerThrottling ? 1 : 0)} /f");

            // 4. Hardware-Accelerated GPU Scheduling
            cmds.Add($"reg add \"HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers\" /v HwSchMode /t REG_DWORD /d {(cfg.enableHags ? 2 : 1)} /f");

            // 5. DWM Multiplane Overlay (MPO) Stutter Fix
            if (cfg.disableMpo)
                cmds.Add("reg add \"HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm\" /v OverlayTestMode /t REG_DWORD /d 5 /f");
            else
                cmds.Add("reg delete \"HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm\" /v OverlayTestMode /f 2>nul");

            // 6. Active Network Interface TCP No-Delay (Disable Nagle's Algorithm)
            foreach (var nicGuid in GetActiveNicSubkeyNames())
            {
                string nicKey = $"HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{nicGuid}";
                if (cfg.tcpLowLatency)
                {
                    cmds.Add($"reg add \"{nicKey}\" /v TcpAckFrequency /t REG_DWORD /d 1 /f");
                    cmds.Add($"reg add \"{nicKey}\" /v TCPNoDelay /t REG_DWORD /d 1 /f");
                }
                else
                {
                    cmds.Add($"reg delete \"{nicKey}\" /v TcpAckFrequency /f 2>nul");
                    cmds.Add($"reg delete \"{nicKey}\" /v TCPNoDelay /f 2>nul");
                }
            }

            bool ok = RunElevatedBatchCommands(cmds);
            return ok
                ? (true, "Applied CPU scheduler, MMCSS, GPU HAGS, power-throttling, and TCP No-Delay tweaks.")
                : (false, "Admin permission was declined or cancelled.");
        }
        catch (Exception ex)
        {
            return (false, "Failed to apply kernel tweaks: " + ex.Message);
        }
    }

    private static int cpuPrioritySeparationValue(this SystemTunerConfigDto cfg) => cfg.cpuForegroundBoost ? 38 : 2;

    public static (bool ok, string message) RestoreWindowsDefaults()
    {
        SetTimerResolutionLock(false);

        if (string.IsNullOrEmpty(_backupPath) || !File.Exists(_backupPath))
        {
            return (false, "No system tuner backup recorded yet.");
        }

        try
        {
            var root = JsonNode.Parse(File.ReadAllText(_backupPath)) as JsonObject;
            if (root == null) return (false, "System backup file could not be read.");

            // Restore HKCU values
            if (root["hkcu"] is JsonObject hkcu)
            {
                using var mouse = Registry.CurrentUser.CreateSubKey(@"Control Panel\Mouse", true);
                if (mouse != null)
                {
                    mouse.SetValue("MouseSpeed", hkcu["MouseSpeed"]?.GetValue<string>() ?? "1", RegistryValueKind.String);
                    mouse.SetValue("MouseThreshold1", hkcu["MouseThreshold1"]?.GetValue<string>() ?? "6", RegistryValueKind.String);
                    mouse.SetValue("MouseThreshold2", hkcu["MouseThreshold2"]?.GetValue<string>() ?? "10", RegistryValueKind.String);
                    int spd = mouse.GetValue("MouseSpeed")?.ToString() == "0" ? 0 : 1;
                    int[] mp = spd == 0 ? new[] { 0, 0, 0 } : new[] { 6, 10, 1 };
                    SystemParametersInfoW(0x0004, 0, mp, 0x03);
                }

                using var gcs = Registry.CurrentUser.CreateSubKey(@"System\GameConfigStore", true);
                gcs?.SetValue("GameDVR_Enabled", hkcu["GameDVR_Enabled"]?.GetValue<int>() ?? 0, RegistryValueKind.DWord);

                using var gb = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\GameBar", true);
                gb?.SetValue("AutoGameModeEnabled", hkcu["AutoGameModeEnabled"]?.GetValue<int>() ?? 1, RegistryValueKind.DWord);

                using var pers = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", true);
                pers?.SetValue("EnableTransparency", hkcu["EnableTransparency"]?.GetValue<int>() ?? 1, RegistryValueKind.DWord);

                using var bg = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications", true);
                bg?.SetValue("GlobalUserDisabled", hkcu["GlobalUserDisabled"]?.GetValue<int>() ?? 0, RegistryValueKind.DWord);
            }

            string? origPower = root["powerPlanGuid"]?.GetValue<string>();
            if (!string.IsNullOrEmpty(origPower))
            {
                RunHiddenProcess("powercfg.exe", $"/setactive {origPower}");
            }

            // Restore HKLM values via single UAC batch if needed
            if (root["hklm"] is JsonObject hklm)
            {
                int origPrio = hklm["Win32PrioritySeparation"]?.GetValue<int>() ?? 2;
                int origResp = hklm["SystemResponsiveness"]?.GetValue<int>() ?? 20;
                int origHags = hklm["HwSchMode"]?.GetValue<int>() ?? 2;
                int origMpo = hklm["OverlayTestMode"]?.GetValue<int>() ?? -1;

                var cmds = new List<string>
                {
                    $"reg add \"HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl\" /v Win32PrioritySeparation /t REG_DWORD /d {origPrio} /f",
                    $"reg add \"HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\" /v SystemResponsiveness /t REG_DWORD /d {origResp} /f",
                    $"reg add \"HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers\" /v HwSchMode /t REG_DWORD /d {origHags} /f",
                    "reg delete \"HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling\" /v PowerThrottlingOff /f 2>nul"
                };

                if (origMpo < 0)
                    cmds.Add("reg delete \"HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm\" /v OverlayTestMode /f 2>nul");
                else
                    cmds.Add($"reg add \"HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm\" /v OverlayTestMode /t REG_DWORD /d {origMpo} /f");

                foreach (var nicGuid in GetActiveNicSubkeyNames())
                {
                    string nicKey = $"HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{nicGuid}";
                    cmds.Add($"reg delete \"{nicKey}\" /v TcpAckFrequency /f 2>nul");
                    cmds.Add($"reg delete \"{nicKey}\" /v TCPNoDelay /f 2>nul");
                }

                RunElevatedBatchCommands(cmds);
            }

            return (true, "Restored original Windows registry, mouse, power plan, and network settings.");
        }
        catch (Exception ex)
        {
            return (false, "Restore error: " + ex.Message);
        }
    }

    public static (bool ok, string message) PurgeBackgroundMemory()
    {
        try
        {
            var before = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
            GlobalMemoryStatusEx(ref before);

            GC.Collect(2, GCCollectionMode.Aggressive, true, true);

            int trimmedApps = 0;
            foreach (var p in Process.GetProcesses())
            {
                try
                {
                    if (p.Id > 4 && SafeTrimProcessNames.Contains(p.ProcessName))
                    {
                        if (EmptyWorkingSet(p.Handle)) trimmedApps++;
                    }
                }
                catch { }
                finally { p.Dispose(); }
            }

            var after = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
            GlobalMemoryStatusEx(ref after);

            long deltaMb = Math.Max(0, (long)(after.ullAvailPhys - before.ullAvailPhys) / (1024 * 1024));
            double freeGb = Math.Round(after.ullAvailPhys / (1024.0 * 1024.0 * 1024.0), 1);
            return (true, deltaMb > 12
                ? $"Freed {deltaMb} MB across {trimmedApps} idle background processes ({freeGb} GB free)."
                : $"Trimmed {trimmedApps} idle background processes ({freeGb} GB RAM available).");
        }
        catch (Exception ex)
        {
            return (false, "RAM trim failed: " + ex.Message);
        }
    }

    public static (bool ok, string message) CleanTempAndShaderCache()
    {
        long bytesRemoved = 0;
        int filesRemoved = 0;

        string[] dirs =
        {
            Path.GetTempPath(),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "D3DSCache"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AMD", "DxCache"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NVIDIA", "DXCache")
        };

        DateTime cutoff = DateTime.UtcNow.AddMinutes(-30);
        foreach (var dir in dirs)
        {
            if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) continue;
            try
            {
                foreach (var file in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
                {
                    try
                    {
                        var fi = new FileInfo(file);
                        if (fi.LastWriteTimeUtc < cutoff)
                        {
                            long len = fi.Length;
                            fi.Delete();
                            bytesRemoved += len;
                            filesRemoved++;
                        }
                    }
                    catch { /* In-use files are safely skipped */ }
                }
            }
            catch { }
        }

        double mb = Math.Round(bytesRemoved / (1024.0 * 1024.0), 1);
        return (true, filesRemoved > 0
            ? $"Cleaned {mb} MB ({filesRemoved} stale cache & temp files)."
            : "Shader and temp caches are already clean.");
    }

    public static bool ActivateBestPowerPlan()
    {
        try
        {
            string output = RunHiddenProcessCapture("powercfg.exe", "/list");
            string? ultimateGuid = null;
            string? highPerfGuid = null;

            foreach (var line in output.Split('\n'))
            {
                int idx = line.IndexOf("GUID:", StringComparison.OrdinalIgnoreCase);
                if (idx < 0) continue;
                string rest = line[(idx + 5)..].Trim();
                if (rest.Length < 36) continue;
                string guid = rest[..36];
                if (line.Contains("Ultimate Performance", StringComparison.OrdinalIgnoreCase))
                {
                    ultimateGuid = guid;
                    break;
                }
                if (line.Contains("High performance", StringComparison.OrdinalIgnoreCase))
                {
                    highPerfGuid = guid;
                }
            }

            if (string.IsNullOrEmpty(ultimateGuid))
            {
                string dup = RunHiddenProcessCapture("powercfg.exe", "-duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61");
                int gIdx = dup.IndexOf("GUID:", StringComparison.OrdinalIgnoreCase);
                if (gIdx >= 0 && dup.Length >= gIdx + 5 + 37)
                {
                    ultimateGuid = dup[(gIdx + 5)..].Trim()[..36];
                }
            }

            string? chosen = ultimateGuid ?? highPerfGuid;
            if (!string.IsNullOrEmpty(chosen))
            {
                RunHiddenProcess("powercfg.exe", $"/setactive {chosen}");
                return true;
            }
        }
        catch { }
        return false;
    }

    private static void EnsureSystemBackupSaved()
    {
        if (string.IsNullOrEmpty(_backupPath) || File.Exists(_backupPath)) return;
        try
        {
            var (powerGuid, _) = ReadActivePowerPlan();
            var root = new JsonObject
            {
                ["createdAt"] = DateTime.UtcNow.ToString("O"),
                ["powerPlanGuid"] = powerGuid,
                ["hkcu"] = new JsonObject
                {
                    ["MouseSpeed"] = ReadRegString(Registry.CurrentUser, @"Control Panel\Mouse", "MouseSpeed") ?? "1",
                    ["MouseThreshold1"] = ReadRegString(Registry.CurrentUser, @"Control Panel\Mouse", "MouseThreshold1") ?? "6",
                    ["MouseThreshold2"] = ReadRegString(Registry.CurrentUser, @"Control Panel\Mouse", "MouseThreshold2") ?? "10",
                    ["GameDVR_Enabled"] = ReadRegInt(Registry.CurrentUser, @"System\GameConfigStore", "GameDVR_Enabled", 0),
                    ["AutoGameModeEnabled"] = ReadRegInt(Registry.CurrentUser, @"Software\Microsoft\GameBar", "AutoGameModeEnabled", 1),
                    ["EnableTransparency"] = ReadRegInt(Registry.CurrentUser, @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "EnableTransparency", 1),
                    ["GlobalUserDisabled"] = ReadRegInt(Registry.CurrentUser, @"Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications", "GlobalUserDisabled", 0)
                },
                ["hklm"] = new JsonObject
                {
                    ["Win32PrioritySeparation"] = ReadRegInt(Registry.LocalMachine, @"SYSTEM\CurrentControlSet\Control\PriorityControl", "Win32PrioritySeparation", 2),
                    ["SystemResponsiveness"] = ReadRegInt(Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile", "SystemResponsiveness", 20),
                    ["HwSchMode"] = ReadRegInt(Registry.LocalMachine, @"SYSTEM\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode", 2),
                    ["OverlayTestMode"] = ReadRegInt(Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows\Dwm", "OverlayTestMode", -1)
                }
            };

            string? dir = Path.GetDirectoryName(_backupPath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            File.WriteAllText(_backupPath, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }

    private static void DetectHardwareNames()
    {
        if (string.IsNullOrEmpty(_cachedCpuName))
        {
            _cachedCpuName = (ReadRegString(Registry.LocalMachine, @"HARDWARE\Description\System\CentralProcessor\0", "ProcessorNameString") ?? "x64 Processor").Trim();
        }
        if (string.IsNullOrEmpty(_cachedGpuName))
        {
            try
            {
                using var cls = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}", false);
                if (cls != null)
                {
                    foreach (var sub in cls.GetSubKeyNames())
                    {
                        if (!sub.StartsWith("0")) continue;
                        using var k = cls.OpenSubKey(sub, false);
                        string? desc = k?.GetValue("DriverDesc") as string;
                        if (!string.IsNullOrWhiteSpace(desc) && !desc.Contains("Basic", StringComparison.OrdinalIgnoreCase))
                        {
                            _cachedGpuName = desc.Trim();
                            if (desc.Contains("Radeon RX", StringComparison.OrdinalIgnoreCase) || desc.Contains("GeForce", StringComparison.OrdinalIgnoreCase) || desc.Contains("Arc", StringComparison.OrdinalIgnoreCase))
                                break;
                        }
                    }
                }
            }
            catch { }
            if (string.IsNullOrEmpty(_cachedGpuName)) _cachedGpuName = "DirectX 12 GPU";
        }
    }

    private static (string guid, string name) ReadActivePowerPlan()
    {
        try
        {
            string outStr = RunHiddenProcessCapture("powercfg.exe", "/getactivescheme");
            int idx = outStr.IndexOf("GUID:", StringComparison.OrdinalIgnoreCase);
            if (idx >= 0 && outStr.Length >= idx + 5 + 37)
            {
                string rest = outStr[(idx + 5)..].Trim();
                string guid = rest[..36];
                int p1 = rest.IndexOf('(');
                int p2 = rest.LastIndexOf(')');
                string name = (p1 >= 0 && p2 > p1) ? rest[(p1 + 1)..p2].Trim() : "Custom Plan";
                return (guid, name);
            }
        }
        catch { }
        return ("", "Balanced");
    }

    private static List<string> GetActiveNicSubkeyNames()
    {
        var list = new List<string>();
        try
        {
            using var ifs = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces", false);
            if (ifs == null) return list;
            foreach (var sub in ifs.GetSubKeyNames())
            {
                using var k = ifs.OpenSubKey(sub, false);
                if (k == null) continue;
                string? dhcpIp = k.GetValue("DhcpIPAddress") as string;
                var staticIp = k.GetValue("IPAddress") as string[];
                bool hasValidIp = (!string.IsNullOrWhiteSpace(dhcpIp) && dhcpIp != "0.0.0.0")
                               || (staticIp != null && staticIp.Any(ip => !string.IsNullOrWhiteSpace(ip) && ip != "0.0.0.0"));
                if (hasValidIp) list.Add(sub);
            }
        }
        catch { }
        return list;
    }

    private static bool CheckAnyNicTcpNoDelay()
    {
        try
        {
            foreach (var guid in GetActiveNicSubkeyNames())
            {
                int ack = ReadRegInt(Registry.LocalMachine, $@"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\{guid}", "TcpAckFrequency", 0);
                int nodelay = ReadRegInt(Registry.LocalMachine, $@"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\{guid}", "TCPNoDelay", 0);
                if (ack == 1 && nodelay == 1) return true;
            }
        }
        catch { }
        return false;
    }

    private static string? ReadRegString(RegistryKey root, string subKey, string name)
    {
        try
        {
            using var k = root.OpenSubKey(subKey, false);
            return k?.GetValue(name)?.ToString();
        }
        catch { return null; }
    }

    private static int ReadRegInt(RegistryKey root, string subKey, string name, int fallback)
    {
        try
        {
            using var k = root.OpenSubKey(subKey, false);
            object? val = k?.GetValue(name);
            if (val is int iv) return iv;
            if (val != null && int.TryParse(val.ToString(), out int parsed)) return parsed;
        }
        catch { }
        return fallback;
    }

    private static bool RunElevatedBatchCommands(List<string> commands)
    {
        string tempBat = Path.Combine(Path.GetTempPath(), $"zeropoint-tune-{Guid.NewGuid():N}.cmd");
        try
        {
            var sb = new StringBuilder();
            sb.AppendLine("@echo off");
            foreach (var c in commands) sb.AppendLine(c);
            File.WriteAllText(tempBat, sb.ToString(), Encoding.ASCII);

            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c \"{tempBat}\"",
                Verb = "runas",
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            using var p = Process.Start(psi);
            p?.WaitForExit(20000);
            return p != null && p.ExitCode == 0;
        }
        catch
        {
            return false;
        }
        finally
        {
            try { if (File.Exists(tempBat)) File.Delete(tempBat); } catch { }
        }
    }

    private static void RunHiddenProcess(string fileName, string args)
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = args,
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden
            });
            p?.WaitForExit(3000);
        }
        catch { }
    }

    private static string RunHiddenProcessCapture(string fileName, string args)
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = args,
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });
            if (p == null) return "";
            string s = p.StandardOutput.ReadToEnd();
            p.WaitForExit(3000);
            return s;
        }
        catch { return ""; }
    }

    #region Win32 Native Calls

    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORYSTATUSEX
    {
        public uint dwLength;
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

    [DllImport("ntdll.dll")]
    private static extern int NtQueryTimerResolution(out uint MinimumResolution, out uint MaximumResolution, out uint CurrentResolution);

    [DllImport("ntdll.dll")]
    private static extern int NtSetTimerResolution(uint DesiredResolution, bool SetResolution, out uint CurrentResolution);

    [DllImport("winmm.dll")]
    private static extern uint timeBeginPeriod(uint uPeriod);

    [DllImport("winmm.dll")]
    private static extern uint timeEndPeriod(uint uPeriod);

    [DllImport("psapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EmptyWorkingSet(IntPtr hProcess);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SystemParametersInfoW(uint uiAction, uint uiParam, int[] pvParam, uint fWinIni);

    #endregion
}
