using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace WinBridge;

/// <summary>
/// ZeroPoint — Ultra-Low-RAM Native Windows Overlay, System Tray & Passive Input Engine
///
/// SECURITY & ANTI-CHEAT SAFETY GUARANTEES:
///   1. ZERO DLL Injection — never injects modules into any external process.
///   2. ZERO Memory Access — never calls OpenProcess, ReadProcessMemory, or WriteProcessMemory.
///   3. ZERO Input Hooks — never installs SetWindowsHookEx (WH_MOUSE_LL / WH_KEYBOARD_LL).
///   4. ZERO Synthetic Input — never calls SendInput, mouse_event, or keybd_event.
///   5. ZERO Graphics Hooking — never hooks DirectX, Vulkan, or OpenGL.
///   6. ZERO Capture Evasion — never calls SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE).
///
/// Hosts the persistent Win32 UpdateLayeredWindow crosshair overlay & System Tray icon so
/// the Electron Studio UI can exit completely while gaming (0 MB Chromium RAM!).
/// </summary>
internal static class Program
{
    private const string PIPE_NAME = "ZeroPointOverlayBridge";
    private const string MUTEX_NAME = "Local\\ZeroPointOverlaySingleton";

    private const int VK_LBUTTON = 0x01;
    private const int VK_RBUTTON = 0x02;
    private const int VK_MBUTTON = 0x04;
    private const int VK_XBUTTON1 = 0x05;
    private const int VK_XBUTTON2 = 0x06;
    private const int VK_SHIFT = 0x10;
    private const int VK_CONTROL = 0x11;
    private const int VK_MENU = 0x12; // Alt
    private const int VK_SPACE = 0x20;
    private const int VK_LEFT = 0x25;
    private const int VK_UP = 0x26;
    private const int VK_RIGHT = 0x27;
    private const int VK_DOWN = 0x28;
    private const int VK_W = 0x57;
    private const int VK_A = 0x41;
    private const int VK_S = 0x53;
    private const int VK_D = 0x44;
    private const int VK_X = 0x58;
    private const int VK_OEM_4 = 0xDB; // '['
    private const int VK_OEM_6 = 0xDD; // ']'

    private static volatile bool _running = true;
    private static volatile bool _strictStaticMode = false;
    private static volatile bool _enableForegroundWindowWatch = false;
    private static volatile bool _enableOverlayTopmostKeepAlive = true;
    private static volatile bool _studioConnected = false;
    private static volatile bool _intentionalDetach = false;
    private static volatile bool _headlessTestMode = false;
    private static volatile int _customToggleVk = VK_X;
    private static volatile bool _customToggleAlt = true;
    private static volatile bool _customToggleCtrl = false;
    private static volatile bool _customToggleShift = false;
    private static volatile int _adsCustomVk = 0;

    private static string _studioExePath = string.Empty;
    private static string _studioLaunchArgs = string.Empty;
    private static string _stateFilePath = string.Empty;

    private static readonly object _pipeOutLock = new();
    private static readonly object _overlayLock = new();
    private static StreamWriter? _pipeWriter;

    private static bool _overlayEnabled = true;
    private static int _selectedMonitorIndex = 0;
    private static CrosshairConfigDto _activeConfig = new();
    private static CrosshairConfigDto? _secondaryAdsConfig = null;
    private static List<TrayProfileEntry> _trayProfiles = new();
    private static InputSnapshot _liveInput = default;
    private static volatile bool _overlayDirty = true;
    private static volatile bool _placementDirty = true;
    private static volatile bool _trayMenuDirty = true;

    private sealed class TrayProfileEntry
    {
        public string id { get; set; } = "";
        public string name { get; set; } = "";
        public bool active { get; set; }
        public int monitorIndex { get; set; }
        public int? quickSlot { get; set; }
        public List<string> gameTitleMatchers { get; set; } = new();
        public CrosshairConfigDto? config { get; set; }
    }

    private sealed record MonInfo(int Index, string Device, bool Primary, int X, int Y, int Width, int Height, double ScaleFactor);
    private static List<MonInfo> _monitors = new();
    private static NativeOverlayForm? _overlayForm;
    private static NotifyIcon? _trayIcon;

    private static string? ResolveMonitorDeviceName(int monitorIndex)
    {
        lock (_overlayLock)
        {
            if (monitorIndex >= 0 && monitorIndex < _monitors.Count)
                return _monitors[monitorIndex].Device;
            return _monitors.Count > 0 ? _monitors[0].Device : null;
        }
    }

