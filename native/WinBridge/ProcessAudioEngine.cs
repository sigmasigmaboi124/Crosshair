using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace WinBridge;

public sealed class AudioGameProfileDto
{
    public string id { get; set; } = "robrun";
    public string name { get; set; } = "ROB RUN";
    public List<string> processNames { get; set; } = new() { "ROB RUN.exe" };
    public bool enabled { get; set; } = true;
    public string preset { get; set; } = "balanced";
    public float ceilingDb { get; set; } = -12.0f;      // Hard gunshot cap (-30 .. -2 dB)
    public float thresholdDb { get; set; } = -20.0f;    // Compression knee start (-40 .. -6 dB)
    public float ratio { get; set; } = 8.0f;            // Compression ratio (2 .. 20)
    public float footstepLiftDb { get; set; } = 6.5f;   // Upward midrange / quiet cue lift (0 .. 14 dB)
    public float releaseMs { get; set; } = 85.0f;       // Recovery time after gunshot (25 .. 350 ms)
    public float subBassCutDb { get; set; } = -6.0f;    // 110 Hz explosion rumble cut (-12 .. 6 dB)
    public float lowMidGainDb { get; set; } = -2.5f;    // 350 Hz mud cut (-12 .. 6 dB)
    public float footstepMidGainDb { get; set; } = 6.5f;// 1.8 kHz boot crunch & gravel (+0 .. +12 dB)
    public float presenceGainDb { get; set; } = 4.0f;   // 3.4 kHz cloth rustle & reload click (-6 .. +12 dB)
    public float trebleTameDb { get; set; } = -3.5f;    // 7.5 kHz rifle crack / flashbang tamer (-12 .. +6 dB)
}

public sealed class AudioLimiterConfigDto
{
    public bool masterEnabled { get; set; } = true;
    public bool lockToSelectedProcess { get; set; } = true;
    public string selectedProfileId { get; set; } = "robrun";
    public string routingMode { get; set; } = "direct-session"; // "direct-session" | "loopback-eq"
    public string outputDeviceId { get; set; } = "";
    public List<AudioGameProfileDto> profiles { get; set; } = new();
}

public sealed class AudioEndpointDto
{
    public string id { get; set; } = "";
    public string name { get; set; } = "";
    public bool isDefault { get; set; }
}

internal static class ProcessAudioEngine
{
    private static readonly object _cfgLock = new();
    private static AudioLimiterConfigDto _config = CreateDefaultConfig();
    private static volatile bool _running = false;
    private static Thread? _workerThread;
    private static Action<object>? _emitCallback;

    private static Guid _audioCtxGuid = new("7B91E43A-2F08-4D93-95D4-8E20F4A10029");
    private static readonly Dictionary<string, float> _savedSessionVolumes = new();

    private static int _peakProtectedCount = 0;
    private static string _lastStatus = "standby";
    private static string _lastProcess = "";
    private static int _lastPid = 0;

    private static AudioLimiterConfigDto CreateDefaultConfig() => new()
    {
        masterEnabled = false,
        lockToSelectedProcess = true,
        selectedProfileId = "robrun",
        routingMode = "direct-session",
        outputDeviceId = "",
        profiles = new List<AudioGameProfileDto>
        {
            new()
            {
                id = "robrun",
                name = "ROB RUN",
                processNames = new List<string> { "ROB RUN.exe" },
                enabled = true,
                preset = "balanced",
                ceilingDb = -12f,
                thresholdDb = -20f,
                ratio = 8f,
                footstepLiftDb = 6.5f,
                releaseMs = 80f,
                subBassCutDb = -6.5f,
                lowMidGainDb = -2.5f,
                footstepMidGainDb = 6.5f,
                presenceGainDb = 4.0f,
                trebleTameDb = -3.5f
            }
        }
    };

    public static void Start(Action<object> emitCallback)
    {
        _emitCallback = emitCallback;
        if (_running) return;
        _running = true;
        _workerThread = new Thread(AudioWorkerLoop)
        {
            IsBackground = true,
            Name = "ZeroPointProcessAudioLimiter"
        };
        _workerThread.SetApartmentState(ApartmentState.MTA);
        _workerThread.Start();
    }

    public static void Stop()
    {
        _running = false;
        try { _workerThread?.Join(350); } catch { }
        RestoreAllSessionVolumes();
    }

    public static void UpdateConfig(AudioLimiterConfigDto next)
    {
        lock (_cfgLock)
        {
            _config = next;
        }
    }

    public static List<AudioEndpointDto> GetPlaybackEndpoints()
    {
        var list = new List<AudioEndpointDto>();
        try
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            string defaultId = "";
            try
            {
                if (enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out var defDev) == 0 && defDev != null)
                {
                    defDev.GetId(out defaultId);
                    Marshal.ReleaseComObject(defDev);
                }
            }
            catch { }

