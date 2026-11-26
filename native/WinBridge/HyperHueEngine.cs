using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows.Forms;
using Microsoft.Win32;

namespace WinBridge;

public sealed class ColorLookDto
{
    public string name { get; set; } = "Hyper";
    public bool builtIn { get; set; }
    public float brightness { get; set; } = 0f;     // -0.5 .. 0.5
    public float contrast { get; set; } = 1f;       // 0.5 .. 2.0
    public float temperature { get; set; } = 0f;    // -1.0 .. 1.0
    public float saturation { get; set; } = 1f;     // 0.0 .. 4.0
    public float hue { get; set; } = 0f;            // -180 .. 180
    public float shadowBoost { get; set; } = 1f;    // 1.0 .. 3.0

    public ColorLookDto Clone() => new()
    {
        name = name,
        builtIn = builtIn,
        brightness = brightness,
        contrast = contrast,
        temperature = temperature,
        saturation = saturation,
        hue = hue,
        shadowBoost = shadowBoost
    };

    public bool SameValues(ColorLookDto? o)
    {
        if (o == null) return false;
        return Near(brightness, o.brightness)
            && Near(contrast, o.contrast)
            && Near(temperature, o.temperature)
            && Near(saturation, o.saturation)
            && Near(hue, o.hue)
            && Near(shadowBoost, o.shadowBoost);
    }

    public void Sanitize()
    {
        brightness = Clamp(brightness, -0.5f, 0.5f);
        contrast = Clamp(contrast, 0.5f, 2f);
        temperature = Clamp(temperature, -1f, 1f);
        saturation = Clamp(saturation, 0f, 4f);
        hue = Clamp(hue, -180f, 180f);
        shadowBoost = Clamp(shadowBoost, 1f, 3f);
        if (string.IsNullOrWhiteSpace(name)) name = "Custom";
        if (name.Length > 28) name = name[..28];
    }

    private static bool Near(float a, float b) => Math.Abs(a - b) < 0.0005f;
    private static float Clamp(float v, float lo, float hi) => float.IsNaN(v) ? lo : (v < lo ? lo : (v > hi ? hi : v));

    public static List<ColorLookDto> BuiltIns() => new()
    {
        new ColorLookDto { name = "Stock", builtIn = true },
        new ColorLookDto { name = "Vivid", builtIn = true, saturation = 1.4f, contrast = 1.05f },
        new ColorLookDto { name = "Hyper", builtIn = true, saturation = 2.0f, contrast = 1.08f, temperature = -0.15f },
        new ColorLookDto { name = "Overclock", builtIn = true, saturation = 2.6f, contrast = 1.15f, brightness = 0.02f, temperature = -0.25f },
        new ColorLookDto { name = "Night Vision", builtIn = true, saturation = 1.3f, contrast = 1.05f, brightness = 0.04f, shadowBoost = 2.2f },
        new ColorLookDto { name = "Spotter", builtIn = true, saturation = 1.6f, contrast = 1.1f, shadowBoost = 1.5f, temperature = -0.05f },
        new ColorLookDto { name = "Golden", builtIn = true, saturation = 1.25f, contrast = 1.1f, temperature = 0.35f },
    };
}

public sealed class ColorAppRuleDto
{
    public string process { get; set; } = "";
    public string preset { get; set; } = "Hyper";
}

public sealed class ColorHotkeyBindingDto
{
    public string action { get; set; } = ""; // "toggle" | "next" | "prev" | "hud"
    public uint modifiers { get; set; } = 0x0002; // MOD_CONTROL
    public int vk { get; set; } = 0x78; // F9
}

public sealed class ColorFilterConfigDto
{
    public bool enabled { get; set; } = false;
    public string activePreset { get; set; } = "Hyper";
    public ColorLookDto working { get; set; } = new() { name = "Hyper", saturation = 2.0f, contrast = 1.08f, temperature = -0.15f };
    public ColorLookDto applied { get; set; } = new() { name = "Hyper", saturation = 2.0f, contrast = 1.08f, temperature = -0.15f };
    public bool autoApply { get; set; } = true;
    public List<ColorLookDto> customPresets { get; set; } = new();
    public string engineMode { get; set; } = "screen"; // "screen" | "amd"
    public bool shadowBoostEnabled { get; set; } = true;
    public List<ColorAppRuleDto> rules { get; set; } = new();
    public bool rulesOnly { get; set; } = false;
    public bool hudToasts { get; set; } = true;
    public bool hudPinned { get; set; } = false;
    public string hudCorner { get; set; } = "TopRight"; // "TopLeft" | "TopRight" | "BottomLeft" | "BottomRight"
    public List<ColorHotkeyBindingDto> hotkeys { get; set; } = DefaultHotkeys();

    public static List<ColorHotkeyBindingDto> DefaultHotkeys() => new()
    {
        new() { action = "toggle", modifiers = 0x0002, vk = (int)Keys.F9 },
        new() { action = "next",   modifiers = 0x0002, vk = (int)Keys.F10 },
        new() { action = "prev",   modifiers = 0x0002 | 0x0004, vk = (int)Keys.F10 },
        new() { action = "hud",    modifiers = 0x0002, vk = (int)Keys.F11 },
    };
}