    private static void LoadInitialFeatureConfigsFromDisk()
    {
        bool foundColorConfig = false;
        if (!string.IsNullOrEmpty(_stateFilePath) && File.Exists(_stateFilePath))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(_stateFilePath));
                var root = doc.RootElement;
                if (root.TryGetProperty("audioLimiter", out var al) && al.ValueKind == JsonValueKind.Object)
                {
                    var parsedAudio = JsonSerializer.Deserialize<AudioLimiterConfigDto>(al.GetRawText(), JsonOpts);
                    if (parsedAudio != null) ProcessAudioEngine.UpdateConfig(parsedAudio);
                }
                if (root.TryGetProperty("robRunOptimizer", out var ro) && ro.ValueKind == JsonValueKind.Object)
                {
                    var parsedOpt = JsonSerializer.Deserialize<RobRunOptimizerConfigDto>(ro.GetRawText(), JsonOpts);
                    if (parsedOpt != null) RobRunOptimizerEngine.UpdateConfig(parsedOpt);
                }
                if (root.TryGetProperty("systemTuner", out var st) && st.ValueKind == JsonValueKind.Object)
                {
                    var parsedTuner = JsonSerializer.Deserialize<SystemTunerConfigDto>(st.GetRawText(), JsonOpts);
                    if (parsedTuner != null) SystemTunerEngine.UpdateConfig(parsedTuner);
                }
                if (root.TryGetProperty("colorFilter", out var cf) && cf.ValueKind == JsonValueKind.Object)
                {
                    var parsedColor = JsonSerializer.Deserialize<ColorFilterConfigDto>(cf.GetRawText(), JsonOpts);
                    if (parsedColor != null)
                    {
                        HyperHueEngine.UpdateConfigFromStudio(parsedColor);
                        foundColorConfig = true;
                    }
                }
            }
            catch { }
        }

        if (!foundColorConfig)
        {
            var migrated = HyperHueEngine.TryMigrateLegacyHyperHueConfig();
            HyperHueEngine.UpdateConfigFromStudio(migrated);
        }
    }

    private static void PersistColorConfigToDisk(ColorFilterConfigDto cfg)
    {
        if (string.IsNullOrEmpty(_stateFilePath) || !File.Exists(_stateFilePath)) return;
        try
        {
            var rootNode = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(_stateFilePath));
            if (rootNode is not System.Text.Json.Nodes.JsonObject obj) return;
            obj["colorFilter"] = JsonSerializer.SerializeToNode(cfg);
            File.WriteAllText(_stateFilePath, obj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }

    private static void RunOnUiThread(Action action)
    {
        if (_headlessTestMode || _overlayForm == null || !_overlayForm.IsHandleCreated)
        {
            action();
            return;
        }
        try { _overlayForm.BeginInvoke(action); } catch { }
    }

    #region Win32 P/Invoke (Strictly Passive / Own-Process Only)

    [DllImport("shcore.dll")]
    private static extern int SetProcessDpiAwareness(int value);

    [DllImport("kernel32.dll")]
    private static extern bool SetProcessWorkingSetSize(IntPtr proc, IntPtr min, IntPtr max);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    private delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);

    [DllImport("user32.dll")]
    private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX lpmi);

    [DllImport("shcore.dll")]
    private static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
    private static extern uint XInputGetState14(uint dwUserIndex, out XINPUT_STATE pState);

    [DllImport("xinput9_1_0.dll", EntryPoint = "XInputGetState")]
    private static extern uint XInputGetState910(uint dwUserIndex, out XINPUT_STATE pState);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct MONITORINFOEX
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string szDevice;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct XINPUT_GAMEPAD
    {
        public ushort wButtons;
        public byte bLeftTrigger;
        public byte bRightTrigger;
        public short sThumbLX;
        public short sThumbLY;
        public short sThumbRX;
        public short sThumbRY;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct XINPUT_STATE
    {
        public uint dwPacketNumber;
        public XINPUT_GAMEPAD Gamepad;
    }

    #endregion

    private static bool _xinput14Available = true;

    private static uint TryXInputGetState(uint userIndex, out XINPUT_STATE state)
    {
        state = default;
        if (_xinput14Available)
        {
            try { return XInputGetState14(userIndex, out state); }
            catch (DllNotFoundException) { _xinput14Available = false; }
            catch { return 1167; }
        }
        try { return XInputGetState910(userIndex, out state); }
        catch { return 1167; }
    }

    private static bool IsKeyDown(int vk) => (GetAsyncKeyState(vk) & 0x8000) != 0;

    private static void TrimOwnMemory()
    {
        try
        {
            GC.Collect(2, GCCollectionMode.Aggressive, true, true);
            GC.WaitForPendingFinalizers();
            SetProcessWorkingSetSize(Process.GetCurrentProcess().Handle, new IntPtr(-1), new IntPtr(-1));
        }
        catch { }
    }

    private static void Emit(object payload)
    {
        string json;
        try { json = JsonSerializer.Serialize(payload); }
        catch { return; }

        lock (_pipeOutLock)
        {
            if (_headlessTestMode)
            {
                try { Console.Out.WriteLine(json); Console.Out.Flush(); } catch { }
            }
            if (_pipeWriter != null)
            {
                try { _pipeWriter.WriteLine(json); _pipeWriter.Flush(); }
                catch
                {
                    _pipeWriter = null;
                    _studioConnected = false;
                }
            }
        }
    }

    private static object BuildReadyPayload() => new
    {
        type = "ready",
        version = "2.1.0-lowram-native",
        safetyAudit = new
        {
            dllInjection = false,
            memoryAccess = false,
            globalInputHooks = false,
            syntheticInput = false,
            graphicsApiHooking = false,
            captureEvasion = false
        }
    };

    private static List<object> CollectMonitorsPayload()
    {
        var raw = new List<(string device, bool primary, int x, int y, int w, int h, double scale)>();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr hdc, ref RECT rect, IntPtr data) =>
        {
            var info = new MONITORINFOEX { cbSize = Marshal.SizeOf<MONITORINFOEX>() };
            if (GetMonitorInfo(hMon, ref info))
            {
                uint dpiX = 96, dpiY = 96;
                try { GetDpiForMonitor(hMon, 0, out dpiX, out dpiY); } catch { }
                raw.Add((
                    info.szDevice,
                    (info.dwFlags & 1) != 0,
                    info.rcMonitor.Left,
                    info.rcMonitor.Top,
                    info.rcMonitor.Right - info.rcMonitor.Left,
                    info.rcMonitor.Bottom - info.rcMonitor.Top,
                    Math.Round(dpiX / 96.0, 2)
                ));
            }
            return true;
        }, IntPtr.Zero);

        raw.Sort((a, b) =>
        {
            if (a.primary != b.primary) return a.primary ? -1 : 1;
            int cmpX = a.x.CompareTo(b.x);
            return cmpX != 0 ? cmpX : a.y.CompareTo(b.y);
        });

        var list = new List<MonInfo>();
        var payloadList = new List<object>();
        for (int i = 0; i < raw.Count; i++)
        {
            var m = raw[i];
            list.Add(new MonInfo(i, m.device, m.primary, m.x, m.y, m.w, m.h, m.scale));
            payloadList.Add(new
            {
                index = i,
                device = m.device,
                primary = m.primary,
                x = m.x,
                y = m.y,
                width = m.w,
                height = m.h,
                scaleFactor = m.scale
            });
        }

        lock (_overlayLock)
        {
            _monitors = list;
            _placementDirty = true;
            _overlayDirty = true;
        }
        return payloadList;
    }

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private static void LaunchStudioWindow(string? openTab = null)
    {
        if (_studioConnected)
        {
            Emit(new { type = "trayAction", action = openTab ?? "openStudio" });
            return;
        }
        if (string.IsNullOrEmpty(_studioExePath) || !File.Exists(_studioExePath)) return;
        try
        {
            var extra = string.IsNullOrEmpty(openTab) ? "" : $" --open-tab={openTab}";
            var args = string.IsNullOrEmpty(_studioLaunchArgs) ? extra.Trim() : $"{_studioLaunchArgs}{extra}";
            Process.Start(new ProcessStartInfo
            {
                FileName = _studioExePath,
                Arguments = args,
                UseShellExecute = false
            });
        }
        catch { }
    }

    private static void ApplyProfileLocally(TrayProfileEntry profile)
    {
        lock (_overlayLock)
        {
            if (profile.config != null) _activeConfig = profile.config;
            _selectedMonitorIndex = profile.monitorIndex;
            foreach (var p in _trayProfiles) p.active = p.id == profile.id;
            string? secId = _activeConfig.animation?.adsSecondaryProfileId;
            _secondaryAdsConfig = !string.IsNullOrEmpty(secId)
                ? _trayProfiles.Find(x => x.id == secId)?.config
                : null;
            _placementDirty = true;
            _overlayDirty = true;
            _trayMenuDirty = true;
        }
        PersistQuickChangeToDisk(profile.id, null, null, null);
    }

    private static void PersistQuickChangeToDisk(string? newProfileId, bool? newEnabled, float? newOx, float? newOy)
    {
        if (string.IsNullOrEmpty(_stateFilePath) || !File.Exists(_stateFilePath)) return;
        try
        {
            var rootNode = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(_stateFilePath));
            if (rootNode is not System.Text.Json.Nodes.JsonObject obj) return;
            if (newEnabled.HasValue && obj["settings"] is System.Text.Json.Nodes.JsonObject setObj)
                setObj["overlayEnabled"] = newEnabled.Value;
            if (!string.IsNullOrEmpty(newProfileId))
            {
                obj["activeProfileId"] = newProfileId;
                var found = _trayProfiles.Find(x => x.id == newProfileId);
                if (found?.config != null)
                {
                    obj["activeConfig"] = JsonSerializer.SerializeToNode(found.config);
                    if (obj["settings"] is System.Text.Json.Nodes.JsonObject s2)
                        s2["selectedMonitorIndex"] = found.monitorIndex;
                }
            }
            if ((newOx.HasValue || newOy.HasValue) && obj["activeConfig"]?["position"] is System.Text.Json.Nodes.JsonObject posObj)
            {
                if (newOx.HasValue) posObj["offsetX"] = newOx.Value;
                if (newOy.HasValue) posObj["offsetY"] = newOy.Value;
            }
            File.WriteAllText(_stateFilePath, obj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }

    private static void HandleCommandLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line)) return;
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            if (!root.TryGetProperty("cmd", out var cmdProp)) return;
            var cmd = cmdProp.GetString();

            switch (cmd)
            {
                case "registerStudio":
                    if (root.TryGetProperty("exePath", out var ep)) _studioExePath = ep.GetString() ?? "";
                    if (root.TryGetProperty("launchArgs", out var la)) _studioLaunchArgs = la.GetString() ?? "";
                    if (root.TryGetProperty("stateFilePath", out var sf))
                    {
                        _stateFilePath = sf.GetString() ?? "";
                        RobRunOptimizerEngine.SetBackupDirFromStatePath(_stateFilePath);
                    }
                    break;

                case "syncAudioLimiter":
                    if (root.TryGetProperty("config", out var alCfg) && alCfg.ValueKind == JsonValueKind.Object)
                    {
                        var parsedAl = JsonSerializer.Deserialize<AudioLimiterConfigDto>(alCfg.GetRawText(), JsonOpts);
                        if (parsedAl != null) ProcessAudioEngine.UpdateConfig(parsedAl);
                    }
                    break;

                case "getAudioDevices":
                    Emit(new
                    {
                        type = "audioDevices",
                        devices = ProcessAudioEngine.GetPlaybackEndpoints(),
                        processes = ProcessAudioEngine.ListRunningAudioOrGameProcesses()
                    });
                    break;

                case "syncOptimizer":
                    if (root.TryGetProperty("config", out var optCfg) && optCfg.ValueKind == JsonValueKind.Object)
                    {
                        var parsedOpt = JsonSerializer.Deserialize<RobRunOptimizerConfigDto>(optCfg.GetRawText(), JsonOpts);
                        if (parsedOpt != null) RobRunOptimizerEngine.UpdateConfig(parsedOpt);
                    }
                    Emit(RobRunOptimizerEngine.BuildStatusPayload());
                RunOnUiThread(() => Emit(HyperHueEngine.BuildStatusPayload()));
                    break;

                case "getOptimizerStatus":
                    Emit(RobRunOptimizerEngine.BuildStatusPayload());
                RunOnUiThread(() => Emit(HyperHueEngine.BuildStatusPayload()));
                    break;

                case "applyOptimizerNow":
                    if (root.TryGetProperty("config", out var applyCfg) && applyCfg.ValueKind == JsonValueKind.Object)
                    {
                        var parsedApply = JsonSerializer.Deserialize<RobRunOptimizerConfigDto>(applyCfg.GetRawText(), JsonOpts);
                        if (parsedApply != null)
                        {
                            var (ok, message) = RobRunOptimizerEngine.ApplyConfigToDisk(parsedApply);
                            Emit(new { type = "optimizerActionResult", action = "apply", ok, message });
                            Emit(RobRunOptimizerEngine.BuildStatusPayload());
                RunOnUiThread(() => Emit(HyperHueEngine.BuildStatusPayload()));
                        }
                    }
                    break;

                case "restoreOptimizerBackup":
                    {
                        var (ok, message) = RobRunOptimizerEngine.RestoreOriginalBackup();
                        Emit(new { type = "optimizerActionResult", action = "restore", ok, message });
                        Emit(RobRunOptimizerEngine.BuildStatusPayload());
                RunOnUiThread(() => Emit(HyperHueEngine.BuildStatusPayload()));
                    }
                    break;

                case "restoreDesktopNow":
                    {
                        bool restored = RobRunOptimizerEngine.RestoreDesktopDisplayNow();
                        Emit(new
                        {
                            type = "optimizerActionResult",
                            action = "restoreDesktop",
                            ok = restored,
                            message = restored ? "Restored desktop resolution and refresh rate." : "Desktop is already using normal settings."
                        });
                        Emit(RobRunOptimizerEngine.BuildStatusPayload());
                RunOnUiThread(() => Emit(HyperHueEngine.BuildStatusPayload()));
                    }
                    break;

                case "launchRobRun":
                    if (root.TryGetProperty("config", out var launchCfg) && launchCfg.ValueKind == JsonValueKind.Object)
                    {
                        var parsedLaunch = JsonSerializer.Deserialize<RobRunOptimizerConfigDto>(launchCfg.GetRawText(), JsonOpts);
                        if (parsedLaunch != null)
                        {
                            var (ok, message) = RobRunOptimizerEngine.LaunchRobRunOptimized(parsedLaunch);
                            Emit(new { type = "optimizerActionResult", action = "launch", ok, message });
                            Emit(RobRunOptimizerEngine.BuildStatusPayload());
                RunOnUiThread(() => Emit(HyperHueEngine.BuildStatusPayload()));
                        }
                    }
                    break;

                case "syncColorFilter":
                    if (root.TryGetProperty("config", out var cfCfg) && cfCfg.ValueKind == JsonValueKind.Object)
                    {
                        bool flash = root.TryGetProperty("flash", out var fl) && fl.GetBoolean();
                        var parsedCf = JsonSerializer.Deserialize<ColorFilterConfigDto>(cfCfg.GetRawText(), JsonOpts);
                        if (parsedCf != null)
                        {
                            RunOnUiThread(() =>
                            {
                                HyperHueEngine.UpdateConfigFromStudio(parsedCf, flash);
                                _trayMenuDirty = true;
                            });
                        }
                    }
                    break;

                case "getColorStatus":
                    RunOnUiThread(() => Emit(HyperHueEngine.BuildStatusPayload()));
                    break;

                case "getMigratedColorConfig":
                    RunOnUiThread(() => Emit(new
                    {
                        type = "colorMigratedConfig",
                        config = HyperHueEngine.TryMigrateLegacyHyperHueConfig()
                    }));
                    break;

                case "previewColorHud":
                    RunOnUiThread(() => HyperHueEngine.PreviewHud());
                    break;

                case "unlockGammaRange":
                    Task.Run(() =>
                    {
                        bool unlocked = HyperHueEngine.UnlockGammaRange();
                        Emit(new
                        {
                            type = "colorActionResult",
                            action = "unlockGamma",
                            ok = unlocked,
                            message = unlocked
                                ? "Unlocked full gamma range. Sign out or restart Windows to apply."
                                : "Gamma unlock was declined or cancelled."
                        });
                    });
                    break;

                case "captureCleanScreen":
                    RunOnUiThread(() =>
                    {
                        string? dataUrl = HyperHueEngine.CaptureCleanScreenDataUrl();
                        Emit(new
                        {
                            type = "colorScreenCapture",
                            ok = !string.IsNullOrEmpty(dataUrl),
                            dataUrl = dataUrl ?? ""
                        });
                    });
                    break;

                case "syncSystemTuner":
                    if (root.TryGetProperty("config", out var stCfg) && stCfg.ValueKind == JsonValueKind.Object)
                    {
                        var parsedSt = JsonSerializer.Deserialize<SystemTunerConfigDto>(stCfg.GetRawText(), JsonOpts);
                        if (parsedSt != null) SystemTunerEngine.UpdateConfig(parsedSt);
                    }
                    Emit(SystemTunerEngine.BuildStatusPayload());
                    break;

                case "getSystemTunerStatus":
                    Emit(SystemTunerEngine.BuildStatusPayload());
                    break;

                case "applySystemUserTweaks":
                    if (root.TryGetProperty("config", out var stUserCfg) && stUserCfg.ValueKind == JsonValueKind.Object)
                    {
                        var parsedUser = JsonSerializer.Deserialize<SystemTunerConfigDto>(stUserCfg.GetRawText(), JsonOpts);
                        if (parsedUser != null)
                        {
                            var (ok, message) = SystemTunerEngine.ApplyUserTweaksNow(parsedUser);
                            Emit(new { type = "systemTunerActionResult", action = "applyUser", ok, message });
                            Emit(SystemTunerEngine.BuildStatusPayload());
                        }
                    }
                    break;

                case "applySystemKernelTweaks":
                    if (root.TryGetProperty("config", out var stKernelCfg) && stKernelCfg.ValueKind == JsonValueKind.Object)
                    {
                        var parsedKernel = JsonSerializer.Deserialize<SystemTunerConfigDto>(stKernelCfg.GetRawText(), JsonOpts);
                        if (parsedKernel != null)
                        {
                            Task.Run(() =>
                            {
                                var (ok, message) = SystemTunerEngine.ApplyElevatedKernelAndNetworkTweaks(parsedKernel);
                                Emit(new { type = "systemTunerActionResult", action = "applyKernel", ok, message });
                                Emit(SystemTunerEngine.BuildStatusPayload());
                            });
                        }
                    }
                    break;

                case "restoreSystemDefaults":
                    Task.Run(() =>
                    {
                        var (ok, message) = SystemTunerEngine.RestoreWindowsDefaults();
                        Emit(new { type = "systemTunerActionResult", action = "restore", ok, message });
                        Emit(SystemTunerEngine.BuildStatusPayload());
                    });
                    break;

                case "purgeStandbyRam":
                    {
                        var (ok, message) = SystemTunerEngine.PurgeBackgroundMemory();
                        Emit(new { type = "systemTunerActionResult", action = "purgeRam", ok, message });
                        Emit(SystemTunerEngine.BuildStatusPayload());
                    }
                    break;

                case "cleanShaderCache":
                    Task.Run(() =>
                    {
                        var (ok, message) = SystemTunerEngine.CleanTempAndShaderCache();
                        Emit(new { type = "systemTunerActionResult", action = "cleanCache", ok, message });
                        Emit(SystemTunerEngine.BuildStatusPayload());
                    });
                    break;

                case "syncOverlay":
                    lock (_overlayLock)
                    {
                        if (root.TryGetProperty("enabled", out var en))
                            _overlayEnabled = en.GetBoolean();
                        if (root.TryGetProperty("monitorIndex", out var mi))
                            _selectedMonitorIndex = mi.GetInt32();
                        if (root.TryGetProperty("activeConfig", out var ac) && ac.ValueKind == JsonValueKind.Object)
                        {
                            var parsed = JsonSerializer.Deserialize<CrosshairConfigDto>(ac.GetRawText(), JsonOpts);
                            if (parsed != null) _activeConfig = parsed;
                        }
                        if (root.TryGetProperty("secondaryAdsConfig", out var sc) && sc.ValueKind == JsonValueKind.Object)
                            _secondaryAdsConfig = JsonSerializer.Deserialize<CrosshairConfigDto>(sc.GetRawText(), JsonOpts);
                        else if (root.TryGetProperty("secondaryAdsConfig", out var scNull) && scNull.ValueKind == JsonValueKind.Null)
                            _secondaryAdsConfig = null;
                        _placementDirty = true;
                        _overlayDirty = true;
                        _trayMenuDirty = true;
                    }
                    break;

                case "syncProfiles":
                    if (root.TryGetProperty("profiles", out var profEl) && profEl.ValueKind == JsonValueKind.Array)
                    {
                        var list = JsonSerializer.Deserialize<List<TrayProfileEntry>>(profEl.GetRawText(), JsonOpts);
                        if (list != null)
                        {
                            lock (_overlayLock)
                            {
                                _trayProfiles = list;
                                _trayMenuDirty = true;
                            }
                        }
                    }
                    break;

                case "getMonitors":
                    Emit(new { type = "monitors", monitors = CollectMonitorsPayload() });
                    break;

                case "setConfig":
                    if (root.TryGetProperty("strictStaticMode", out var ssm)) _strictStaticMode = ssm.GetBoolean();
                    if (root.TryGetProperty("foregroundWatch", out var fw)) _enableForegroundWindowWatch = fw.GetBoolean();
                    if (root.TryGetProperty("topmostKeepAlive", out var tka)) _enableOverlayTopmostKeepAlive = tka.GetBoolean();
                    if (root.TryGetProperty("toggleVk", out var tvk)) _customToggleVk = tvk.GetInt32();
                    if (root.TryGetProperty("toggleAlt", out var talt)) _customToggleAlt = talt.GetBoolean();
                    if (root.TryGetProperty("toggleCtrl", out var tctrl)) _customToggleCtrl = tctrl.GetBoolean();
                    if (root.TryGetProperty("toggleShift", out var tshift)) _customToggleShift = tshift.GetBoolean();
                    if (root.TryGetProperty("adsCustomVk", out var advk)) _adsCustomVk = advk.GetInt32();
                    _overlayDirty = true;
                    break;

                case "detachStudio":
                    lock (_pipeOutLock)
                    {
                        _intentionalDetach = true;
                        _studioConnected = false;
                        _pipeWriter = null;
                    }
                    TrimOwnMemory();
                    break;

                case "quit":
                    _running = false;
                    SystemTunerEngine.Shutdown();
                    ProcessAudioEngine.Stop();
                    RobRunOptimizerEngine.Stop();
                    try { _overlayForm?.BeginInvoke(new Action(() => Application.ExitThread())); } catch { }
                    break;
            }
        }
        catch { }
    }

    private static async Task RunNamedPipeServerLoop()
    {
        while (_running)
        {
            try
            {
                using var server = new NamedPipeServerStream(
                    PIPE_NAME,
                    PipeDirection.InOut,
                    1,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous);

                await server.WaitForConnectionAsync();
                if (!_running) break;

                using var reader = new StreamReader(server, Encoding.UTF8, false, 4096, leaveOpen: true);
                using var writer = new StreamWriter(server, new UTF8Encoding(false), 4096, leaveOpen: true) { AutoFlush = true };

                lock (_pipeOutLock)
                {
                    _pipeWriter = writer;
                    _studioConnected = true;
                    _intentionalDetach = false;
                }

                Emit(BuildReadyPayload());
                Emit(new { type = "monitors", monitors = CollectMonitorsPayload() });
                Emit(new
                {
                    type = "audioDevices",
                    devices = ProcessAudioEngine.GetPlaybackEndpoints(),
                    processes = ProcessAudioEngine.ListRunningAudioOrGameProcesses()
                });
                Emit(SystemTunerEngine.BuildStatusPayload());
                Emit(RobRunOptimizerEngine.BuildStatusPayload());
                RunOnUiThread(() => Emit(HyperHueEngine.BuildStatusPayload()));

                string? line;
                while (_running && server.IsConnected && (line = await reader.ReadLineAsync()) != null)
                {
                    HandleCommandLine(line);
                }

                // If ZeroPoint.exe disconnected WITHOUT sending detachStudio (e.g. Task Manager "End Task"),
                // exit WinBridge immediately so the crosshair overlay closes cleanly too!
                if (_running && !_intentionalDetach)
                {
                    _running = false;
                    try { _overlayForm?.BeginInvoke(new Action(() => Application.ExitThread())); } catch { }
                    break;
                }
            }
            catch
            {
                await Task.Delay(200);
            }
            finally
            {
                lock (_pipeOutLock)
                {
                    _pipeWriter = null;
                    _studioConnected = false;
                }
                TrimOwnMemory();
            }
        }
    }

    private static async Task RunStdioTestLoop()
    {
        try
        {
            string? line;
            while (_running && (line = await Console.In.ReadLineAsync()) != null)
            {
                HandleCommandLine(line);
            }
        }
        finally
        {
            _running = false;
            try { _overlayForm?.BeginInvoke(new Action(() => Application.ExitThread())); } catch { }
        }
    }

    private static void HandleHotkeyOrForward(string action, int dx = 0, int dy = 0, int slot = -1)
    {
        if (action == "toggleStudio")
        {
            LaunchStudioWindow("toggleStudio");
            return;
        }

        if (_studioConnected)
        {
            Emit(new { type = "hotkey", action, dx, dy, slot });
            return;
        }

        // Studio is unloaded (0 MB RAM Gaming Mode) — handle directly in native WinBridge!
        if (action == "toggleOverlay")
        {
            bool next;
            lock (_overlayLock)
            {
                _overlayEnabled = !_overlayEnabled;
                next = _overlayEnabled;
                _overlayDirty = true;
                _trayMenuDirty = true;
            }
            PersistQuickChangeToDisk(null, next, null, null);
        }
        else if (action == "nudge")
        {
            float ox, oy;
            lock (_overlayLock)
            {
                _activeConfig.position.offsetX = Math.Clamp(_activeConfig.position.offsetX + dx, -500, 500);
                _activeConfig.position.offsetY = Math.Clamp(_activeConfig.position.offsetY + dy, -500, 500);
                ox = _activeConfig.position.offsetX;
                oy = _activeConfig.position.offsetY;
                _placementDirty = true;
                _overlayDirty = true;
            }
            PersistQuickChangeToDisk(null, null, ox, oy);
        }
        else if (action == "quickSlot" && slot >= 0)
        {
            TrayProfileEntry? target;
            lock (_overlayLock) { target = _trayProfiles.Find(p => p.quickSlot == slot); }
            if (target != null) ApplyProfileLocally(target);
        }
        else if (action == "nextProfile" || action == "prevProfile")
        {
            TrayProfileEntry? target = null;
            lock (_overlayLock)
            {
                if (_trayProfiles.Count > 0)
                {
                    int idx = _trayProfiles.FindIndex(p => p.active);
                    int nextIdx = action == "nextProfile"
                        ? (idx + 1) % _trayProfiles.Count
                        : (idx - 1 + _trayProfiles.Count) % _trayProfiles.Count;
                    target = _trayProfiles[nextIdx];
                }
            }
            if (target != null) ApplyProfileLocally(target);
        }
    }

    private static void RunInputLoop()
    {
        bool prevLmb = false, prevRmb = false, prevMmb = false, prevX1 = false, prevX2 = false;
        bool prevMoving = false, prevSprint = false, prevCrouch = false, prevJump = false;
        bool prevAdsKey = false;
        bool prevCtrlConnected = false, prevCtrlFire = false, prevCtrlAds = false, prevCtrlMoving = false;

        bool prevToggleCombo = false, prevNextCombo = false, prevPrevCombo = false, prevStudioCombo = false;
        bool prevUpCombo = false, prevDownCombo = false, prevLeftCombo = false, prevRightCombo = false;
        bool[] prevSlots = new bool[9];

        string lastForegroundTitle = string.Empty;
        var swForeground = Stopwatch.StartNew();
        var swControllerScan = Stopwatch.StartNew();

        while (_running)
        {
            if (!_strictStaticMode && _enableForegroundWindowWatch && swForeground.ElapsedMilliseconds >= 1000)
            {
                swForeground.Restart();
                var fg = GetForegroundWindow();
                if (fg != IntPtr.Zero)
                {
                    var sb = new StringBuilder(256);
                    int len = GetWindowText(fg, sb, sb.Capacity);
                    var title = len > 0 ? sb.ToString() : string.Empty;
                    if (!string.Equals(title, lastForegroundTitle, StringComparison.Ordinal))
                    {
                        lastForegroundTitle = title;
                        if (_studioConnected)
                        {
                            Emit(new { type = "foreground", title });
                        }
                        else if (!string.IsNullOrWhiteSpace(title))
                        {
                            var lower = title.ToLowerInvariant();
                            TrayProfileEntry? match;
                            lock (_overlayLock)
                            {
                                match = _trayProfiles.Find(p =>
                                    !p.active && p.gameTitleMatchers.Exists(m => !string.IsNullOrWhiteSpace(m) && lower.Contains(m.Trim().ToLowerInvariant())));
                            }
                            if (match != null) ApplyProfileLocally(match);
                        }
                    }
                }
            }

            if (_strictStaticMode)
            {
                Thread.Sleep(60);
                continue;
            }

            bool lmb = IsKeyDown(VK_LBUTTON);
            bool rmb = IsKeyDown(VK_RBUTTON);
            bool mmb = IsKeyDown(VK_MBUTTON);
            bool x1 = IsKeyDown(VK_XBUTTON1);
            bool x2 = IsKeyDown(VK_XBUTTON2);

            bool moving = IsKeyDown(VK_W) || IsKeyDown(VK_A) || IsKeyDown(VK_S) || IsKeyDown(VK_D);
            bool sprint = IsKeyDown(VK_SHIFT);
            bool crouch = IsKeyDown(VK_CONTROL);
            bool jump = IsKeyDown(VK_SPACE);
            bool adsCustom = _adsCustomVk > 0 && IsKeyDown(_adsCustomVk);

            bool ctrlConnected = prevCtrlConnected;
            bool ctrlFire = false, ctrlAds = false, ctrlMoving = false;
            int ctrlLt = 0, ctrlRt = 0;

            if (prevCtrlConnected || swControllerScan.ElapsedMilliseconds >= 1500)
            {
                if (!prevCtrlConnected) swControllerScan.Restart();
                ctrlConnected = false;
                for (uint i = 0; i < 4; i++)
                {
                    if (TryXInputGetState(i, out var xState) == 0)
                    {
                        ctrlConnected = true;
                        ctrlLt = xState.Gamepad.bLeftTrigger;
                        ctrlRt = xState.Gamepad.bRightTrigger;
                        ctrlAds = ctrlLt > 40;
                        ctrlFire = ctrlRt > 40;
                        double lx = xState.Gamepad.sThumbLX / 32768.0;
                        double ly = xState.Gamepad.sThumbLY / 32768.0;
                        ctrlMoving = Math.Sqrt(lx * lx + ly * ly) > 0.25;
                        break;
                    }
                }
            }

            if (lmb != prevLmb || rmb != prevRmb || mmb != prevMmb || x1 != prevX1 || x2 != prevX2 ||
                moving != prevMoving || sprint != prevSprint || crouch != prevCrouch || jump != prevJump ||
                adsCustom != prevAdsKey || ctrlConnected != prevCtrlConnected ||
                ctrlFire != prevCtrlFire || ctrlAds != prevCtrlAds || ctrlMoving != prevCtrlMoving)
            {
                prevLmb = lmb; prevRmb = rmb; prevMmb = mmb; prevX1 = x1; prevX2 = x2;
                prevMoving = moving; prevSprint = sprint; prevCrouch = crouch; prevJump = jump;
                prevAdsKey = adsCustom;
                prevCtrlConnected = ctrlConnected;
                prevCtrlFire = ctrlFire; prevCtrlAds = ctrlAds; prevCtrlMoving = ctrlMoving;

                lock (_overlayLock)
                {
                    _liveInput = new InputSnapshot
                    {
                        Lmb = lmb, Rmb = rmb, Mmb = mmb, X1 = x1, X2 = x2,
                        Moving = moving, Sprint = sprint, Crouch = crouch, Jump = jump, AdsCustom = adsCustom,
                        CtrlFire = ctrlFire, CtrlAds = ctrlAds, CtrlMoving = ctrlMoving
                    };
                    _overlayDirty = true;
                }

                if (_studioConnected)
                {
                    Emit(new
                    {
                        type = "input",
                        lmb, rmb, mmb, x1, x2,
                        moving = moving || ctrlMoving,
                        sprint, crouch, jump, adsCustom,
                        controller = new { connected = ctrlConnected, fire = ctrlFire, ads = ctrlAds, moving = ctrlMoving, lt = ctrlLt, rt = ctrlRt }
                    });
                }
            }

            bool alt = IsKeyDown(VK_MENU);
            bool ctrl = IsKeyDown(VK_CONTROL);
            bool shift = IsKeyDown(VK_SHIFT);

            bool toggleCombo = (_customToggleVk > 0) && IsKeyDown(_customToggleVk) &&
                               (alt == _customToggleAlt) && (ctrl == _customToggleCtrl) && (shift == _customToggleShift);
            if (toggleCombo && !prevToggleCombo) HandleHotkeyOrForward("toggleOverlay");
            prevToggleCombo = toggleCombo;

            bool studioCombo = alt && shift && !ctrl && IsKeyDown(VK_X);
            if (studioCombo && !prevStudioCombo) HandleHotkeyOrForward("toggleStudio");
            prevStudioCombo = studioCombo;

            bool nextCombo = alt && !ctrl && !shift && IsKeyDown(VK_OEM_6);
            if (nextCombo && !prevNextCombo) HandleHotkeyOrForward("nextProfile");
            prevNextCombo = nextCombo;

            bool prevCombo = alt && !ctrl && !shift && IsKeyDown(VK_OEM_4);
            if (prevCombo && !prevPrevCombo) HandleHotkeyOrForward("prevProfile");
            prevPrevCombo = prevCombo;

            bool upCombo = alt && !ctrl && !shift && IsKeyDown(VK_UP);
            if (upCombo && !prevUpCombo) HandleHotkeyOrForward("nudge", 0, -1);
            prevUpCombo = upCombo;

            bool downCombo = alt && !ctrl && !shift && IsKeyDown(VK_DOWN);
            if (downCombo && !prevDownCombo) HandleHotkeyOrForward("nudge", 0, 1);
            prevDownCombo = downCombo;

            bool leftCombo = alt && !ctrl && !shift && IsKeyDown(VK_LEFT);
            if (leftCombo && !prevLeftCombo) HandleHotkeyOrForward("nudge", -1, 0);
            prevLeftCombo = leftCombo;

            bool rightCombo = alt && !ctrl && !shift && IsKeyDown(VK_RIGHT);
            if (rightCombo && !prevRightCombo) HandleHotkeyOrForward("nudge", 1, 0);
            prevRightCombo = rightCombo;

            for (int s = 0; s < 9; s++)
            {
                bool slotDown = alt && !ctrl && !shift && IsKeyDown(0x31 + s);
                if (slotDown && !prevSlots[s]) HandleHotkeyOrForward("quickSlot", 0, 0, s);
                prevSlots[s] = slotDown;
            }

            Thread.Sleep(8);
        }
    }

    private static Icon CreateTrayIcon()
    {
        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            using var bg = new SolidBrush(Color.FromArgb(250, 20, 20, 24));
            using var border = new Pen(Color.FromArgb(255, 58, 58, 68), 1.5f);
            g.FillRectangle(bg, 3, 3, 26, 26);
            g.DrawRectangle(border, 3, 3, 26, 26);
            using var arm = new Pen(Color.FromArgb(255, 244, 244, 246), 2.4f);
            g.DrawLine(arm, 16, 6, 16, 12);
            g.DrawLine(arm, 16, 20, 16, 26);
            g.DrawLine(arm, 6, 16, 12, 16);
            g.DrawLine(arm, 20, 16, 26, 16);
            using var dot = new SolidBrush(Color.FromArgb(255, 255, 85, 38));
            g.FillEllipse(dot, 13.8f, 13.8f, 4.4f, 4.4f);
        }
        IntPtr hIcon = bmp.GetHicon();
        return Icon.FromHandle(hIcon);
    }

    private static void RebuildNativeTrayMenu()
    {
        if (_trayIcon == null) return;
        bool enabled;
        List<TrayProfileEntry> list;
        lock (_overlayLock)
        {
            enabled = _overlayEnabled;
            list = new List<TrayProfileEntry>(_trayProfiles);
        }

        var menu = new ContextMenuStrip();
        menu.Items.Add(new ToolStripMenuItem("ZeroPoint — Low-RAM Native Overlay") { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());

        var toggleItem = new ToolStripMenuItem(enabled ? "✓ Overlay Active (Click to Pause)" : "Overlay Paused (Click to Activate)");
        toggleItem.Click += (_, _) => HandleHotkeyOrForward("toggleOverlay");
        menu.Items.Add(toggleItem);

        var profilesMenu = new ToolStripMenuItem("Quick Switch Crosshair");
        if (list.Count == 0)
        {
            profilesMenu.DropDownItems.Add(new ToolStripMenuItem("Open Studio to load profiles") { Enabled = false });
        }
        else
        {
            foreach (var p in list)
            {
                var captured = p;
                var item = new ToolStripMenuItem(captured.name) { Checked = captured.active };
                item.Click += (_, _) =>
                {
                    if (_studioConnected) Emit(new { type = "trayAction", action = "selectProfile", profileId = captured.id });
                    else ApplyProfileLocally(captured);
                };
                profilesMenu.DropDownItems.Add(item);
            }
        }
        menu.Items.Add(profilesMenu);

        var colorActive = HyperHueEngine.IsEffectiveActive;
        var colorToggle = new ToolStripMenuItem(
            colorActive
                ? $"✓ Color Filters: {HyperHueEngine.EffectiveDisplayName} (Click to Pause)"
                : "Color Filters Paused (Click to Activate)");
        colorToggle.Click += (_, _) =>
        {
            HyperHueEngine.ToggleFromTrayOrHotkey();
            _trayMenuDirty = true;
        };
        menu.Items.Add(colorToggle);

        var colorPresetsMenu = new ToolStripMenuItem("Quick Switch Color Filter");
        var curColorCfg = HyperHueEngine.GetCurrentConfig();
        foreach (var preset in HyperHueEngine.AllPresets())
        {
            var capturedName = preset.name;
            var item = new ToolStripMenuItem(capturedName)
            {
                Checked = string.Equals(capturedName, curColorCfg.activePreset, StringComparison.OrdinalIgnoreCase)
            };
            item.Click += (_, _) =>
            {
                HyperHueEngine.SelectPresetFromTrayOrHotkey(capturedName);
                _trayMenuDirty = true;
            };
            colorPresetsMenu.DropDownItems.Add(item);
        }
        menu.Items.Add(colorPresetsMenu);
        menu.Items.Add(new ToolStripSeparator());

        var openStudio = new ToolStripMenuItem("Open ZeroPoint Studio");
        openStudio.Click += (_, _) => LaunchStudioWindow("openStudio");
        menu.Items.Add(openStudio);

        var openColor = new ToolStripMenuItem("Color Filters & Shadow Boost (HyperHue)");
        openColor.Click += (_, _) => LaunchStudioWindow("openColorFilters");
        menu.Items.Add(openColor);

        var openAudio = new ToolStripMenuItem("Gunshot Limiter & Footstep EQ");
        openAudio.Click += (_, _) => LaunchStudioWindow("openAudioLimiter");
        menu.Items.Add(openAudio);

        var openFps = new ToolStripMenuItem("ROB RUN Competitive FPS Optimizer");
        openFps.Click += (_, _) => LaunchStudioWindow("openFpsOptimizer");
        menu.Items.Add(openFps);

        var openRange = new ToolStripMenuItem("Launch The Range (3D Aim Trainer)");
        openRange.Click += (_, _) => LaunchStudioWindow("openAimTrainer");
        menu.Items.Add(openRange);

        var checkUpd = new ToolStripMenuItem("Check for Updates (Releases & Commits)");
        checkUpd.Click += (_, _) => LaunchStudioWindow("openUpdates");
        menu.Items.Add(checkUpd);

        menu.Items.Add(new ToolStripSeparator());
        var quitItem = new ToolStripMenuItem("Quit ZeroPoint (Restores Colors & Display)");
        quitItem.Click += (_, _) =>
        {
            if (_studioConnected) Emit(new { type = "trayAction", action = "quitAll" });
            _running = false;
            HyperHueEngine.ShutdownOnUiThread();
            ProcessAudioEngine.Stop();
            RobRunOptimizerEngine.Stop();
            Application.ExitThread();
        };
        menu.Items.Add(quitItem);

        _trayIcon.ContextMenuStrip?.Dispose();
        _trayIcon.ContextMenuStrip = menu;
        _trayIcon.Text = $"ZeroPoint — {(enabled ? "Overlay LIVE" : "Overlay PAUSED")}";
    }

    [STAThread]
    public static void Main(string[] args)
    {
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--stdio-test") _headlessTestMode = true;
            else if (args[i] == "--studio-exe" && i + 1 < args.Length) _studioExePath = args[++i];
            else if (args[i] == "--studio-args" && i + 1 < args.Length) _studioLaunchArgs = args[++i];
            else if (args[i] == "--state-file" && i + 1 < args.Length) _stateFilePath = args[++i];
        }

        bool createdNew = true;
        using var singleton = _headlessTestMode ? null : new Mutex(true, MUTEX_NAME, out createdNew);
        if (!_headlessTestMode && !createdNew)
        {
            return; // Already running!
        }

        try { SetProcessDpiAwareness(2); } catch { }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        var monPayload = CollectMonitorsPayload();
        if (_headlessTestMode)
        {
            Emit(BuildReadyPayload());
            Emit(new { type = "monitors", monitors = monPayload });
        }

        _overlayForm = new NativeOverlayForm();
        if (!_headlessTestMode)
        {
            _trayIcon = new NotifyIcon
            {
                Icon = CreateTrayIcon(),
                Visible = true,
                Text = "ZeroPoint — Overlay LIVE"
            };
            _trayIcon.MouseClick += (_, e) =>
            {
                if (e.Button == MouseButtons.Left) LaunchStudioWindow("openStudio");
            };
            RebuildNativeTrayMenu();
        }

        var anim = new NativeAnimController();
        var swFrame = Stopwatch.StartNew();
        var swTopmost = Stopwatch.StartNew();
        var swColorWatch = Stopwatch.StartNew();
        var swMemTrim = Stopwatch.StartNew();

        SystemTunerEngine.Init(_stateFilePath);
        LoadInitialFeatureConfigsFromDisk();
        HyperHueEngine.InitOnUiThread(_stateFilePath, _headlessTestMode, Emit, cfg =>
        {
            PersistColorConfigToDisk(cfg);
            _trayMenuDirty = true;
        });
        ProcessAudioEngine.Start(Emit);
        RobRunOptimizerEngine.Start(
            _stateFilePath,
            Emit,
            () => Emit(new { type = "monitors", monitors = CollectMonitorsPayload() }),
            ResolveMonitorDeviceName
        );

        _ = Task.Run(_headlessTestMode ? RunStdioTestLoop : RunNamedPipeServerLoop);
        var inputThread = new Thread(RunInputLoop) { IsBackground = true };
        inputThread.Start();

        var renderTimer = new System.Windows.Forms.Timer { Interval = 8 };
        bool wasAnimating = false;
        bool lastVisible = false;
        bool didInitialTrim = false;

        renderTimer.Tick += (_, _) =>
        {
            if (!_running)
            {
                renderTimer.Stop();
                Application.ExitThread();
                return;
            }

            if (_trayMenuDirty && !_headlessTestMode)
            {
                _trayMenuDirty = false;
                RebuildNativeTrayMenu();
            }

            if (swColorWatch.ElapsedMilliseconds >= 400)
            {
                swColorWatch.Restart();
                HyperHueEngine.TickOnUiThread();
            }

            bool enabled;
            int monIdx;
            CrosshairConfigDto cfg;
            CrosshairConfigDto? secCfg;
            InputSnapshot inp;
            MonInfo? mon;
            bool dirty;
            bool placeDirty;

            lock (_overlayLock)
            {
                enabled = _overlayEnabled;
                monIdx = _selectedMonitorIndex;
                cfg = _activeConfig;
                secCfg = _secondaryAdsConfig;
                inp = _liveInput;
                mon = (monIdx >= 0 && monIdx < _monitors.Count) ? _monitors[monIdx] : (_monitors.Count > 0 ? _monitors[0] : null);
                dirty = _overlayDirty;
                placeDirty = _placementDirty;
                _overlayDirty = false;
                _placementDirty = false;
            }

            if (enabled != lastVisible)
            {
                lastVisible = enabled;
                _overlayForm.SetOverlayVisibility(enabled);
                dirty = true;
                placeDirty = true;
            }

            if (!enabled)
            {
                swFrame.Restart();
                return;
            }

            float dpiScale = (float)(mon?.ScaleFactor ?? 1.0);
            if (placeDirty && mon != null)
            {
                int winPx = Math.Clamp((int)Math.Round(360 * dpiScale), 200, 640);
                int cx = (int)Math.Round(mon.X + mon.Width / 2.0 + cfg.position.offsetX * dpiScale);
                int cy = (int)Math.Round(mon.Y + mon.Height / 2.0 + cfg.position.offsetY * dpiScale);
                _overlayForm.SetOverlayPlacement(cx - winPx / 2, cy - winPx / 2, winPx);
                _overlayForm.SetOverlayVisibility(true);
            }

            if (_enableOverlayTopmostKeepAlive && swTopmost.ElapsedMilliseconds >= 1500)
            {
                swTopmost.Restart();
                _overlayForm.KeepTopmost();
            }

            bool needsIdleTick = cfg.animation.idleType != "none";
            if (!dirty && !wasAnimating && !needsIdleTick)
            {
                swFrame.Restart();
                if (!didInitialTrim || swMemTrim.ElapsedMilliseconds >= 20000)
                {
                    didInitialTrim = true;
                    swMemTrim.Restart();
                    TrimOwnMemory();
                }
                return;
            }

            float dt = (float)swFrame.Elapsed.TotalSeconds;
            swFrame.Restart();

            var frame = anim.Step(cfg, _strictStaticMode ? default : inp, dt);
            wasAnimating = frame.IsAnimating;
            var drawCfg = (frame.UseSecondaryProfile && secCfg != null) ? secCfg : cfg;
            _overlayForm.RenderFrame(drawCfg, frame, dpiScale);
        };

        renderTimer.Start();
        Application.Run();

        HyperHueEngine.ShutdownOnUiThread();
        SystemTunerEngine.Shutdown();
        ProcessAudioEngine.Stop();
        RobRunOptimizerEngine.Stop();

        if (_trayIcon != null)
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
        }
        _overlayForm.Dispose();
    }
}