            if (enumerator.EnumAudioEndpoints(EDataFlow.eRender, 0x00000001 /* DEVICE_STATE_ACTIVE */, out var col) == 0 && col != null)
            {
                col.GetCount(out uint count);
                for (uint i = 0; i < count; i++)
                {
                    if (col.Item(i, out var dev) == 0 && dev != null)
                    {
                        dev.GetId(out string id);
                        string friendly = GetDeviceFriendlyName(dev) ?? $"Output {i + 1}";
                        list.Add(new AudioEndpointDto
                        {
                            id = id ?? "",
                            name = friendly,
                            isDefault = !string.IsNullOrEmpty(defaultId) && string.Equals(id, defaultId, StringComparison.OrdinalIgnoreCase)
                        });
                        Marshal.ReleaseComObject(dev);
                    }
                }
                Marshal.ReleaseComObject(col);
            }
            Marshal.ReleaseComObject(enumerator);
        }
        catch { }
        return list;
    }

    public static List<string> ListRunningAudioOrGameProcesses()
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            foreach (var p in Process.GetProcesses())
            {
                try
                {
                    if (p.Id > 4 && !string.IsNullOrWhiteSpace(p.ProcessName))
                    {
                        string n = p.ProcessName.Trim();
                        if (!IsSystemNoiseProcess(n))
                        {
                            names.Add(n + ".exe");
                        }
                    }
                }
                catch { }
                finally { p.Dispose(); }
            }
        }
        catch { }
        var sorted = new List<string>(names);
        sorted.Sort(StringComparer.OrdinalIgnoreCase);
        return sorted;
    }

    private static bool IsSystemNoiseProcess(string procName)
    {
        string lower = procName.ToLowerInvariant();
        return lower is "svchost" or "conhost" or "csrss" or "smss" or "wininit" or "winlogon"
            or "services" or "lsass" or "fontdrvhost" or "dwm" or "sihost" or "taskhostw"
            or "runtimebroker" or "searchhost" or "startmenuexperiencehost" or "ctfmon"
            or "dllhost" or "WmiPrvSE" or "wmiprvse" or "spoolsv" or "audiodg";
    }

    private static string NormalizeExeName(string raw)
    {
        string trimmed = (raw ?? "").Trim();
        if (trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            trimmed = trimmed[..^4];
        return trimmed.ToLowerInvariant();
    }

    private static void RestoreAllSessionVolumes()
    {
        if (_savedSessionVolumes.Count == 0) return;
        try
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            if (enumerator.EnumAudioEndpoints(EDataFlow.eRender, 0x00000001, out var col) == 0 && col != null)
            {
                col.GetCount(out uint devCount);
                Guid iidMgr = typeof(IAudioSessionManager2).GUID;
                for (uint d = 0; d < devCount; d++)
                {
                    if (col.Item(d, out var dev) == 0 && dev != null)
                    {
                        if (dev.Activate(ref iidMgr, 0x17, IntPtr.Zero, out var mgrObj) == 0 && mgrObj is IAudioSessionManager2 mgr)
                        {
                            if (mgr.GetSessionEnumerator(out var sesEnum) == 0 && sesEnum != null)
                            {
                                sesEnum.GetCount(out int sesCount);
                                for (int s = 0; s < sesCount; s++)
                                {
                                    if (sesEnum.GetSession(s, out var ctrl) == 0 && ctrl != null)
                                    {
                                        if (ctrl is IAudioSessionControl2 ctrl2 && ctrl is ISimpleAudioVolume vol)
                                        {
                                            ctrl2.GetSessionInstanceIdentifier(out string instId);
                                            if (!string.IsNullOrEmpty(instId) && _savedSessionVolumes.TryGetValue(instId, out float origVol))
                                            {
                                                try { vol.SetMasterVolume(Math.Clamp(origVol, 0.05f, 1.0f), ref _audioCtxGuid); } catch { }
                                            }
                                        }
                                        Marshal.ReleaseComObject(ctrl);
                                    }
                                }
                                Marshal.ReleaseComObject(sesEnum);
                            }
                            Marshal.ReleaseComObject(mgr);
                        }
                        Marshal.ReleaseComObject(dev);
                    }
                }
                Marshal.ReleaseComObject(col);
            }
            Marshal.ReleaseComObject(enumerator);
        }
        catch { }
        _savedSessionVolumes.Clear();
    }

    private static void AudioWorkerLoop()
    {
        var swProcessRefresh = Stopwatch.StartNew();
        var swTelemetry = Stopwatch.StartNew();
        var pidToName = new Dictionary<uint, string>();
        float currentGain = 1.0f;
        bool wasLimitingBurst = false;
        LoopbackEqPipeline? loopbackPipeline = null;

        while (_running)
        {
            AudioLimiterConfigDto cfg;
            lock (_cfgLock) { cfg = _config; }

            if (!cfg.masterEnabled || cfg.profiles.Count == 0)
            {
                if (loopbackPipeline != null)
                {
                    loopbackPipeline.Dispose();
                    loopbackPipeline = null;
                }
                if (_savedSessionVolumes.Count > 0)
                {
                    RestoreAllSessionVolumes();
                }
                currentGain = 1.0f;
                EmitTelemetryIfNeeded(swTelemetry, "disabled", "", 0, "", -60f, -60f, 0f, 0f, false);
                Thread.Sleep(300);
                continue;
            }

            // Refresh passive PID -> ProcessName snapshot once per second (Zero OpenProcess calls!)
            if (pidToName.Count == 0 || swProcessRefresh.ElapsedMilliseconds >= 1000)
            {
                swProcessRefresh.Restart();
                pidToName.Clear();
                try
                {
                    foreach (var proc in Process.GetProcesses())
                    {
                        try
                        {
                            if (proc.Id > 4 && !string.IsNullOrEmpty(proc.ProcessName))
                            {
                                pidToName[(uint)proc.Id] = proc.ProcessName;
                            }
                        }
                        catch { }
                        finally { proc.Dispose(); }
                    }
                }
                catch { }
            }

            // Match ONLY the target game process
            AudioGameProfileDto? matchedProfile = null;
            uint matchedPid = 0;
            string matchedProcDisplay = "";

            if (cfg.lockToSelectedProcess)
            {
                var targetProf = cfg.profiles.Find(p => p.id == cfg.selectedProfileId) ?? cfg.profiles[0];
                if (targetProf.enabled && TryFindMatchingPid(pidToName, targetProf, out matchedPid, out matchedProcDisplay))
                {
                    matchedProfile = targetProf;
                }
            }
            else
            {
                foreach (var prof in cfg.profiles)
                {
                    if (!prof.enabled) continue;
                    if (TryFindMatchingPid(pidToName, prof, out matchedPid, out matchedProcDisplay))
                    {
                        matchedProfile = prof;
                        break;
                    }
                }
            }

            if (matchedProfile == null || matchedPid == 0)
            {
                if (loopbackPipeline != null)
                {
                    loopbackPipeline.Dispose();
                    loopbackPipeline = null;
                }
                if (_savedSessionVolumes.Count > 0)
                {
                    RestoreAllSessionVolumes();
                }
                currentGain = 1.0f;
                var waitProf = cfg.profiles.Find(p => p.id == cfg.selectedProfileId) ?? cfg.profiles[0];
                string waitingFor = waitProf.processNames.Count > 0 ? waitProf.processNames[0] : waitProf.name;
                EmitTelemetryIfNeeded(swTelemetry, "waiting", waitingFor, 0, waitProf.id, -60f, -60f, 0f, 0f, false);
                Thread.Sleep(450);
                continue;
            }

            // Mode B: Windows 11 Per-Process Loopback 5-Band EQ + Sample Brickwall Limiter
            if (string.Equals(cfg.routingMode, "loopback-eq", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrWhiteSpace(cfg.outputDeviceId))
            {
                if (_savedSessionVolumes.Count > 0) RestoreAllSessionVolumes();

                if (loopbackPipeline == null || loopbackPipeline.TargetPid != matchedPid || loopbackPipeline.OutputDeviceId != cfg.outputDeviceId)
                {
                    loopbackPipeline?.Dispose();
                    loopbackPipeline = LoopbackEqPipeline.TryStart(matchedPid, cfg.outputDeviceId);
                }

                if (loopbackPipeline != null && loopbackPipeline.IsAlive)
                {
                    loopbackPipeline.UpdateProfile(matchedProfile);
                    var stats = loopbackPipeline.ReadMetrics();
                    if (stats.GainReductionDb > 2.5f && !wasLimitingBurst)
                    {
                        wasLimitingBurst = true;
                        Interlocked.Increment(ref _peakProtectedCount);
                    }
                    else if (stats.GainReductionDb < 0.8f)
                    {
                        wasLimitingBurst = false;
                    }

                    EmitTelemetryIfNeeded(
                        swTelemetry,
                        "active",
                        matchedProcDisplay,
                        (int)matchedPid,
                        matchedProfile.id,
                        stats.InputDb,
                        stats.OutputDb,
                        stats.GainReductionDb,
                        stats.FootstepLiftDb,
                        true
                    );
                    Thread.Sleep(25);
                    continue;
                }
            }
            else if (loopbackPipeline != null)
            {
                loopbackPipeline.Dispose();
                loopbackPipeline = null;
            }

            // Mode A (Default): Zero-Setup Per-Process Session Limiter & Quiet Cue Lifter
            bool foundAudioSession = ProcessTargetAudioSessions(
                matchedPid,
                matchedProfile,
                ref currentGain,
                out float inDb,
                out float outDb,
                out float grDb,
                out float liftDb
            );

            if (grDb > 2.5f && !wasLimitingBurst)
            {
                wasLimitingBurst = true;
                Interlocked.Increment(ref _peakProtectedCount);
            }
            else if (grDb < 0.8f)
            {
                wasLimitingBurst = false;
            }

            EmitTelemetryIfNeeded(
                swTelemetry,
                foundAudioSession ? "active" : "active-silent",
                matchedProcDisplay,
                (int)matchedPid,
                matchedProfile.id,
                inDb,
                outDb,
                grDb,
                liftDb,
                foundAudioSession
            );

            Thread.Sleep(foundAudioSession ? 12 : 250);
        }

        ReleaseCachedSession();
        loopbackPipeline?.Dispose();
        RestoreAllSessionVolumes();
    }

    private static bool TryFindMatchingPid(
        Dictionary<uint, string> pidToName,
        AudioGameProfileDto prof,
        out uint matchedPid,
        out string matchedDisplay)
    {
        matchedPid = 0;
        matchedDisplay = "";
        foreach (var rawMatcher in prof.processNames)
        {
            string target = NormalizeExeName(rawMatcher);
            if (string.IsNullOrEmpty(target)) continue;
            foreach (var kv in pidToName)
            {
                if (string.Equals(kv.Value, target, StringComparison.OrdinalIgnoreCase))
                {
                    matchedPid = kv.Key;
                    matchedDisplay = kv.Value + ".exe";
                    return true;
                }
            }
        }
        return false;
    }

    private sealed class CachedTargetSession : IDisposable
    {
        public uint Pid;
        public string InstanceId = "";
        public object? ComSessionObj;
        public IAudioMeterInformation? Meter;
        public ISimpleAudioVolume? Volume;
        public float LastAppliedVol = -1f;

        public void Dispose()
        {
            Meter = null;
            Volume = null;
            if (ComSessionObj != null)
            {
                try { Marshal.ReleaseComObject(ComSessionObj); } catch { }
                ComSessionObj = null;
            }
        }
    }

    private static CachedTargetSession? _cachedSession;
    private static readonly Stopwatch _sessionRescanWatch = Stopwatch.StartNew();

    private static void ReleaseCachedSession()
    {
        _cachedSession?.Dispose();
        _cachedSession = null;
    }

    private static bool TryAcquireCachedSession(uint targetPid)
    {
        ReleaseCachedSession();
        try
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            if (enumerator.EnumAudioEndpoints(EDataFlow.eRender, 0x00000001, out var col) == 0 && col != null)
            {
                col.GetCount(out uint devCount);
                Guid iidMgr = typeof(IAudioSessionManager2).GUID;
                for (uint d = 0; d < devCount; d++)
                {
                    if (col.Item(d, out var dev) == 0 && dev != null)
                    {
                        if (dev.Activate(ref iidMgr, 0x17, IntPtr.Zero, out var mgrObj) == 0 && mgrObj is IAudioSessionManager2 mgr)
                        {
                            if (mgr.GetSessionEnumerator(out var sesEnum) == 0 && sesEnum != null)
                            {
                                sesEnum.GetCount(out int sesCount);
                                for (int s = 0; s < sesCount; s++)
                                {
                                    if (sesEnum.GetSession(s, out var ctrl) == 0 && ctrl != null)
                                    {
                                        if (ctrl is IAudioSessionControl2 ctrl2 &&
                                            ctrl2.GetProcessId(out uint sesPid) == 0 &&
                                            sesPid == targetPid &&
                                            ctrl is IAudioMeterInformation meter &&
                                            ctrl is ISimpleAudioVolume vol)
                                        {
                                            ctrl2.GetSessionInstanceIdentifier(out string instId);
                                            if (!string.IsNullOrEmpty(instId) && !_savedSessionVolumes.ContainsKey(instId))
                                            {
                                                if (vol.GetMasterVolume(out float orig) == 0)
                                                    _savedSessionVolumes[instId] = orig > 0.05f ? orig : 1.0f;
                                            }
                                            _cachedSession = new CachedTargetSession
                                            {
                                                Pid = targetPid,
                                                InstanceId = instId ?? "",
                                                ComSessionObj = ctrl,
                                                Meter = meter,
                                                Volume = vol,
                                                LastAppliedVol = -1f
                                            };
                                            Marshal.ReleaseComObject(sesEnum);
                                            Marshal.ReleaseComObject(mgr);
                                            Marshal.ReleaseComObject(dev);
                                            Marshal.ReleaseComObject(col);
                                            Marshal.ReleaseComObject(enumerator);
                                            return true;
                                        }
                                        Marshal.ReleaseComObject(ctrl);
                                    }
                                }
                                Marshal.ReleaseComObject(sesEnum);
                            }
                            Marshal.ReleaseComObject(mgr);
                        }
                        Marshal.ReleaseComObject(dev);
                    }
                }
                Marshal.ReleaseComObject(col);
            }
            Marshal.ReleaseComObject(enumerator);
        }
        catch { }
        return false;
    }

    private static bool ProcessTargetAudioSessions(
        uint targetPid,
        AudioGameProfileDto prof,
        ref float currentGain,
        out float inputDb,
        out float outputDb,
        out float gainReductionDb,
        out float activeLiftDb)
    {
        inputDb = -60f;
        outputDb = -60f;
        gainReductionDb = 0f;
        activeLiftDb = 0f;

        if (_cachedSession == null || _cachedSession.Pid != targetPid)
        {
            if (_sessionRescanWatch.ElapsedMilliseconds < 900 && _cachedSession == null)
                return false;
            _sessionRescanWatch.Restart();
            if (!TryAcquireCachedSession(targetPid))
                return false;
        }

        var ses = _cachedSession;
        if (ses?.Meter == null || ses.Volume == null) return false;

        try
        {
            if (ses.Meter.GetPeakValue(out float rawPeak) != 0)
            {
                ReleaseCachedSession();
                return false;
            }

            float targetGain = ComputeEnvelopeGain(rawPeak, prof, ref currentGain, out inputDb, out outputDb, out gainReductionDb, out activeLiftDb);
            float userBase = (!string.IsNullOrEmpty(ses.InstanceId) && _savedSessionVolumes.TryGetValue(ses.InstanceId, out float b)) ? b : 1.0f;
            float finalVol = Math.Clamp(userBase * targetGain, 0.02f, 1.0f);

            // Only issue Audiosrv RPC when volume changes meaningfully (>= 1%)
            if (MathF.Abs(finalVol - ses.LastAppliedVol) >= 0.01f)
            {
                if (ses.Volume.SetMasterVolume(finalVol, ref _audioCtxGuid) != 0)
                {
                    ReleaseCachedSession();
                    return false;
                }
                ses.LastAppliedVol = finalVol;
            }
            return true;
        }
        catch
        {
            ReleaseCachedSession();
            return false;
        }
    }

    private static float ComputeEnvelopeGain(
        float rawPeak,
        AudioGameProfileDto prof,
        ref float smoothedGain,
        out float inDb,
        out float outDb,
        out float grDb,
        out float liftDb)
    {
        inDb = rawPeak <= 0.00003f ? -60f : Math.Clamp(20f * MathF.Log10(rawPeak), -60f, 0f);
        float ceilingDb = Math.Clamp(prof.ceilingDb, -32f, -1f);
        float thresholdDb = Math.Min(ceilingDb - 2f, Math.Clamp(prof.thresholdDb, -42f, -4f));
        float ratio = Math.Clamp(prof.ratio, 1.5f, 20f);
        float maxLiftDb = Math.Clamp(prof.footstepLiftDb, 0f, 14f);

        // Resting baseline headroom allows upward footstep lift within Windows [0..1] session gain
        float neutralRestDb = -maxLiftDb * 0.45f;
        float desiredDbChange = neutralRestDb;
        liftDb = 0f;
        grDb = 0f;

        if (inDb > thresholdDb)
        {
            // Gunshot / Explosion: Compress above threshold + Brickwall clamp at ceilingDb
            float compressedOutDb = thresholdDb + (inDb - thresholdDb) / ratio;
            float cappedOutDb = Math.Min(compressedOutDb, ceilingDb);
            desiredDbChange = cappedOutDb - inDb;
            grDb = Math.Max(0f, inDb - cappedOutDb);
        }
        else if (inDb > -50f && maxLiftDb > 0.1f)
        {
            // Quiet-to-midrange cues (footsteps, reloads, cloth): smoothly lift up toward 0 dB session ceiling
            float t = Math.Clamp((inDb - (-50f)) / Math.Max(4f, thresholdDb - (-50f)), 0f, 1f);
            float cueBoost = MathF.Sin(t * MathF.PI) * (maxLiftDb * 0.45f);
            desiredDbChange = Math.Min(0f, neutralRestDb + (maxLiftDb * 0.45f) * t + cueBoost * 0.25f);
            liftDb = Math.Max(0f, (desiredDbChange - neutralRestDb) + maxLiftDb * 0.35f);
        }

        float desiredGain = Math.Clamp(MathF.Pow(10f, desiredDbChange / 20f), 0.02f, 1.0f);

        // 2ms ultra-fast attack for hearing protection; configurable smooth release for footstep recovery
        const float dtMs = 12.0f;
        float coeff = desiredGain < smoothedGain
            ? 1f - MathF.Exp(-dtMs / 2.0f)
            : 1f - MathF.Exp(-dtMs / Math.Clamp(prof.releaseMs, 20f, 400f));

        smoothedGain += (desiredGain - smoothedGain) * coeff;
        smoothedGain = Math.Clamp(smoothedGain, 0.02f, 1.0f);

        outDb = Math.Clamp(inDb + 20f * MathF.Log10(smoothedGain), -60f, 0f);
        return smoothedGain;
    }

    private static void EmitTelemetryIfNeeded(
        Stopwatch sw,
        string status,
        string processName,
        int pid,
        string profileId,
        float inputDb,
        float outputDb,
        float gainReductionDb,
        float footstepLiftDb,
        bool fastRate)
    {
        bool stateChanged = status != _lastStatus || processName != _lastProcess || pid != _lastPid;
        long minInterval = fastRate ? 65 : 650;
        if (!stateChanged && sw.ElapsedMilliseconds < minInterval) return;

        _lastStatus = status;
        _lastProcess = processName;
        _lastPid = pid;
        sw.Restart();

        _emitCallback?.Invoke(new
        {
            type = "audioTelemetry",
            status,
            processName,
            pid,
            profileId,
            inputDb = Math.Round(inputDb, 1),
            outputDb = Math.Round(outputDb, 1),
            gainReductionDb = Math.Round(gainReductionDb, 1),
            footstepLiftDb = Math.Round(footstepLiftDb, 1),
            peakProtectedCount = _peakProtectedCount
        });
    }

    private static string? GetDeviceFriendlyName(IMMDevice dev)
    {
        try
        {
            if (dev.OpenPropertyStore(0 /* STGM_READ */, out var store) == 0 && store != null)
            {
                var pkey = new PROPERTYKEY
                {
                    fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"),
                    pid = 14
                };
                if (store.GetValue(ref pkey, out var pv) == 0 && pv.vt == 31 && pv.pwszVal != IntPtr.Zero)
                {
                    string? s = Marshal.PtrToStringUni(pv.pwszVal);
                    PropVariantClear(ref pv);
                    Marshal.ReleaseComObject(store);
                    return s;
                }
                Marshal.ReleaseComObject(store);
            }
        }
        catch { }
        return null;
    }

    #region Windows 11 Per-Process Loopback 5-Band Biquad EQ + Brickwall Limiter Pipeline

    private sealed class LoopbackEqPipeline : IDisposable
    {
        public uint TargetPid { get; }
        public string OutputDeviceId { get; }
        public volatile bool IsAlive;

        private volatile bool _stop;
        private readonly object _profLock = new();
        private AudioGameProfileDto _prof = new();
        private float _metricInDb = -60f;
        private float _metricOutDb = -60f;
        private float _metricGrDb = 0f;
        private float _metricLiftDb = 0f;
        private Thread? _dspThread;

        private LoopbackEqPipeline(uint pid, string outDeviceId)
        {
            TargetPid = pid;
            OutputDeviceId = outDeviceId;
        }

        public static LoopbackEqPipeline? TryStart(uint pid, string outputDeviceId)
        {
            var pipe = new LoopbackEqPipeline(pid, outputDeviceId) { IsAlive = true };
            pipe._dspThread = new Thread(pipe.DspLoop) { IsBackground = true, Name = "ZeroPointLoopbackEqDsp" };
            pipe._dspThread.SetApartmentState(ApartmentState.MTA);
            pipe._dspThread.Start();
            return pipe;
        }

        public void UpdateProfile(AudioGameProfileDto p)
        {
            lock (_profLock) { _prof = p; }
        }

        public (float InputDb, float OutputDb, float GainReductionDb, float FootstepLiftDb) ReadMetrics()
            => (_metricInDb, _metricOutDb, _metricGrDb, _metricLiftDb);

        public void Dispose()
        {
            _stop = true;
            IsAlive = false;
            try { _dspThread?.Join(250); } catch { }
        }

        private void DspLoop()
        {
            IAudioClient? capClient = null;
            IAudioCaptureClient? capService = null;
            IAudioClient? renClient = null;
            IAudioRenderClient? renService = null;
            IMMDevice? outDev = null;
            IMMDeviceEnumerator? enumerator = null;
            IntPtr pWfx = IntPtr.Zero;

            try
            {
                capClient = ActivateProcessLoopbackClient(TargetPid);
                if (capClient == null) { IsAlive = false; return; }

                enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
                if (enumerator.GetDevice(OutputDeviceId, out outDev) != 0 || outDev == null)
                {
                    IsAlive = false;
                    return;
                }

                Guid iidAudioClient = typeof(IAudioClient).GUID;
                if (outDev.Activate(ref iidAudioClient, 0x17, IntPtr.Zero, out var renObj) != 0 || renObj is not IAudioClient rc)
                {
                    IsAlive = false;
                    return;
                }
                renClient = rc;

                const int sampleRate = 48000;
                const int channels = 2;
                var wfx = new WAVEFORMATEX
                {
                    wFormatTag = 3, // WAVE_FORMAT_IEEE_FLOAT
                    nChannels = channels,
                    nSamplesPerSec = sampleRate,
                    wBitsPerSample = 32,
                    nBlockAlign = 8,
                    nAvgBytesPerSec = sampleRate * 8,
                    cbSize = 0
                };
                pWfx = Marshal.AllocHGlobal(Marshal.SizeOf<WAVEFORMATEX>());
                Marshal.StructureToPtr(wfx, pWfx, false);

                const uint AUTOCONVERT = 0x88000000; // AUTOCONVERTPCM | SRC_DEFAULT_QUALITY
                const uint LOOPBACK = 0x00020000;
                if (capClient.Initialize(0, LOOPBACK | AUTOCONVERT, 200_000, 0, pWfx, IntPtr.Zero) != 0)
                {
                    IsAlive = false;
                    return;
                }
                if (renClient.Initialize(0, AUTOCONVERT, 300_000, 0, pWfx, IntPtr.Zero) != 0)
                {
                    IsAlive = false;
                    return;
                }

                Guid iidCap = typeof(IAudioCaptureClient).GUID;
                Guid iidRen = typeof(IAudioRenderClient).GUID;
                capClient.GetService(ref iidCap, out var capSvcObj);
                renClient.GetService(ref iidRen, out var renSvcObj);
                capService = capSvcObj as IAudioCaptureClient;
                renService = renSvcObj as IAudioRenderClient;
                if (capService == null || renService == null) { IsAlive = false; return; }

                renClient.GetBufferSize(out uint renderBufFrames);

                var eqBands = new BiquadStereo[5];
                for (int i = 0; i < 5; i++) eqBands[i] = new BiquadStereo();

                float envLin = 1.0f;
                capClient.Start();
                renClient.Start();

                float[] scratch = new float[8192];

                while (!_stop)
                {
                    AudioGameProfileDto prof;
                    lock (_profLock) { prof = _prof; }

                    eqBands[0].SetLowShelf(sampleRate, 110f, prof.subBassCutDb);
                    eqBands[1].SetPeaking(sampleRate, 350f, 1.1f, prof.lowMidGainDb);
                    eqBands[2].SetPeaking(sampleRate, 1800f, 1.25f, prof.footstepMidGainDb);
                    eqBands[3].SetPeaking(sampleRate, 3400f, 1.4f, prof.presenceGainDb);
                    eqBands[4].SetHighShelf(sampleRate, 7500f, prof.trebleTameDb);

                    float ceilingLin = MathF.Pow(10f, Math.Clamp(prof.ceilingDb, -32f, -1f) / 20f);
                    float threshDb = Math.Min(prof.ceilingDb - 2f, prof.thresholdDb);
                    float ratio = Math.Clamp(prof.ratio, 1.5f, 20f);
                    float makeupLin = MathF.Pow(10f, Math.Clamp(prof.footstepLiftDb * 0.55f, 0f, 10f) / 20f);
                    float atkCoeff = 1f - MathF.Exp(-1f / (0.0008f * sampleRate));
                    float relCoeff = 1f - MathF.Exp(-1f / (Math.Clamp(prof.releaseMs, 20f, 350f) * 0.001f * sampleRate));

                    capService.GetNextPacketSize(out uint packetFrames);
                    if (packetFrames == 0)
                    {
                        Thread.Sleep(3);
                        continue;
                    }

                    while (packetFrames > 0 && !_stop)
                    {
                        if (capService.GetBuffer(out IntPtr pCap, out uint numFrames, out uint flags, out _, out _) != 0)
                            break;

                        int sampleCount = (int)(numFrames * channels);
                        if (scratch.Length < sampleCount) scratch = new float[sampleCount * 2];

                        if ((flags & 2 /* AUDCLNT_BUFFERFLAGS_SILENT */) != 0 || pCap == IntPtr.Zero)
                        {
                            Array.Clear(scratch, 0, sampleCount);
                        }
                        else
                        {
                            Marshal.Copy(pCap, scratch, 0, sampleCount);
                        }
                        capService.ReleaseBuffer(numFrames);

                        float maxIn = 0f, maxOut = 0f, maxGrDb = 0f;
                        for (int f = 0; f < numFrames; f++)
                        {
                            int idx = f * 2;
                            float l = scratch[idx];
                            float r = scratch[idx + 1];
                            float rawAbs = Math.Max(MathF.Abs(l), MathF.Abs(r));
                            if (rawAbs > maxIn) maxIn = rawAbs;

                            for (int b = 0; b < 5; b++)
                                eqBands[b].Process(ref l, ref r);

                            l *= makeupLin;
                            r *= makeupLin;

                            float postEqAbs = Math.Max(MathF.Abs(l), MathF.Abs(r));
                            float curDb = postEqAbs <= 0.00002f ? -80f : 20f * MathF.Log10(postEqAbs);
                            float targetLin = 1.0f;
                            if (curDb > threshDb)
                            {
                                float compDb = threshDb + (curDb - threshDb) / ratio;
                                float cappedDb = Math.Min(compDb, prof.ceilingDb);
                                targetLin = MathF.Pow(10f, (cappedDb - curDb) / 20f);
                                float gr = curDb - cappedDb;
                                if (gr > maxGrDb) maxGrDb = gr;
                            }

                            envLin += (targetLin - envLin) * (targetLin < envLin ? atkCoeff : relCoeff);
                            l = Math.Clamp(l * envLin, -ceilingLin, ceilingLin);
                            r = Math.Clamp(r * envLin, -ceilingLin, ceilingLin);

                            float outAbs = Math.Max(MathF.Abs(l), MathF.Abs(r));
                            if (outAbs > maxOut) maxOut = outAbs;

                            scratch[idx] = l;
                            scratch[idx + 1] = r;
                        }

                        renClient.GetCurrentPadding(out uint padding);
                        uint avail = renderBufFrames > padding ? renderBufFrames - padding : 0;
                        uint toWrite = Math.Min(avail, numFrames);
                        if (toWrite > 0 && renService.GetBuffer(toWrite, out IntPtr pRen) == 0 && pRen != IntPtr.Zero)
                        {
                            Marshal.Copy(scratch, 0, pRen, (int)(toWrite * channels));
                            renService.ReleaseBuffer(toWrite, 0);
                        }

                        _metricInDb = maxIn <= 0.00003f ? -60f : Math.Clamp(20f * MathF.Log10(maxIn), -60f, 0f);
                        _metricOutDb = maxOut <= 0.00003f ? -60f : Math.Clamp(20f * MathF.Log10(maxOut), -60f, 0f);
                        _metricGrDb = maxGrDb;
                        _metricLiftDb = prof.footstepLiftDb;

                        capService.GetNextPacketSize(out packetFrames);
                    }
                }
            }
            catch
            {
                IsAlive = false;
            }
            finally
            {
                try { capClient?.Stop(); } catch { }
                try { renClient?.Stop(); } catch { }
                if (pWfx != IntPtr.Zero) Marshal.FreeHGlobal(pWfx);
                if (capService != null) Marshal.ReleaseComObject(capService);
                if (renService != null) Marshal.ReleaseComObject(renService);
                if (capClient != null) Marshal.ReleaseComObject(capClient);
                if (renClient != null) Marshal.ReleaseComObject(renClient);
                if (outDev != null) Marshal.ReleaseComObject(outDev);
                if (enumerator != null) Marshal.ReleaseComObject(enumerator);
                IsAlive = false;
            }
        }

        private static IAudioClient? ActivateProcessLoopbackClient(uint targetPid)
        {
            IntPtr pParams = IntPtr.Zero;
            try
            {
                var loopParams = new AUDIOCLIENT_ACTIVATION_PARAMS
                {
                    ActivationType = 1, // AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
                    TargetProcessId = targetPid,
                    ProcessLoopbackMode = 0 // PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
                };
                int cb = Marshal.SizeOf<AUDIOCLIENT_ACTIVATION_PARAMS>();
                pParams = Marshal.AllocHGlobal(cb);
                Marshal.StructureToPtr(loopParams, pParams, false);

                var pv = new PROPVARIANT_BLOB
                {
                    vt = 65, // VT_BLOB
                    cbSize = (uint)cb,
                    pBlobData = pParams
                };

                var handler = new ActivateCompletionHandler();
                Guid iidAudioClient = typeof(IAudioClient).GUID;
                int hr = ActivateAudioInterfaceAsync(
                    "VAD\\Process_Loopback",
                    ref iidAudioClient,
                    ref pv,
                    handler,
                    out var op);

                if (hr != 0 || !handler.Wait(1500)) return null;
                if (op != null) Marshal.ReleaseComObject(op);
                return handler.Client;
            }
            catch
            {
                return null;
            }
            finally
            {
                if (pParams != IntPtr.Zero) Marshal.FreeHGlobal(pParams);
            }
        }
    }

    private sealed class BiquadStereo
    {
        private float _b0 = 1f, _b1, _b2, _a1, _a2;
        private float _z1L, _z2L, _z1R, _z2R;

        public void SetPeaking(float fs, float f0, float q, float gainDb)
        {
            if (MathF.Abs(gainDb) < 0.05f) { _b0 = 1f; _b1 = _b2 = _a1 = _a2 = 0f; return; }
            float A = MathF.Pow(10f, gainDb / 40f);
            float w0 = 2f * MathF.PI * f0 / fs;
            float cos = MathF.Cos(w0);
            float alpha = MathF.Sin(w0) / (2f * q);
            float a0 = 1f + alpha / A;
            _b0 = (1f + alpha * A) / a0;
            _b1 = (-2f * cos) / a0;
            _b2 = (1f - alpha * A) / a0;
            _a1 = (-2f * cos) / a0;
            _a2 = (1f - alpha / A) / a0;
        }

        public void SetLowShelf(float fs, float f0, float gainDb)
        {
            if (MathF.Abs(gainDb) < 0.05f) { _b0 = 1f; _b1 = _b2 = _a1 = _a2 = 0f; return; }
            float A = MathF.Pow(10f, gainDb / 40f);
            float w0 = 2f * MathF.PI * f0 / fs;
            float cos = MathF.Cos(w0);
            float alpha = MathF.Sin(w0) / 2f * MathF.Sqrt(2f);
            float twoSqrtAAlpha = 2f * MathF.Sqrt(A) * alpha;
            float a0 = (A + 1f) + (A - 1f) * cos + twoSqrtAAlpha;
            _b0 = A * ((A + 1f) - (A - 1f) * cos + twoSqrtAAlpha) / a0;
            _b1 = 2f * A * ((A - 1f) - (A + 1f) * cos) / a0;
            _b2 = A * ((A + 1f) - (A - 1f) * cos - twoSqrtAAlpha) / a0;
            _a1 = -2f * ((A - 1f) + (A + 1f) * cos) / a0;
            _a2 = ((A + 1f) + (A - 1f) * cos - twoSqrtAAlpha) / a0;
        }

        public void SetHighShelf(float fs, float f0, float gainDb)
        {
            if (MathF.Abs(gainDb) < 0.05f) { _b0 = 1f; _b1 = _b2 = _a1 = _a2 = 0f; return; }
            float A = MathF.Pow(10f, gainDb / 40f);
            float w0 = 2f * MathF.PI * f0 / fs;
            float cos = MathF.Cos(w0);
            float alpha = MathF.Sin(w0) / 2f * MathF.Sqrt(2f);
            float twoSqrtAAlpha = 2f * MathF.Sqrt(A) * alpha;
            float a0 = (A + 1f) - (A - 1f) * cos + twoSqrtAAlpha;
            _b0 = A * ((A + 1f) + (A - 1f) * cos + twoSqrtAAlpha) / a0;
            _b1 = -2f * A * ((A - 1f) + (A + 1f) * cos) / a0;
            _b2 = A * ((A + 1f) + (A - 1f) * cos - twoSqrtAAlpha) / a0;
            _a1 = 2f * ((A - 1f) - (A + 1f) * cos) / a0;
            _a2 = ((A + 1f) - (A - 1f) * cos - twoSqrtAAlpha) / a0;
        }

        public void Process(ref float l, ref float r)
        {
            float outL = _b0 * l + _z1L;
            _z1L = _b1 * l - _a1 * outL + _z2L;
            _z2L = _b2 * l - _a2 * outL;
            l = outL;

            float outR = _b0 * r + _z1R;
            _z1R = _b1 * r - _a1 * outR + _z2R;
            _z2R = _b2 * r - _a2 * outR;
            r = outR;
        }
    }

    [ComVisible(true)]
    private sealed class ActivateCompletionHandler : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        private readonly ManualResetEventSlim _done = new(false);
        public IAudioClient? Client { get; private set; }

        public int ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation)
        {
            try
            {
                activateOperation.GetActivateResult(out int hr, out object unk);
                if (hr == 0 && unk is IAudioClient ac) Client = ac;
            }
            catch { }
            finally { _done.Set(); }
            return 0;
        }

        public bool Wait(int ms) => _done.Wait(ms);
    }

    #endregion

    #region CoreAudio WASAPI COM Declarations

    private enum EDataFlow { eRender = 0, eCapture = 1, eAll = 2 }
    private enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumeratorComObject { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(EDataFlow dataFlow, uint dwStateMask, out IMMDeviceCollection ppDevices);
        [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppEndpoint);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice ppDevice);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr pClient);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out uint pcDevices);
        [PreserveSig] int Item(uint nDevice, out IMMDevice ppDevice);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, uint dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        [PreserveSig] int OpenPropertyStore(uint stgmAccess, out IPropertyStore ppProperties);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        [PreserveSig] int GetState(out uint pdwState);
    }

    [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        [PreserveSig] int GetCount(out uint cProps);
        [PreserveSig] int GetAt(uint iProp, out PROPERTYKEY pkey);
        [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT propvar);
        [PreserveSig] int Commit();
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROPERTYKEY { public Guid fmtid; public uint pid; }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROPVARIANT
    {
        public ushort vt;
        public ushort wReserved1, wReserved2, wReserved3;
        public IntPtr pwszVal;
        public IntPtr p2;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROPVARIANT_BLOB
    {
        public ushort vt;
        public ushort wReserved1, wReserved2, wReserved3;
        public uint cbSize;
        public IntPtr pBlobData;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AUDIOCLIENT_ACTIVATION_PARAMS
    {
        public int ActivationType;
        public uint TargetProcessId;
        public int ProcessLoopbackMode;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WAVEFORMATEX
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    [DllImport("ole32.dll")]
    private static extern int PropVariantClear(ref PROPVARIANT pvar);

    [DllImport("Mmdevapi.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
    private static extern int ActivateAudioInterfaceAsync(
        string deviceInterfacePath,
        ref Guid riid,
        ref PROPVARIANT_BLOB activationParams,
        IActivateAudioInterfaceCompletionHandler completionHandler,
        out IActivateAudioInterfaceAsyncOperation activationOperation);

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IActivateAudioInterfaceCompletionHandler
    {
        [PreserveSig] int ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
    }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IActivateAudioInterfaceAsyncOperation
    {
        [PreserveSig] int GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
    }

    [ComImport, Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAgileObject { }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(IntPtr AudioSessionGuid, uint StreamFlags, out IAudioSessionControl SessionControl);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr AudioSessionGuid, uint StreamFlags, out ISimpleAudioVolume AudioVolume);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
        [PreserveSig] int RegisterSessionNotification(IntPtr SessionNotification);
        [PreserveSig] int UnregisterSessionNotification(IntPtr SessionNotification);
        [PreserveSig] int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionID, IntPtr duckNotification);
        [PreserveSig] int UnregisterDuckNotification(IntPtr duckNotification);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int SessionCount);
        [PreserveSig] int GetSession(int SessionCount, out IAudioSessionControl Session);
    }

    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl
    {
        [PreserveSig] int GetState(out int pRetVal);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        [PreserveSig] int GetGroupingParam(out Guid pRetVal);
        [PreserveSig] int SetGroupingParam(ref Guid Override, ref Guid EventContext);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr NewNotifications);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr NewNotifications);
    }

    [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int pRetVal);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        [PreserveSig] int GetGroupingParam(out Guid pRetVal);
        [PreserveSig] int SetGroupingParam(ref Guid Override, ref Guid EventContext);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr NewNotifications);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr NewNotifications);
        [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int GetProcessId(out uint pRetVal);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ISimpleAudioVolume
    {
        [PreserveSig] int SetMasterVolume(float fLevel, ref Guid EventContext);
        [PreserveSig] int GetMasterVolume(out float pfLevel);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid EventContext);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
    }

    [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioMeterInformation
    {
        [PreserveSig] int GetPeakValue(out float pfPeak);
        [PreserveSig] int GetMeteringChannelCount(out uint pnChannelCount);
        [PreserveSig] int GetChannelsPeakValues(uint u32ChannelCount, [Out] float[] afPeakValues);
        [PreserveSig] int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    }

    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioClient
    {
        [PreserveSig] int Initialize(int ShareMode, uint StreamFlags, long hnsBufferDuration, long hnsPeriodicity, IntPtr pFormat, IntPtr AudioSessionGuid);
        [PreserveSig] int GetBufferSize(out uint pNumBufferFrames);
        [PreserveSig] int GetStreamLatency(out long phnsLatency);
        [PreserveSig] int GetCurrentPadding(out uint pNumPaddingFrames);
        [PreserveSig] int IsFormatSupported(int ShareMode, IntPtr pFormat, out IntPtr ppClosestMatch);
        [PreserveSig] int GetMixFormat(out IntPtr ppDeviceFormat);
        [PreserveSig] int GetDevicePeriod(out long phnsDefaultDevicePeriod, out long phnsMinimumDevicePeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr eventHandle);
        [PreserveSig] int GetService(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr ppData, out uint pNumFramesToRead, out uint pdwFlags, out ulong pu64DevicePosition, out ulong pu64QPCPosition);
        [PreserveSig] int ReleaseBuffer(uint NumFramesRead);
        [PreserveSig] int GetNextPacketSize(out uint pNumFramesInNextPacket);
    }

    [ComImport, Guid("F294ACFC-3146-4483-A7BF-ADDCA7C260E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioRenderClient
    {
        [PreserveSig] int GetBuffer(uint NumFramesRequested, out IntPtr ppData);
        [PreserveSig] int ReleaseBuffer(uint NumFramesWritten, uint dwFlags);
    }

    #endregion
}