internal static class HyperHueEngine
{
    private const string OFF_PRESET = "Off";
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true, WriteIndented = true };

    private static ColorFilterConfigDto _config = new();
    private static Action<object>? _emitCallback;
    private static Action<ColorFilterConfigDto>? _persistCallback;
    private static string _crashGuardPath = "";
    private static bool _headlessMode = false;
    private static bool _initialized = false;

    private static bool _magReady = false;
    private static string _filterStatus = "Starting";
    private static float[]? _lastMatrix;
    private static string? _lastAmdKey;
    private static bool _amdTouched;
    private static string _lastPath = "Off";

    private static AmdDriverBridge? _amd;
    private static readonly GammaRampBridge _gamma = new();
    private static ColorHudOverlayForm? _hud;
    private static ColorHotkeyMessageWindow? _hotkeyWin;

    private static readonly Stopwatch _pidCacheWatch = Stopwatch.StartNew();
    private static readonly Dictionary<uint, string> _pidNameCache = new();
    private static readonly int _ownPid = Environment.ProcessId;

    private static string _foregroundProcess = "";
    private static bool _effectiveActive = false;
    private static string _effectiveName = "Off";
    private static string _effectiveReason = "Paused";
    private static ColorLookDto? _effectiveLook;
    private static string _lastEffectiveKey = "";

    public static ColorFilterConfigDto TryMigrateLegacyHyperHueConfig()
    {
        var cfg = new ColorFilterConfigDto();
        try
        {
            string legacyPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "HyperHue",
                "settings.json");

            if (File.Exists(legacyPath))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(legacyPath));
                var root = doc.RootElement;
                if (root.TryGetProperty("Enabled", out var en)) cfg.enabled = en.GetBoolean();
                if (root.TryGetProperty("ActivePreset", out var ap)) cfg.activePreset = ap.GetString() ?? "Hyper";
                if (root.TryGetProperty("AutoApply", out var aa)) cfg.autoApply = aa.GetBoolean();
                if (root.TryGetProperty("ShadowBoostEnabled", out var sb)) cfg.shadowBoostEnabled = sb.GetBoolean();
                if (root.TryGetProperty("RulesOnly", out var ro)) cfg.rulesOnly = ro.GetBoolean();
                if (root.TryGetProperty("HudToasts", out var ht)) cfg.hudToasts = ht.GetBoolean();
                if (root.TryGetProperty("HudPinned", out var hp)) cfg.hudPinned = hp.GetBoolean();
                if (root.TryGetProperty("Engine", out var eng) && eng.ValueKind == JsonValueKind.Number)
                    cfg.engineMode = eng.GetInt32() == 1 ? "amd" : "screen";
                if (root.TryGetProperty("HudCorner", out var hc) && hc.ValueKind == JsonValueKind.Number)
                {
                    cfg.hudCorner = hc.GetInt32() switch
                    {
                        0 => "TopLeft",
                        2 => "BottomLeft",
                        3 => "BottomRight",
                        _ => "TopRight"
                    };
                }
                if (root.TryGetProperty("Working", out var wk) && wk.ValueKind == JsonValueKind.Object)
                {
                    var wParsed = JsonSerializer.Deserialize<ColorLookDto>(wk.GetRawText(), JsonOpts);
                    if (wParsed != null) { wParsed.Sanitize(); cfg.working = wParsed; }
                }
                if (root.TryGetProperty("Applied", out var apl) && apl.ValueKind == JsonValueKind.Object)
                {
                    var aParsed = JsonSerializer.Deserialize<ColorLookDto>(apl.GetRawText(), JsonOpts);
                    if (aParsed != null) { aParsed.Sanitize(); cfg.applied = aParsed; }
                }
                if (root.TryGetProperty("CustomPresets", out var cp) && cp.ValueKind == JsonValueKind.Array)
                {
                    var list = JsonSerializer.Deserialize<List<ColorLookDto>>(cp.GetRawText(), JsonOpts);
                    if (list != null)
                    {
                        foreach (var item in list) { item.builtIn = false; item.Sanitize(); }
                        cfg.customPresets = list;
                    }
                }
                if (root.TryGetProperty("Rules", out var rl) && rl.ValueKind == JsonValueKind.Array)
                {
                    var rules = JsonSerializer.Deserialize<List<ColorAppRuleDto>>(rl.GetRawText(), JsonOpts);
                    if (rules != null) cfg.rules = rules;
                }
            }
        }
        catch { }
        return cfg;
    }

    public static void InitOnUiThread(
        string stateFilePath,
        bool headlessTestMode,
        Action<object> emitCallback,
        Action<ColorFilterConfigDto> persistCallback)
    {
        _emitCallback = emitCallback;
        _persistCallback = persistCallback;
        _headlessMode = headlessTestMode;

        string baseDir = !string.IsNullOrWhiteSpace(stateFilePath)
            ? (Path.GetDirectoryName(stateFilePath) ?? "")
            : "";
        if (string.IsNullOrEmpty(baseDir))
        {
            baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "zeropoint");
        }
        _crashGuardPath = Path.Combine(baseDir, "hyperhue-crash-guard.json");

        if (_headlessMode)
        {
            _filterStatus = "Headless test mode";
            _initialized = true;
            return;
        }

        try
        {
            _magReady = MagInitialize();
            _filterStatus = _magReady ? "Screen filter ready" : "Magnification API unavailable";
        }
        catch (Exception ex)
        {
            _magReady = false;
            _filterStatus = "Screen filter unavailable: " + ex.Message;
        }

        RestoreCrashGuardIfNeeded();
        _gamma.Capture();
        SaveCrashGuard(false, false);

        if (string.Equals(_config.engineMode, "amd", StringComparison.OrdinalIgnoreCase))
        {
            EnsureAmd();
        }

        _hud = new ColorHudOverlayForm { Corner = _config.hudCorner };
        _ = _hud.Handle;

        _hotkeyWin = new ColorHotkeyMessageWindow(_config.hotkeys);
        _hotkeyWin.HotkeyTriggered += OnHotkeyTriggered;

        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
        SystemEvents.SessionEnding += OnSessionEnding;

        _initialized = true;
        Reapply(force: true, flash: false);
        if (_config.hudPinned)
        {
            _hud.SetPinned(true, BuildHudState());
        }
    }

    public static void ShutdownOnUiThread()
    {
        try { SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged; } catch { }
        try { SystemEvents.SessionEnding -= OnSessionEnding; } catch { }

        try
        {
            if (_magReady)
            {
                var identity = new MAGCOLOREFFECT { transform = ColorMatrixMath.Flatten(ColorMatrixMath.Identity()) };
                MagSetFullscreenColorEffect(ref identity);
                MagUninitialize();
                _magReady = false;
            }
        }
        catch { }

        try { _gamma.Dispose(); } catch { }
        try { _amd?.Dispose(); _amd = null; } catch { }
        try { _hotkeyWin?.Dispose(); _hotkeyWin = null; } catch { }
        try { _hud?.Close(); _hud?.Dispose(); _hud = null; } catch { }
        SaveCrashGuard(false, false);
    }

    public static ColorFilterConfigDto GetCurrentConfig() => _config;
    public static bool IsEffectiveActive => _effectiveActive;
    public static string EffectiveDisplayName => _effectiveActive ? _effectiveName : "Off";

    public static List<ColorLookDto> AllPresets()
    {
        var all = ColorLookDto.BuiltIns();
        foreach (var c in _config.customPresets)
        {
            if (!all.Any(b => string.Equals(b.name, c.name, StringComparison.OrdinalIgnoreCase)))
                all.Add(c);
        }
        return all;
    }

    public static void UpdateConfigFromStudio(ColorFilterConfigDto next, bool flashHud = false)
    {
        next.working ??= new ColorLookDto();
        next.working.Sanitize();
        next.applied ??= next.working.Clone();
        next.applied.Sanitize();
        next.customPresets ??= new List<ColorLookDto>();
        foreach (var p in next.customPresets) { p.builtIn = false; p.Sanitize(); }
        next.rules ??= new List<ColorAppRuleDto>();
        next.hotkeys ??= ColorFilterConfigDto.DefaultHotkeys();

        bool engineChanged = !string.Equals(_config.engineMode, next.engineMode, StringComparison.OrdinalIgnoreCase);
        bool pinChanged = _config.hudPinned != next.hudPinned || _config.hudCorner != next.hudCorner;

        _config = next;

        if (!_initialized || _headlessMode)
        {
            _emitCallback?.Invoke(BuildStatusPayload());
            return;
        }

        if (string.Equals(_config.engineMode, "amd", StringComparison.OrdinalIgnoreCase))
            EnsureAmd();

        if (engineChanged) InvalidateHardware();

        _hotkeyWin?.UpdateBindings(_config.hotkeys);
        if (_hud != null)
        {
            _hud.Corner = _config.hudCorner;
            if (pinChanged)
            {
                _hud.SetPinned(_config.hudPinned, BuildHudState());
            }
        }

        Reapply(force: engineChanged, flash: flashHud);
        _emitCallback?.Invoke(BuildStatusPayload());
    }

    public static void ToggleFromTrayOrHotkey()
    {
        _config.enabled = !_config.enabled;
        Reapply(force: false, flash: true);
        _persistCallback?.Invoke(_config);
        _emitCallback?.Invoke(new { type = "colorConfigSync", config = _config, status = BuildStatusPayload() });
    }

    public static void SelectPresetFromTrayOrHotkey(string presetName)
    {
        var all = AllPresets();
        var match = all.FirstOrDefault(p => string.Equals(p.name, presetName, StringComparison.OrdinalIgnoreCase));
        if (match == null) return;
        _config.enabled = true;
        _config.activePreset = match.name;
        _config.working = match.Clone();
        _config.working.builtIn = false;
        _config.applied = _config.working.Clone();
        Reapply(force: false, flash: true);
        _persistCallback?.Invoke(_config);
        _emitCallback?.Invoke(new { type = "colorConfigSync", config = _config, status = BuildStatusPayload() });
    }

    public static void CyclePreset(int delta)
    {
        var all = AllPresets();
        if (all.Count == 0) return;
        int idx = all.FindIndex(p => string.Equals(p.name, _config.activePreset, StringComparison.OrdinalIgnoreCase));
        int nextIdx = ((idx < 0 ? 0 : idx) + delta + all.Count) % all.Count;
        SelectPresetFromTrayOrHotkey(all[nextIdx].name);
    }

    public static void PreviewHud()
    {
        if (_hud == null || _headlessMode) return;
        _hud.Corner = _config.hudCorner;
        _hud.Flash(BuildHudState());
    }

    public static bool UnlockGammaRange() => GammaRampBridge.RequestUnlock();

    public static string? CaptureCleanScreenDataUrl()
    {
        try
        {
            IntPtr oldDpi = IntPtr.Zero;
            try { oldDpi = SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
            try
            {
                var bounds = GetPrimaryMonitorPhysicalBounds();
                using var full = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
                using (var g = Graphics.FromImage(full))
                {
                    g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size, CopyPixelOperation.SourceCopy);
                }

                Bitmap target = full;
                bool disposeTarget = false;
                if (full.Width > 1440)
                {
                    int h = (int)Math.Round(full.Height * 1440.0 / full.Width);
                    target = new Bitmap(1440, h, PixelFormat.Format32bppArgb);
                    disposeTarget = true;
                    using var sg = Graphics.FromImage(target);
                    sg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    sg.DrawImage(full, 0, 0, 1440, h);
                }

                try
                {
                    using var ms = new MemoryStream();
                    var jpegCodec = ImageCodecInfo.GetImageEncoders().FirstOrDefault(c => c.FormatID == ImageFormat.Jpeg.Guid);
                    if (jpegCodec != null)
                    {
                        using var encParams = new EncoderParameters(1);
                        encParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 90L);
                        target.Save(ms, jpegCodec, encParams);
                        return "data:image/jpeg;base64," + Convert.ToBase64String(ms.ToArray());
                    }
                    target.Save(ms, ImageFormat.Png);
                    return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
                }
                finally
                {
                    if (disposeTarget) target.Dispose();
                }
            }
            finally
            {
                if (oldDpi != IntPtr.Zero)
                {
                    try { SetThreadDpiAwarenessContext(oldDpi); } catch { }
                }
            }
        }
        catch
        {
            return null;
        }
    }

    public static void TickOnUiThread()
    {
        if (!_initialized || _headlessMode) return;
        string? fg = GetPassiveForegroundProcess();
        bool fgChanged = fg != null && !string.Equals(fg, _foregroundProcess, StringComparison.OrdinalIgnoreCase);
        if (fg != null) _foregroundProcess = fg;

        bool ownInFront = fg == null;
        Reapply(force: false, flash: !ownInFront && fgChanged, foregroundOverride: fg, ownWindowInFront: ownInFront);
        _hud?.KeepOnTop();

        if (fgChanged)
        {
            _emitCallback?.Invoke(BuildStatusPayload());
        }
    }

    public static object BuildStatusPayload()
    {
        return new
        {
            type = "colorStatus",
            effectiveActive = _effectiveActive,
            effectiveName = _effectiveName,
            effectiveReason = _effectiveReason,
            foregroundProcess = _foregroundProcess,
            filterReady = _magReady,
            filterStatus = _filterStatus,
            amdAvailable = _amd?.Available ?? false,
            amdStatus = _amd?.Status ?? "Click AMD Radeon mode to link driver",
            lastPath = _lastPath,
            gammaAchieved = Math.Round(_gamma.Achieved, 2),
            gammaLimited = _gamma.Limited
        };
    }

    private static void OnHotkeyTriggered(string action)
    {
        switch (action)
        {
            case "toggle":
                ToggleFromTrayOrHotkey();
                break;
            case "next":
                CyclePreset(1);
                break;
            case "prev":
                CyclePreset(-1);
                break;
            case "hud":
                _config.hudPinned = !_config.hudPinned;
                _hud?.SetPinned(_config.hudPinned, BuildHudState());
                _persistCallback?.Invoke(_config);
                _emitCallback?.Invoke(new { type = "colorConfigSync", config = _config, status = BuildStatusPayload() });
                break;
        }
    }

    private static void Reapply(bool force, bool flash, string? foregroundOverride = null, bool ownWindowInFront = true)
    {
        if (!_initialized || _headlessMode) return;

        ColorLookDto? look = null;
        bool active;
        string name;
        string reason;

        ColorAppRuleDto? rule = null;
        if (!ownWindowInFront && !string.IsNullOrEmpty(foregroundOverride))
        {
            rule = _config.rules.FirstOrDefault(r =>
                string.Equals(NormalizeProc(r.process), NormalizeProc(foregroundOverride), StringComparison.OrdinalIgnoreCase));
        }

        if (!_config.enabled)
        {
            active = false;
            name = "Off";
            reason = "Paused";
        }
        else if (rule != null)
        {
            if (string.Equals(rule.preset, OFF_PRESET, StringComparison.OrdinalIgnoreCase))
            {
                active = false;
                name = "Off";
                reason = "Rule: " + rule.process;
            }
            else
            {
                bool isActive = string.Equals(rule.preset, _config.activePreset, StringComparison.OrdinalIgnoreCase);
                look = isActive
                    ? _config.applied
                    : (AllPresets().FirstOrDefault(p => string.Equals(p.name, rule.preset, StringComparison.OrdinalIgnoreCase)) ?? _config.applied);
                active = true;
                name = isActive ? FormatLookName(_config.applied) : look.name;
                reason = "Rule: " + rule.process;
            }
        }
        else if (_config.rulesOnly && !ownWindowInFront)
        {
            active = false;
            name = "Off";
            reason = "Waiting for listed game";
        }
        else
        {
            look = _config.applied;
            active = true;
            name = FormatLookName(_config.applied);
            reason = "All apps & games";
        }

        if (force) InvalidateHardware();
        ApplyHardware(look, active);

        _effectiveActive = active;
        _effectiveName = name;
        _effectiveReason = reason;
        _effectiveLook = look;

        string key = $"{active}|{name}|{reason}";
        bool changedIdentity = key != _lastEffectiveKey;
        _lastEffectiveKey = key;

        if (_hud != null)
        {
            var hudState = BuildHudState();
            if (changedIdentity && flash && _config.hudToasts && !force)
                _hud.Flash(hudState);
            else
                _hud.UpdateState(hudState);
        }
    }

    private static string FormatLookName(ColorLookDto look)
    {
        var saved = AllPresets().FirstOrDefault(p => string.Equals(p.name, _config.activePreset, StringComparison.OrdinalIgnoreCase));
        bool modified = saved == null || !saved.SameValues(look);
        return _config.activePreset + (modified ? " *" : "");
    }

    private static ColorHudOverlayForm.HudState BuildHudState()
    {
        string detail = "Stock display";
        if (_effectiveActive && _effectiveLook != null)
        {
            detail = string.Format(
                CultureInfo.InvariantCulture,
                "SAT {0:0.00}×  ·  CON {1:0.00}×  ·  SHADOW {2:0.00}×",
                _effectiveLook.saturation,
                _effectiveLook.contrast,
                _effectiveLook.shadowBoost);
        }
        return new ColorHudOverlayForm.HudState
        {
            Active = _effectiveActive,
            Preset = _effectiveName,
            Detail = detail,
            Reason = _effectiveReason
        };
    }

    private static bool EnsureAmd()
    {
        if (_amd != null) return _amd.Available;
        _amd = new AmdDriverBridge();
        if (!_amd.TryInit()) return false;
        SaveCrashGuard(_amdTouched, _gamma.Touched);
        return true;
    }

    private static void ApplyHardware(ColorLookDto? look, bool active)
    {
        bool on = active && look != null;
        bool useAmd = on && string.Equals(_config.engineMode, "amd", StringComparison.OrdinalIgnoreCase) && EnsureAmd();

        if (useAmd && look != null && _amd != null)
        {
            string key = string.Format(CultureInfo.InvariantCulture, "{0:F3}|{1:F3}|{2:F3}", look.saturation, look.contrast, look.brightness);
            if (key != _lastAmdKey)
            {
                if (!_amdTouched)
                {
                    _amdTouched = true;
                    SaveCrashGuard(true, _gamma.Touched);
                }
                _amd.Apply(look.saturation, look.contrast, look.brightness);
                _lastAmdKey = key;
            }
        }
        else if (_amdTouched)
        {
            _amd?.Restore();
            _amdTouched = false;
            _lastAmdKey = null;
            SaveCrashGuard(false, _gamma.Touched);
        }

        float[,] matrix = (on && look != null)
            ? ColorMatrixMath.Build(look, driverHandlesTone: useAmd)
            : ColorMatrixMath.Identity();
        ApplyMagMatrix(ColorMatrixMath.Flatten(matrix));

        float shadow = (on && look != null && _config.shadowBoostEnabled) ? look.shadowBoost : 1f;
        bool prevGamma = _gamma.Touched;
        _gamma.Apply(shadow);
        if (_gamma.Touched != prevGamma)
        {
            SaveCrashGuard(_amdTouched, _gamma.Touched);
        }

        if (!on) _lastPath = "Off";
        else if (useAmd) _lastPath = _magReady ? "AMD Radeon driver + screen filter" : "AMD Radeon driver";
        else _lastPath = _magReady ? "Screen filter" : "Unavailable";
    }

    private static void ApplyMagMatrix(float[] flat)
    {
        if (!_magReady) return;
        if (_lastMatrix != null && MatricesMatch(_lastMatrix, flat)) return;
        var effect = new MAGCOLOREFFECT { transform = flat };
        try
        {
            if (MagSetFullscreenColorEffect(ref effect))
                _lastMatrix = flat;
        }
        catch { }
    }

    private static bool MatricesMatch(float[] a, float[] b)
    {
        for (int i = 0; i < 25; i++)
            if (Math.Abs(a[i] - b[i]) > 0.00001f) return false;
        return true;
    }

    private static void InvalidateHardware()
    {
        _lastMatrix = null;
        _lastAmdKey = null;
        _gamma.Invalidate();
    }

    private static void OnDisplaySettingsChanged(object? sender, EventArgs e)
    {
        if (!_initialized || _headlessMode) return;
        _gamma.Restore();
        _gamma.Capture();
        InvalidateHardware();
        _hud?.Reposition();
        Reapply(force: true, flash: false);
    }

    private static void OnSessionEnding(object? sender, SessionEndingEventArgs e)
    {
        ShutdownOnUiThread();
    }

    private static string? GetPassiveForegroundProcess()
    {
        try
        {
            IntPtr hWnd = GetForegroundWindow();
            if (hWnd == IntPtr.Zero) return null;
            GetWindowThreadProcessId(hWnd, out uint pid);
            if (pid <= 4 || pid == _ownPid) return null;

            if (_pidNameCache.Count == 0 || _pidCacheWatch.ElapsedMilliseconds >= 1000)
            {
                _pidCacheWatch.Restart();
                _pidNameCache.Clear();
                foreach (var p in Process.GetProcesses())
                {
                    try
                    {
                        if (p.Id > 4 && !string.IsNullOrEmpty(p.ProcessName))
                            _pidNameCache[(uint)p.Id] = p.ProcessName;
                    }
                    catch { }
                    finally { p.Dispose(); }
                }
            }

            if (_pidNameCache.TryGetValue(pid, out string? name) && !string.IsNullOrEmpty(name))
            {
                string lower = name.ToLowerInvariant();
                if (lower is "zeropoint" or "zeropointoverlay" or "winbridge" or "electron")
                    return null;
                return name;
            }
        }
        catch { }
        return null;
    }

    private static string NormalizeProc(string? s)
    {
        string t = (s ?? "").Trim();
        if (t.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            t = t[..^4];
        return t;
    }

    private static void SaveCrashGuard(bool amdDirty, bool gammaDirty)
    {
        if (string.IsNullOrEmpty(_crashGuardPath)) return;
        try
        {
            string? dir = Path.GetDirectoryName(_crashGuardPath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            var payload = new
            {
                amdDirty,
                gammaDirty,
                amdOriginals = _amd?.Snapshot() ?? new List<SavedAmdEntry>(),
                gammaOriginals = _gamma.Snapshot()
            };
            File.WriteAllText(_crashGuardPath, JsonSerializer.Serialize(payload, JsonOpts));
        }
        catch { }
    }

    private static void RestoreCrashGuardIfNeeded()
    {
        if (string.IsNullOrEmpty(_crashGuardPath) || !File.Exists(_crashGuardPath)) return;
        try
        {
            var node = JsonNode.Parse(File.ReadAllText(_crashGuardPath)) as JsonObject;
            if (node == null) return;
            bool gammaDirty = node["gammaDirty"]?.GetValue<bool>() ?? false;
            bool amdDirty = node["amdDirty"]?.GetValue<bool>() ?? false;
            if (gammaDirty && node["gammaOriginals"] != null)
            {
                var ramps = JsonSerializer.Deserialize<List<SavedGammaEntry>>(node["gammaOriginals"]!.ToJsonString(), JsonOpts);
                if (ramps != null) GammaRampBridge.RestoreFrom(ramps);
            }
            if (amdDirty && node["amdOriginals"] != null)
            {
                _amd ??= new AmdDriverBridge();
                if (_amd.TryInit())
                {
                    var vals = JsonSerializer.Deserialize<List<SavedAmdEntry>>(node["amdOriginals"]!.ToJsonString(), JsonOpts);
                    if (vals != null) _amd.RestoreFrom(vals);
                }
            }
        }
        catch { }
    }

    private static Rectangle GetPrimaryMonitorPhysicalBounds()
    {
        try
        {
            IntPtr mon = MonitorFromPoint(new POINT { X = 0, Y = 0 }, 1);
            var mi = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
            if (mon != IntPtr.Zero && GetMonitorInfo(mon, ref mi))
                return Rectangle.FromLTRB(mi.rcMonitor.Left, mi.rcMonitor.Top, mi.rcMonitor.Right, mi.rcMonitor.Bottom);
        }
        catch { }
        return Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
    }

    #region Color Matrix & Shadow Boost Math

    internal static class ColorMatrixMath
    {
        private const float LumR = 0.2126f, LumG = 0.7152f, LumB = 0.0722f;

        public static float[,] Identity()
        {
            var m = new float[5, 5];
            for (int i = 0; i < 5; i++) m[i, i] = 1f;
            return m;
        }

        public static float[,] Multiply(float[,] a, float[,] b)
        {
            var r = new float[5, 5];
            for (int i = 0; i < 5; i++)
                for (int j = 0; j < 5; j++)
                {
                    float s = 0f;
                    for (int k = 0; k < 5; k++) s += a[i, k] * b[k, j];
                    r[i, j] = s;
                }
            return r;
        }

        public static float[,] Build(ColorLookDto look, bool driverHandlesTone)
        {
            var m = Identity();
            if (!driverHandlesTone)
            {
                var sat = Identity();
                float ir = LumR * (1f - look.saturation), ig = LumG * (1f - look.saturation), ib = LumB * (1f - look.saturation);
                sat[0, 0] = ir + look.saturation; sat[0, 1] = ir; sat[0, 2] = ir;
                sat[1, 0] = ig; sat[1, 1] = ig + look.saturation; sat[1, 2] = ig;
                sat[2, 0] = ib; sat[2, 1] = ib; sat[2, 2] = ib + look.saturation;
                m = Multiply(m, sat);

                var con = Identity();
                float off = 0.5f * (1f - look.contrast);
                con[0, 0] = look.contrast; con[1, 1] = look.contrast; con[2, 2] = look.contrast;
                con[4, 0] = off; con[4, 1] = off; con[4, 2] = off;
                m = Multiply(m, con);

                var bri = Identity();
                bri[4, 0] = look.brightness; bri[4, 1] = look.brightness; bri[4, 2] = look.brightness;
                m = Multiply(m, bri);
            }

            if (Math.Abs(look.hue) > 0.01f)
            {
                double a = look.hue * Math.PI / 180.0;
                float c = (float)Math.Cos(a), s = (float)Math.Sin(a);
                var k = new float[3, 3]
                {
                    { 0.213f + c * 0.787f - s * 0.213f, 0.715f - c * 0.715f - s * 0.715f, 0.072f - c * 0.072f + s * 0.928f },
                    { 0.213f - c * 0.213f + s * 0.143f, 0.715f + c * 0.285f + s * 0.140f, 0.072f - c * 0.072f - s * 0.283f },
                    { 0.213f - c * 0.213f - s * 0.787f, 0.715f - c * 0.715f + s * 0.715f, 0.072f + c * 0.928f + s * 0.072f }
                };
                var hm = Identity();
                for (int i = 0; i < 3; i++)
                    for (int j = 0; j < 3; j++)
                        hm[i, j] = k[j, i];
                m = Multiply(m, hm);
            }

            float t = Math.Clamp(look.temperature, -1f, 1f);
            if (Math.Abs(t) > 0.0001f)
            {
                var gm = Identity();
                gm[0, 0] = 1f + 0.12f * t;
                gm[1, 1] = 1f + 0.02f * t;
                gm[2, 2] = 1f - 0.14f * t;
                m = Multiply(m, gm);
            }
            return m;
        }

        public static float ShadowCurve(float x, float boost)
        {
            float k = 0.9f * (boost - 1f);
            if (k <= 0f) return x;
            float inv = 1f - x;
            float y = x + k * x * inv * inv * inv;
            return Math.Clamp(y, 0f, 1f);
        }

        public static float[] Flatten(float[,] m)
        {
            var f = new float[25];
            for (int i = 0; i < 5; i++)
                for (int j = 0; j < 5; j++)
                    f[i * 5 + j] = m[i, j];
            return f;
        }
    }

    #endregion

    #region Hardware Gamma Ramp Controller

    public sealed class SavedGammaEntry
    {
        public string Device { get; set; } = "";
        public int[] Red { get; set; } = Array.Empty<int>();
        public int[] Green { get; set; } = Array.Empty<int>();
        public int[] Blue { get; set; } = Array.Empty<int>();
    }

    private sealed class GammaRampBridge : IDisposable
    {
        private sealed record DisplayRamp(string Device, GAMMARAMP Original);
        private readonly List<DisplayRamp> _displays = new();
        private float _applied = 1f;

        public float Achieved { get; private set; } = 1f;
        public bool Limited { get; private set; }
        public bool Touched { get; private set; }

        public void Capture()
        {
            _displays.Clear();
            foreach (var scr in Screen.AllScreens)
            {
                IntPtr dc = IntPtr.Zero;
                try
                {
                    dc = CreateDC("DISPLAY", scr.DeviceName, null, IntPtr.Zero);
                    if (dc == IntPtr.Zero) continue;
                    var ramp = GAMMARAMP.Create();
                    if (GetDeviceGammaRamp(dc, ref ramp))
                        _displays.Add(new DisplayRamp(scr.DeviceName, ramp));
                }
                catch { }
                finally
                {
                    if (dc != IntPtr.Zero) DeleteDC(dc);
                }
            }
        }

        public List<SavedGammaEntry> Snapshot() =>
            _displays.Select(d => new SavedGammaEntry
            {
                Device = d.Device,
                Red = d.Original.Red.Select(v => (int)v).ToArray(),
                Green = d.Original.Green.Select(v => (int)v).ToArray(),
                Blue = d.Original.Blue.Select(v => (int)v).ToArray()
            }).ToList();

        public static void RestoreFrom(List<SavedGammaEntry> saved)
        {
            foreach (var s in saved)
            {
                if (s.Red?.Length != 256 || s.Green?.Length != 256 || s.Blue?.Length != 256) continue;
                var ramp = new GAMMARAMP
                {
                    Red = s.Red.Select(v => (ushort)Math.Clamp(v, 0, 65535)).ToArray(),
                    Green = s.Green.Select(v => (ushort)Math.Clamp(v, 0, 65535)).ToArray(),
                    Blue = s.Blue.Select(v => (ushort)Math.Clamp(v, 0, 65535)).ToArray()
                };
                SetRamp(s.Device, ref ramp);
            }
        }

        public void Apply(float boost)
        {
            if (Math.Abs(boost - _applied) < 0.001f) return;
            _applied = boost;

            if (boost <= 1.001f)
            {
                Restore();
                Achieved = 1f;
                Limited = false;
                return;
            }

            float best = 1f;
            foreach (var d in _displays)
            {
                float strength = boost;
                for (int attempt = 0; attempt < 10; attempt++)
                {
                    var ramp = BuildRamp(d.Original, strength);
                    if (SetRamp(d.Device, ref ramp))
                    {
                        best = Math.Max(best, strength);
                        Touched = true;
                        break;
                    }
                    strength = 1f + (strength - 1f) * 0.75f;
                    if (strength < 1.02f) break;
                }
            }

            Achieved = best;
            Limited = best < boost - 0.01f;
        }

        public void Restore()
        {
            if (!Touched) return;
            foreach (var d in _displays)
            {
                var orig = d.Original;
                SetRamp(d.Device, ref orig);
            }
            Touched = false;
            _applied = 1f;
        }

        public void Invalidate() => _applied = -1f;

        private static GAMMARAMP BuildRamp(GAMMARAMP orig, float boost)
        {
            var ramp = GAMMARAMP.Create();
            for (int i = 0; i < 256; i++)
            {
                float y = ColorMatrixMath.ShadowCurve(i / 255f, boost) * 255f;
                ramp.Red[i] = Sample(orig.Red, y);
                ramp.Green[i] = Sample(orig.Green, y);
                ramp.Blue[i] = Sample(orig.Blue, y);
            }
            return ramp;
        }

        private static ushort Sample(ushort[] table, float idx)
        {
            if (idx <= 0) return table[0];
            if (idx >= 255) return table[255];
            int i = (int)idx;
            float f = idx - i;
            return (ushort)Math.Round(table[i] + (table[i + 1] - table[i]) * f);
        }

        private static bool SetRamp(string device, ref GAMMARAMP ramp)
        {
            IntPtr dc = IntPtr.Zero;
            try
            {
                dc = CreateDC("DISPLAY", device, null, IntPtr.Zero);
                return dc != IntPtr.Zero && SetDeviceGammaRamp(dc, ref ramp);
            }
            catch { return false; }
            finally { if (dc != IntPtr.Zero) DeleteDC(dc); }
        }

        public static bool RequestUnlock()
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "reg.exe",
                    Arguments = "add \"HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ICM\" /v GdiIcmGammaRange /t REG_DWORD /d 256 /f",
                    Verb = "runas",
                    UseShellExecute = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                using var p = Process.Start(psi);
                p?.WaitForExit(15000);
                return p != null && p.ExitCode == 0;
            }
            catch { return false; }
        }

        public void Dispose() => Restore();
    }

    #endregion

    #region AMD Radeon ADL2 Display Color Bridge

    public sealed class SavedAmdEntry
    {
        public int Adapter { get; set; }
        public int Display { get; set; }
        public int Type { get; set; }
        public int Value { get; set; }
    }

    private sealed class AmdDriverBridge : IDisposable
    {
        private const int COLOR_BRIGHTNESS = 1 << 0;
        private const int COLOR_CONTRAST = 1 << 1;
        private const int COLOR_SATURATION = 1 << 2;
        private const int ADL_OK = 0;
        private const int AMD_VENDOR_ID = 1002;
        private const int DISPLAY_CONNECTED = 0x1;
        private const int DISPLAY_MAPPED = 0x2;

        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        private delegate IntPtr AdlAlloc(int size);
        private static readonly AdlAlloc AllocCallback = size => Marshal.AllocCoTaskMem(size);

        [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern int ADL2_Main_Control_Create(AdlAlloc callback, int enumConnectedAdapters, out IntPtr context);
        [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern int ADL2_Main_Control_Destroy(IntPtr context);
        [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern int ADL2_Adapter_NumberOfAdapters_Get(IntPtr context, out int numAdapters);
        [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern int ADL2_Adapter_AdapterInfo_Get(IntPtr context, IntPtr info, int inputSize);
        [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern int ADL2_Display_DisplayInfo_Get(IntPtr context, int adapterIndex, out int numDisplays, out IntPtr info, int forceDetect);
        [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern int ADL2_Display_Color_Get(IntPtr context, int adapterIndex, int displayIndex, int colorType, out int current, out int def, out int min, out int max, out int step);
        [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.StdCall)]
        private static extern int ADL2_Display_Color_Set(IntPtr context, int adapterIndex, int displayIndex, int colorType, int current);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        private struct AdapterInfo
        {
            public int iSize;
            public int iAdapterIndex;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strUDID;
            public int iBusNumber, iDeviceNumber, iFunctionNumber, iVendorID;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAdapterName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strDisplayName;
            public int iPresent, iExist;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strDriverPath;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strDriverPathExt;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strPNPString;
            public int iOSDisplayIndex;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct DisplayID
        {
            public int iDisplayLogicalIndex, iDisplayPhysicalIndex, iDisplayLogicalAdapterIndex, iDisplayPhysicalAdapterIndex;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        private struct DisplayInfo
        {
            public DisplayID displayID;
            public int iDisplayControllerIndex;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strDisplayName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strDisplayManufacturerName;
            public int iDisplayType, iDisplayOutputType, iDisplayConnector, iDisplayInfoMask, iDisplayInfoValue;
        }

        private sealed class Range { public int Current, Default, Min, Max; }
        private sealed class Target
        {
            public int Adapter, Display;
            public Dictionary<int, Range> Ranges = new();
        }

        private IntPtr _ctx = IntPtr.Zero;
        private readonly List<Target> _targets = new();
        public bool Available { get; private set; }
        public string Status { get; private set; } = "Not checked";

        public bool TryInit()
        {
            if (Available) return true;
            try
            {
                if (ADL2_Main_Control_Create(AllocCallback, 1, out _ctx) != ADL_OK || _ctx == IntPtr.Zero)
                {
                    Status = "AMD driver did not respond";
                    return false;
                }
                if (ADL2_Adapter_NumberOfAdapters_Get(_ctx, out int n) != ADL_OK || n <= 0)
                {
                    Status = "No AMD adapters detected";
                    return false;
                }

                int size = Marshal.SizeOf<AdapterInfo>();
                IntPtr buf = Marshal.AllocCoTaskMem(size * n);
                var seen = new HashSet<string>();
                try
                {
                    for (int i = 0; i < size * n; i++) Marshal.WriteByte(buf, i, 0);
                    for (int i = 0; i < n; i++) Marshal.WriteInt32(buf, i * size, size);
                    if (ADL2_Adapter_AdapterInfo_Get(_ctx, buf, size * n) != ADL_OK)
                    {
                        Status = "Could not read AMD adapter info";
                        return false;
                    }
                    for (int i = 0; i < n; i++)
                    {
                        var ai = Marshal.PtrToStructure<AdapterInfo>(buf + i * size);
                        if (ai.iVendorID == AMD_VENDOR_ID)
                            CollectDisplays(ai.iAdapterIndex, seen);
                    }
                }
                finally { Marshal.FreeCoTaskMem(buf); }

                if (_targets.Count == 0)
                {
                    Status = "AMD GPU found, no color-capable displays";
                    return false;
                }
                Available = true;
                Status = $"AMD Radeon driver linked ({_targets.Count} display{(_targets.Count == 1 ? "" : "s")})";
                return true;
            }
            catch (DllNotFoundException) { Status = "No AMD Radeon driver (atiadlxx.dll)"; }
            catch (Exception ex) { Status = "AMD driver error: " + ex.Message; }
            return false;
        }

        private void CollectDisplays(int adapterIndex, HashSet<string> seen)
        {
            if (ADL2_Display_DisplayInfo_Get(_ctx, adapterIndex, out int count, out IntPtr info, 0) != ADL_OK || info == IntPtr.Zero)
                return;
            try
            {
                int dsize = Marshal.SizeOf<DisplayInfo>();
                for (int d = 0; d < count; d++)
                {
                    var di = Marshal.PtrToStructure<DisplayInfo>(info + d * dsize);
                    int need = DISPLAY_CONNECTED | DISPLAY_MAPPED;
                    if ((di.iDisplayInfoValue & need) != need) continue;
                    if (di.displayID.iDisplayLogicalAdapterIndex != adapterIndex) continue;
                    int dispIdx = di.displayID.iDisplayLogicalIndex;
                    if (!seen.Add($"{adapterIndex}:{dispIdx}")) continue;

                    var t = new Target { Adapter = adapterIndex, Display = dispIdx };
                    foreach (int type in new[] { COLOR_SATURATION, COLOR_CONTRAST, COLOR_BRIGHTNESS })
                    {
                        if (ADL2_Display_Color_Get(_ctx, adapterIndex, dispIdx, type, out int cur, out int def, out int min, out int max, out _) == ADL_OK && max > min)
                            t.Ranges[type] = new Range { Current = cur, Default = def, Min = min, Max = max };
                    }
                    if (t.Ranges.ContainsKey(COLOR_SATURATION)) _targets.Add(t);
                }
            }
            finally { Marshal.FreeCoTaskMem(info); }
        }

        public void Apply(float saturation, float contrast, float brightness)
        {
            if (!Available) return;
            foreach (var t in _targets)
            {
                SetScaled(t, COLOR_SATURATION, saturation);
                SetScaled(t, COLOR_CONTRAST, contrast);
                if (t.Ranges.TryGetValue(COLOR_BRIGHTNESS, out var br))
                {
                    float k = Math.Clamp(brightness / 0.3f, -1f, 1f);
                    int v = k >= 0
                        ? br.Current + (int)Math.Round(k * (br.Max - br.Current) * 0.5f)
                        : br.Current + (int)Math.Round(k * (br.Current - br.Min) * 0.5f);
                    SetVal(t, COLOR_BRIGHTNESS, v);
                }
            }
        }

        private void SetScaled(Target t, int type, float factor)
        {
            if (!t.Ranges.TryGetValue(type, out var r)) return;
            int baseVal = r.Default > 0 ? r.Default : 100;
            SetVal(t, type, (int)Math.Round(baseVal * factor));
        }

        private void SetVal(Target t, int type, int value)
        {
            if (!t.Ranges.TryGetValue(type, out var r)) return;
            int clamped = Math.Clamp(value, r.Min, r.Max);
            try { ADL2_Display_Color_Set(_ctx, t.Adapter, t.Display, type, clamped); } catch { }
        }

        public void Restore()
        {
            if (!Available) return;
            foreach (var t in _targets)
                foreach (var kv in t.Ranges)
                    SetVal(t, kv.Key, kv.Value.Current);
        }

        public List<SavedAmdEntry> Snapshot()
        {
            var list = new List<SavedAmdEntry>();
            foreach (var t in _targets)
                foreach (var kv in t.Ranges)
                    list.Add(new SavedAmdEntry { Adapter = t.Adapter, Display = t.Display, Type = kv.Key, Value = kv.Value.Current });
            return list;
        }

        public void RestoreFrom(List<SavedAmdEntry> saved)
        {
            if (!Available) return;
            foreach (var s in saved)
                foreach (var t in _targets)
                    if (t.Adapter == s.Adapter && t.Display == s.Display && t.Ranges.TryGetValue(s.Type, out var r))
                    {
                        r.Current = s.Value;
                        SetVal(t, s.Type, s.Value);
                    }
        }

        public void Dispose()
        {
            try
            {
                Restore();
                if (_ctx != IntPtr.Zero) ADL2_Main_Control_Destroy(_ctx);
            }
            catch { }
            _ctx = IntPtr.Zero;
            Available = false;
        }
    }

    #endregion

    #region Global WM_HOTKEY Window & Click-Through Matte-Carbon HUD Form

    private sealed class ColorHotkeyMessageWindow : NativeWindow, IDisposable
    {
        public event Action<string>? HotkeyTriggered;
        private readonly Dictionary<int, string> _idToAction = new();

        public ColorHotkeyMessageWindow(List<ColorHotkeyBindingDto> initial)
        {
            CreateHandle(new CreateParams { Caption = "ZeroPointColorHotkeys" });
            UpdateBindings(initial);
        }

        public void UpdateBindings(List<ColorHotkeyBindingDto> bindings)
        {
            UnregisterAll();
            if (bindings == null) return;
            int id = 400;
            foreach (var b in bindings)
            {
                if (b.vk <= 0 || string.IsNullOrEmpty(b.action)) continue;
                id++;
                if (RegisterHotKey(Handle, id, b.modifiers | 0x4000 /* MOD_NOREPEAT */, (uint)b.vk))
                {
                    _idToAction[id] = b.action;
                }
            }
        }

        private void UnregisterAll()
        {
            if (Handle == IntPtr.Zero) return;
            foreach (var id in _idToAction.Keys)
                UnregisterHotKey(Handle, id);
            _idToAction.Clear();
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x0312 /* WM_HOTKEY */)
            {
                int id = m.WParam.ToInt32();
                if (_idToAction.TryGetValue(id, out string? action))
                {
                    HotkeyTriggered?.Invoke(action);
                }
                return;
            }
            base.WndProc(ref m);
        }

        public void Dispose()
        {
            UnregisterAll();
            if (Handle != IntPtr.Zero) DestroyHandle();
        }
    }

    private sealed class ColorHudOverlayForm : Form
    {
        public sealed class HudState
        {
            public bool Active;
            public string Preset = "";
            public string Detail = "";
            public string Reason = "";
        }

        private static readonly Size FlashSize = new(300, 74);
        private static readonly Size BadgeSize = new(176, 32);

        private readonly System.Windows.Forms.Timer _holdTimer = new() { Interval = 2000 };
        private readonly System.Windows.Forms.Timer _fadeTimer = new() { Interval = 25 };
        private readonly Font _fontTitle = new("Segoe UI", 10.5f, FontStyle.Bold);
        private readonly Font _fontSmall = new("Segoe UI", 8.5f, FontStyle.Regular);
        private HudState _state = new();
        private bool _flashing;

        [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
        public bool Pinned { get; private set; }

        [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
        public string Corner { get; set; } = "TopRight";

        public ColorHudOverlayForm()
        {
            AutoScaleMode = AutoScaleMode.None;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(18, 18, 22);
            Size = FlashSize;
            Opacity = 0;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);

            _holdTimer.Tick += (_, _) => { _holdTimer.Stop(); _fadeTimer.Start(); };
            _fadeTimer.Tick += (_, _) =>
            {
                double target = Pinned ? 0.92 : 0;
                if (Pinned && _flashing)
                {
                    _flashing = false;
                    _fadeTimer.Stop();
                    PlaceAt(BadgeSize);
                    Opacity = 0.92;
                    return;
                }
                Opacity = Math.Max(target, Opacity - 0.09);
                if (Opacity <= target + 0.005)
                {
                    _fadeTimer.Stop();
                    _flashing = false;
                    if (!Pinned) Hide();
                }
            };
        }

        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ExStyle |= 0x00080000 /* WS_EX_LAYERED */
                            | 0x00000020 /* WS_EX_TRANSPARENT */
                            | 0x00000080 /* WS_EX_TOOLWINDOW */
                            | 0x08000000 /* WS_EX_NOACTIVATE */
                            | 0x00000008 /* WS_EX_TOPMOST */;
                return cp;
            }
        }

        public void Flash(HudState state)
        {
            _state = state;
            _flashing = true;
            _fadeTimer.Stop();
            PlaceAt(FlashSize);
            Opacity = 0.95;
            if (!Visible) Show();
            KeepOnTop();
            Invalidate();
            _holdTimer.Stop();
            _holdTimer.Start();
        }

        public void SetPinned(bool pinned, HudState state)
        {
            Pinned = pinned;
            _state = state;
            if (_flashing) { Invalidate(); return; }
            if (pinned)
            {
                PlaceAt(BadgeSize);
                Opacity = 0.92;
                if (!Visible) Show();
                KeepOnTop();
            }
            else
            {
                Hide();
            }
            Invalidate();
        }

        public void UpdateState(HudState state)
        {
            _state = state;
            if (Visible) Invalidate();
        }

        public void KeepOnTop()
        {
            if (Visible && IsHandleCreated)
                SetWindowPos(Handle, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
        }

        public void Reposition() => PlaceAt(Size);

        private void PlaceAt(Size size)
        {
            var scr = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
            int m = 20;
            bool left = Corner is "TopLeft" or "BottomLeft";
            bool top = Corner is "TopLeft" or "TopRight";
            int x = left ? scr.Left + m : scr.Right - size.Width - m;
            int y = top ? scr.Top + m : scr.Bottom - size.Height - m - 42;
            Bounds = new Rectangle(x, y, size.Width, size.Height);
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var bg = new SolidBrush(Color.FromArgb(20, 20, 25));
            using var border = new Pen(Color.FromArgb(46, 46, 56), 1f);
            g.FillRectangle(bg, 0, 0, Width, Height);
            g.DrawRectangle(border, 0, 0, Width - 1, Height - 1);

            Color accent = _state.Active ? Color.FromArgb(255, 85, 38) : Color.FromArgb(92, 92, 104);
            using var bar = new SolidBrush(accent);
            g.FillRectangle(bar, 0, 0, 3, Height);

            if (Height < 45)
            {
                string label = _state.Active ? $"Color · {_state.Preset}" : "Color · Off";
                TextRenderer.DrawText(
                    g,
                    label,
                    _fontSmall,
                    new Rectangle(12, 0, Width - 28, Height),
                    Color.FromArgb(244, 244, 246),
                    TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
                using var dot = new SolidBrush(accent);
                g.FillEllipse(dot, Width - 16, Height / 2 - 3, 6, 6);
                return;
            }

            string title = _state.Active ? $"Color filter · {_state.Preset}" : "Color filter paused";
            TextRenderer.DrawText(
                g,
                title,
                _fontTitle,
                new Rectangle(14, 10, Width - 24, 24),
                Color.FromArgb(244, 244, 246),
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);

            string sub = !string.IsNullOrEmpty(_state.Reason) ? $"{_state.Reason} · {_state.Detail}" : _state.Detail;
            TextRenderer.DrawText(
                g,
                sub,
                _fontSmall,
                new Rectangle(14, 38, Width - 24, 22),
                Color.FromArgb(161, 161, 173),
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _holdTimer.Dispose();
                _fadeTimer.Dispose();
                _fontTitle.Dispose();
                _fontSmall.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    #endregion

    #region Win32 P/Invoke

    [StructLayout(LayoutKind.Sequential)]
    private struct MAGCOLOREFFECT
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 25)]
        public float[] transform;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct GAMMARAMP
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public ushort[] Red;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public ushort[] Green;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public ushort[] Blue;

        public static GAMMARAMP Create() => new()
        {
            Red = new ushort[256],
            Green = new ushort[256],
            Blue = new ushort[256]
        };
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    [DllImport("Magnification.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool MagInitialize();

    [DllImport("Magnification.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool MagUninitialize();

    [DllImport("Magnification.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool MagSetFullscreenColorEffect(ref MAGCOLOREFFECT pEffect);

    [DllImport("gdi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetDeviceGammaRamp(IntPtr hdc, ref GAMMARAMP ramp);

    [DllImport("gdi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetDeviceGammaRamp(IntPtr hdc, ref GAMMARAMP ramp);

    [DllImport("gdi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateDC(string driver, string device, string? output, IntPtr initData);

    [DllImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeleteDC(IntPtr hdc);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);

    [DllImport("user32.dll")]
    private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromPoint(POINT pt, uint flags);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);

    #endregion
}
