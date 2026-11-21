using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json.Serialization;
using System.Windows.Forms;

namespace WinBridge;

#region Config Schema (Matches src/types/crosshair.ts 1:1)

public sealed class CrosshairLinesDto
{
    public bool enabled { get; set; } = true;
    public bool tShape { get; set; }
    public bool showTop { get; set; } = true;
    public bool showBottom { get; set; } = true;
    public bool showLeft { get; set; } = true;
    public bool showRight { get; set; } = true;
    public float length { get; set; } = 7;
    public float lengthVertical { get; set; } = 7;
    public bool splitAxes { get; set; }
    public float thickness { get; set; } = 2;
    public float gap { get; set; } = 4;
    public float gapVertical { get; set; } = 4;
    public float rotation { get; set; }
    public bool roundedCaps { get; set; }
    public string color { get; set; } = "#00f5ff";
    public float opacity { get; set; } = 1;
}

public sealed class CrosshairOuterLinesDto
{
    public bool enabled { get; set; }
    public float length { get; set; } = 4;
    public float thickness { get; set; } = 2;
    public float gap { get; set; } = 14;
    public float opacity { get; set; } = 0.45f;
    public string color { get; set; } = "#00f5ff";
    public bool usePrimaryColor { get; set; } = true;
    public float bloomMultiplier { get; set; } = 1.8f;
}

public sealed class CrosshairDotDto
{
    public bool enabled { get; set; } = true;
    public string shape { get; set; } = "circle";
    public float size { get; set; } = 2;
    public string color { get; set; } = "#ffffff";
    public bool usePrimaryColor { get; set; }
    public float opacity { get; set; } = 0.95f;
    public bool outline { get; set; } = true;
    public float outlineThickness { get; set; } = 1;
    public string outlineColor { get; set; } = "#000000";
}

public sealed class CrosshairRingDto
{
    public bool enabled { get; set; }
    public string style { get; set; } = "solid";
    public float radius { get; set; } = 18;
    public float thickness { get; set; } = 1.5f;
    public float dashGapDeg { get; set; } = 35;
    public float rotation { get; set; }
    public string color { get; set; } = "#00f5ff";
    public bool usePrimaryColor { get; set; } = true;
    public float opacity { get; set; } = 0.7f;
}

public sealed class CrosshairOutlineDto
{
    public bool enabled { get; set; } = true;
    public float thickness { get; set; } = 1;
    public string color { get; set; } = "#000000";
    public float opacity { get; set; } = 0.9f;
    public bool glowEnabled { get; set; }
    public float glowBlur { get; set; } = 6;
    public string glowColor { get; set; } = "#00f5ff";
    public float glowOpacity { get; set; } = 0.55f;
}

public sealed class CrosshairImageDto
{
    public bool enabled { get; set; }
    public string? dataUrl { get; set; }
    public string? fileName { get; set; }
    public float scale { get; set; } = 1;
    public float opacity { get; set; } = 1;
    public float rotation { get; set; }
    public bool hideVectorLayers { get; set; } = true;
}

public sealed class CrosshairAnimationDto
{
    public bool firingEnabled { get; set; } = true;
    public string firingType { get; set; } = "bloom";
    public float bloomAmount { get; set; } = 8;
    public float bloomSpeed { get; set; } = 18;
    public float recoverySpeed { get; set; } = 10;
    public string fireColor { get; set; } = "#ff3b5c";
    public float recoilKickPx { get; set; } = 6;
    public float hitmarkerSize { get; set; } = 12;

    public bool movementBloomEnabled { get; set; }
    public float movementSpreadPx { get; set; } = 5;
    public float sprintMultiplier { get; set; } = 1.6f;
    public float crouchTightenPx { get; set; } = 2;

    public string adsTrigger { get; set; } = "rmb_or_lt";
    public string adsMode { get; set; } = "hold";
    public string adsAction { get; set; } = "hide";
    public float adsDimOpacity { get; set; } = 0.2f;
    public float adsShrinkGapPx { get; set; } = 3;
    public float adsFadeMs { get; set; } = 90;
    public string? adsSecondaryProfileId { get; set; }

    public string idleType { get; set; } = "none";
    public float idleSpeed { get; set; } = 1;
    public float idleIntensity { get; set; } = 0.5f;
}

public sealed class CrosshairPositionDto
{
    public float offsetX { get; set; }
    public float offsetY { get; set; }
    public float scale { get; set; } = 1;
    public bool evenPixelSnap { get; set; } = true;
}

public sealed class CrosshairConfigDto
{
    public CrosshairLinesDto lines { get; set; } = new();
    public CrosshairOuterLinesDto outerLines { get; set; } = new();
    public CrosshairDotDto dot { get; set; } = new();
    public CrosshairRingDto ring { get; set; } = new();
    public CrosshairOutlineDto outline { get; set; } = new();
    public CrosshairImageDto image { get; set; } = new();
    public CrosshairAnimationDto animation { get; set; } = new();
    public CrosshairPositionDto position { get; set; } = new();
}

public struct InputSnapshot
{
    public bool Lmb, Rmb, Mmb, X1, X2;
    public bool Moving, Sprint, Crouch, Jump, AdsCustom;
    public bool CtrlFire, CtrlAds, CtrlMoving;
}

public struct AnimFrame
{
    public float GapDelta;
    public float OuterGapDelta;
    public float ScaleMult;
    public float OpacityMult;
    public float RotationDeltaDeg;
    public float RecoilOffsetY;
    public float HitmarkerAlpha;
    public string? ColorOverride;
    public float? RainbowHue;
    public float RadarAngleDeg;
    public bool UseSecondaryProfile;
    public bool IsAnimating;
}

#endregion

public sealed class NativeAnimController
{
    private float _bloom;
    private float _recoilY;
    private float _pulseScale;
    private float _spinDeg;
    private float _fireFlash;
    private float _hitmarker;
    private float _adsBlend;
    private bool _adsToggled;
    private bool _prevAdsDown;
    private bool _prevFireDown;
    private float _idleTime;

    private static bool IsAdsDown(CrosshairAnimationDto a, in InputSnapshot inp) => a.adsTrigger switch
    {
        "rmb" => inp.Rmb,
        "lt" => inp.CtrlAds,
        "rmb_or_lt" => inp.Rmb || inp.CtrlAds,
        "mmb" => inp.Mmb,
        "x1" => inp.X1,
        "x2" => inp.X2,
        "custom" => inp.AdsCustom,
        _ => false,
    };

    public AnimFrame Step(CrosshairConfigDto cfg, in InputSnapshot inp, float dtSec)
    {
        float dt = Math.Clamp(dtSec, 0.001f, 0.05f);
        var a = cfg.animation;
        _idleTime += dt;

        bool adsDown = IsAdsDown(a, inp);
        if (a.adsMode == "toggle")
        {
            if (adsDown && !_prevAdsDown) _adsToggled = !_adsToggled;
        }
        else
        {
            _adsToggled = adsDown;
        }
        _prevAdsDown = adsDown;

        float adsTarget = (a.adsAction != "none" && _adsToggled) ? 1f : 0f;
        float adsStep = dt / Math.Max(0.015f, a.adsFadeMs / 1000f);
        if (_adsBlend < adsTarget) _adsBlend = Math.Min(adsTarget, _adsBlend + adsStep);
        else if (_adsBlend > adsTarget) _adsBlend = Math.Max(adsTarget, _adsBlend - adsStep);

        bool fireDown = inp.Lmb || inp.CtrlFire;
        bool justFired = fireDown && !_prevFireDown;
        _prevFireDown = fireDown;

        if (a.firingEnabled && a.firingType != "none")
        {
            if (fireDown)
            {
                _bloom = Math.Min(1f, _bloom + dt * a.bloomSpeed * 0.65f);
                _recoilY = Math.Min(1f, _recoilY + dt * a.bloomSpeed * 0.8f);
                _fireFlash = 1f;
                if (justFired)
                {
                    _pulseScale = 1f;
                    _hitmarker = 1f;
                    _bloom = Math.Min(1f, _bloom + 0.35f);
                }
                if (a.firingType == "spin")
                    _spinDeg = (_spinDeg + dt * 360f * (0.7f + a.bloomSpeed * 0.08f)) % 360f;
            }
            else
            {
                _bloom = Math.Max(0f, _bloom - dt * a.recoverySpeed * 0.45f);
                _recoilY = Math.Max(0f, _recoilY - dt * a.recoverySpeed * 0.55f);
                _fireFlash = Math.Max(0f, _fireFlash - dt * 8f);
            }
            _pulseScale = Math.Max(0f, _pulseScale - dt * 7f);
            _hitmarker = Math.Max(0f, _hitmarker - dt * 5.5f);
        }
        else
        {
            _bloom = 0; _recoilY = 0; _pulseScale = 0; _fireFlash = 0; _hitmarker = 0;
        }

        float moveSpread = 0f;
        if (a.movementBloomEnabled)
        {
            if (inp.Moving || inp.CtrlMoving) moveSpread = a.movementSpreadPx * (inp.Sprint ? a.sprintMultiplier : 1f);
            if (inp.Jump) moveSpread += a.movementSpreadPx * 0.9f;
            if (inp.Crouch) moveSpread -= a.crouchTightenPx;
        }

        float gapDelta = moveSpread;
        float recoilOffsetY = 0f;
        float scaleMult = 1f;
        float rotDelta = 0f;
        string? colorOverride = null;
        float hitmarkerAlpha = 0f;

        if (a.firingEnabled)
        {
            switch (a.firingType)
            {
                case "bloom":
                    gapDelta += _bloom * a.bloomAmount;
                    break;
                case "recoil":
                    gapDelta += _bloom * (a.bloomAmount * 0.45f);
                    recoilOffsetY = -_recoilY * a.recoilKickPx;
                    break;
                case "pulse":
                    scaleMult += _pulseScale * (0.12f + a.bloomAmount * 0.015f);
                    break;
                case "spin":
                    rotDelta += _spinDeg;
                    gapDelta += _bloom * (a.bloomAmount * 0.3f);
                    break;
                case "flash":
                    if (_fireFlash > 0.1f) colorOverride = a.fireColor;
                    gapDelta += _bloom * (a.bloomAmount * 0.25f);
                    break;
                case "hitmarker":
                    hitmarkerAlpha = _hitmarker;
                    gapDelta += _bloom * (a.bloomAmount * 0.2f);
                    break;
            }
        }

        float opacityMult = 1f;
        float? rainbowHue = null;
        float radarAngleDeg = 0f;
        bool hasIdle = a.idleType != "none";

        switch (a.idleType)
        {
            case "breathe":
                float wave = MathF.Sin(_idleTime * a.idleSpeed * 3.2f);
                scaleMult *= 1f + wave * 0.14f * a.idleIntensity;
                opacityMult *= 1f - (1f - (wave * 0.5f + 0.5f)) * 0.35f * a.idleIntensity;
                break;
            case "spin":
                rotDelta = (rotDelta + _idleTime * 90f * a.idleSpeed) % 360f;
                break;
            case "rainbow":
                rainbowHue = (_idleTime * 110f * a.idleSpeed) % 360f;
                break;
            case "radar":
                radarAngleDeg = (_idleTime * 252f * a.idleSpeed) % 360f;
                break;
        }

        bool useSecondary = false;
        if (_adsBlend > 0.001f)
        {
            switch (a.adsAction)
            {
                case "hide":
                    opacityMult *= 1f - _adsBlend;
                    break;
                case "dim":
                    opacityMult *= 1f - _adsBlend * (1f - a.adsDimOpacity);
                    break;
                case "shrink":
                    gapDelta -= _adsBlend * a.adsShrinkGapPx;
                    break;
                case "switch":
                    useSecondary = _adsBlend >= 0.5f && !string.IsNullOrEmpty(a.adsSecondaryProfileId);
                    break;
            }
        }

        bool activeMotion = hasIdle ||
                            _bloom > 0.002f || _recoilY > 0.002f || _pulseScale > 0.002f ||
                            _fireFlash > 0.002f || _hitmarker > 0.002f ||
                            (_adsBlend > 0.002f && _adsBlend < 0.998f) ||
                            fireDown;

        return new AnimFrame
        {
            GapDelta = gapDelta,
            OuterGapDelta = gapDelta * cfg.outerLines.bloomMultiplier,
            ScaleMult = scaleMult,
            OpacityMult = Math.Clamp(opacityMult, 0f, 1f),
            RotationDeltaDeg = rotDelta,
            RecoilOffsetY = recoilOffsetY,
            HitmarkerAlpha = hitmarkerAlpha,
            ColorOverride = colorOverride,
            RainbowHue = rainbowHue,
            RadarAngleDeg = radarAngleDeg,
            UseSecondaryProfile = useSecondary,
            IsAnimating = activeMotion,
        };
    }
}

/// <summary>
/// Ultra-lightweight native Win32 Layered Overlay Window (WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE).
/// Renders directly via UpdateLayeredWindow (per-pixel alpha) with ZERO Chromium overhead (~0.0% CPU when static, ~15-20MB RAM total).
/// </summary>
public sealed class NativeOverlayForm : Form
{
    private const int WS_EX_LAYERED = 0x00080000;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_TOPMOST = 0x00000008;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int ULW_ALPHA = 0x00000002;
    private const byte AC_SRC_OVER = 0x00;
    private const byte AC_SRC_ALPHA = 0x01;
    private static readonly IntPtr HWND_TOPMOST = new(-1);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const uint SWP_NOSENDCHANGING = 0x0400;

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)]
    private struct SIZE { public int cx, cy; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize,
        IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);

    [DllImport("user32.dll")]
    private static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    private static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    private Bitmap? _surface;
    private string? _cachedImgUrl;
    private Image? _cachedImg;
    private int _winX, _winY, _winSize = 360;
    private bool _overlayVisible;

    public NativeOverlayForm()
    {
        Text = "ZeroPoint Crosshair Overlay";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Size = new Size(360, 360);
        TopMost = true;
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
            return cp;
        }
    }

    public void SetOverlayPlacement(int x, int y, int sizePx)
    {
        _winX = x;
        _winY = y;
        int clamped = Math.Clamp(sizePx, 180, 640);
        if (_winSize != clamped || _surface == null)
        {
            _winSize = clamped;
            _surface?.Dispose();
            _surface = new Bitmap(_winSize, _winSize, PixelFormat.Format32bppPArgb);
        }
    }

    public void SetOverlayVisibility(bool visible)
    {
        _overlayVisible = visible;
        if (!IsHandleCreated) CreateHandle();
        if (visible)
        {
            if (!Visible) SetWindowPos(Handle, HWND_TOPMOST, _winX, _winY, _winSize, _winSize, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
        else
        {
            if (Visible) Hide();
        }
    }

    public void KeepTopmost()
    {
        if (!_overlayVisible || !IsHandleCreated) return;
        SetWindowPos(Handle, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOSENDCHANGING);
    }

    private Image? ResolveCustomImage(string? dataUrl)
    {
        if (string.IsNullOrEmpty(dataUrl)) return null;
        if (string.Equals(_cachedImgUrl, dataUrl, StringComparison.Ordinal)) return _cachedImg;

        _cachedImg?.Dispose();
        _cachedImg = null;
        _cachedImgUrl = dataUrl;
        try
        {
            int comma = dataUrl.IndexOf(',');
            if (comma < 0) return null;
            byte[] bytes = Convert.FromBase64String(dataUrl[(comma + 1)..]);
            using var ms = new MemoryStream(bytes);
            using var temp = Image.FromStream(ms);
            _cachedImg = new Bitmap(temp);
        }
        catch
        {
            _cachedImg = null;
        }
        return _cachedImg;
    }

    public void RenderFrame(CrosshairConfigDto cfg, in AnimFrame frame, float dpiScale)
    {
        if (!_overlayVisible) return;
        if (!IsHandleCreated) CreateHandle();
        if (_surface == null) _surface = new Bitmap(_winSize, _winSize, PixelFormat.Format32bppPArgb);

        using (var g = Graphics.FromImage(_surface))
        {
            g.Clear(Color.Transparent);
            if (frame.OpacityMult > 0.005f)
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                DrawCrosshair(g, _winSize, cfg, frame, dpiScale);
            }
        }

        PushBitmapToLayeredWindow(_surface);
    }

    private void PushBitmapToLayeredWindow(Bitmap bmp)
    {
        IntPtr screenDc = GetDC(IntPtr.Zero);
        IntPtr memDc = CreateCompatibleDC(screenDc);
        IntPtr hBitmap = IntPtr.Zero;
        IntPtr oldBitmap = IntPtr.Zero;
        try
        {
            hBitmap = bmp.GetHbitmap(Color.FromArgb(0));
            oldBitmap = SelectObject(memDc, hBitmap);
            var size = new SIZE { cx = bmp.Width, cy = bmp.Height };
            var srcPt = new POINT { x = 0, y = 0 };
            var dstPt = new POINT { x = _winX, y = _winY };
            var blend = new BLENDFUNCTION
            {
                BlendOp = AC_SRC_OVER,
                BlendFlags = 0,
                SourceConstantAlpha = 255,
                AlphaFormat = AC_SRC_ALPHA
            };
            UpdateLayeredWindow(Handle, screenDc, ref dstPt, ref size, memDc, ref srcPt, 0, ref blend, ULW_ALPHA);
        }
        finally
        {
            if (oldBitmap != IntPtr.Zero) SelectObject(memDc, oldBitmap);
            if (hBitmap != IntPtr.Zero) DeleteObject(hBitmap);
            DeleteDC(memDc);
            ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    #region GDI+ Crosshair Vector & Sprite Renderer (Matches crosshairRenderer.ts)

    private static Color ParseHex(string? hex, float alpha01)
    {
        int a = Math.Clamp((int)MathF.Round(alpha01 * 255f), 0, 255);
        if (string.IsNullOrWhiteSpace(hex)) return Color.FromArgb(a, 0, 245, 255);
        try
        {
            var c = ColorTranslator.FromHtml(hex.Trim());
            return Color.FromArgb(a, c.R, c.G, c.B);
        }
        catch
        {
            return Color.FromArgb(a, 0, 245, 255);
        }
    }

    private static Color HslToColor(float hDeg, float alpha01)
    {
        float h = ((hDeg % 360f) + 360f) % 360f;
        float s = 1f, l = 0.55f;
        float c = (1f - MathF.Abs(2f * l - 1f)) * s;
        float x = c * (1f - MathF.Abs((h / 60f) % 2f - 1f));
        float m = l - c / 2f;
        float r = 0, g = 0, b = 0;
        if (h < 60) { r = c; g = x; }
        else if (h < 120) { r = x; g = c; }
        else if (h < 180) { g = c; b = x; }
        else if (h < 240) { g = x; b = c; }
        else if (h < 300) { r = x; b = c; }
        else { r = c; b = x; }
        return Color.FromArgb(
            Math.Clamp((int)MathF.Round(alpha01 * 255f), 0, 255),
            Math.Clamp((int)MathF.Round((r + m) * 255f), 0, 255),
            Math.Clamp((int)MathF.Round((g + m) * 255f), 0, 255),
            Math.Clamp((int)MathF.Round((b + m) * 255f), 0, 255)
        );
    }

    private static Color ResolveColor(string baseHex, in AnimFrame f, float alpha01)
    {
        if (!string.IsNullOrEmpty(f.ColorOverride)) return ParseHex(f.ColorOverride, alpha01);
        if (f.RainbowHue.HasValue) return HslToColor(f.RainbowHue.Value, alpha01);
        return ParseHex(baseHex, alpha01);
    }

    private static GraphicsPath CreateRoundedRectPath(float x, float y, float w, float h, float r)
    {
        var path = new GraphicsPath();
        if (r <= 0.25f)
        {
            path.AddRectangle(new RectangleF(x, y, w, h));
            return path;
        }
        float d = Math.Min(r * 2f, Math.Min(w, h));
        path.AddArc(x, y, d, d, 180, 90);
        path.AddArc(x + w - d, y, d, d, 270, 90);
        path.AddArc(x + w - d, y + h - d, d, d, 0, 90);
        path.AddArc(x, y + h - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private void DrawCrosshair(Graphics g, int size, CrosshairConfigDto cfg, AnimFrame f, float dpiScale)
    {
        float scale = Math.Max(0.1f, cfg.position.scale * f.ScaleMult * dpiScale);
        float cx = size / 2f;
        float cy = size / 2f + f.RecoilOffsetY * dpiScale;
        if (cfg.position.evenPixelSnap)
        {
            cx = MathF.Round(cx);
            cy = MathF.Round(cy);
        }

        var rootState = g.Save();
        g.TranslateTransform(cx, cy);
        g.ScaleTransform(scale, scale);

        // Optional soft optical outer glow halo
        if (cfg.outline.glowEnabled && cfg.outline.glowBlur > 0.5f)
        {
            float glowR = Math.Max(10f, cfg.outline.glowBlur * 2.2f);
            using var gp = new GraphicsPath();
            gp.AddEllipse(-glowR, -glowR, glowR * 2, glowR * 2);
            using var pgb = new PathGradientBrush(gp)
            {
                CenterColor = f.RainbowHue.HasValue
                    ? HslToColor(f.RainbowHue.Value, cfg.outline.glowOpacity * 0.48f * f.OpacityMult)
                    : ParseHex(cfg.outline.glowColor, cfg.outline.glowOpacity * 0.48f * f.OpacityMult),
                SurroundColors = new[] { Color.FromArgb(0, 0, 0, 0) }
            };
            g.FillPath(pgb, gp);
        }

        // 1. Custom Uploaded Image / Pixel-Art Layer
        if (cfg.image.enabled && !string.IsNullOrEmpty(cfg.image.dataUrl))
        {
            var img = ResolveCustomImage(cfg.image.dataUrl);
            if (img != null)
            {
                var st = g.Save();
                bool isPixelArt = string.Equals(cfg.image.fileName, "pixel-art.png", StringComparison.OrdinalIgnoreCase);
                if (isPixelArt)
                {
                    g.InterpolationMode = InterpolationMode.NearestNeighbor;
                    g.PixelOffsetMode = PixelOffsetMode.Half;
                }
                g.RotateTransform(cfg.image.rotation + f.RotationDeltaDeg);
                float maxDim = 64f * cfg.image.scale;
                float ratio = Math.Min(maxDim / img.Width, maxDim / img.Height);
                float dw = img.Width * ratio;
                float dh = img.Height * ratio;
                using var ia = new ImageAttributes();
                var cm = new ColorMatrix { Matrix33 = Math.Clamp(cfg.image.opacity * f.OpacityMult, 0f, 1f) };
                ia.SetColorMatrix(cm, ColorMatrixFlag.Default, ColorAdjustType.Bitmap);
                g.DrawImage(img,
                    new Rectangle((int)MathF.Round(-dw / 2f), (int)MathF.Round(-dh / 2f), Math.Max(1, (int)MathF.Round(dw)), Math.Max(1, (int)MathF.Round(dh))),
                    0, 0, img.Width, img.Height, GraphicsUnit.Pixel, ia);
                g.Restore(st);
            }
            if (cfg.image.hideVectorLayers)
            {
                DrawHitmarker(g, cfg, f);
                g.Restore(rootState);
                return;
            }
        }

        bool outlineOn = cfg.outline.enabled && cfg.outline.thickness > 0;
        float ot = cfg.outline.thickness;
        float oAlpha = cfg.outline.opacity * f.OpacityMult;

        void DrawArm(float x, float y, float w, float h, string hex, float alpha, bool rounded)
        {
            float r = rounded ? Math.Min(w, h) / 2f : 0f;
            if (outlineOn)
            {
                using var op = CreateRoundedRectPath(x - ot, y - ot, w + ot * 2, h + ot * 2, r > 0 ? r + ot : 0);
                using var ob = new SolidBrush(ParseHex(cfg.outline.color, oAlpha * alpha));
                g.FillPath(ob, op);
            }
            using var p = CreateRoundedRectPath(x, y, w, h, r);
            using var b = new SolidBrush(ResolveColor(hex, f, alpha * f.OpacityMult));
            g.FillPath(b, p);
        }

        // 2. Ring / Brackets / Arcs / Chevron / Mil-Scope
        if (cfg.ring.enabled)
        {
            string rHex = cfg.ring.usePrimaryColor ? cfg.lines.color : cfg.ring.color;
            float r = Math.Max(2f, cfg.ring.radius + f.GapDelta * 0.65f);
            float t = Math.Max(0.6f, cfg.ring.thickness);
            var st = g.Save();
            g.RotateTransform(cfg.ring.rotation + f.RotationDeltaDeg);

            void StrokeRingAction(Action<Pen> draw)
            {
                if (outlineOn)
                {
                    using var op = new Pen(ParseHex(cfg.outline.color, oAlpha * cfg.ring.opacity), t + ot * 2)
                    { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
                    draw(op);
                }
                using var p = new Pen(ResolveColor(rHex, f, cfg.ring.opacity * f.OpacityMult), t)
                { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
                draw(p);
            }

            switch (cfg.ring.style)
            {
                case "solid":
                    StrokeRingAction(p => g.DrawEllipse(p, -r, -r, r * 2, r * 2));
                    break;
                case "dashed":
                {
                    float gapDeg = Math.Clamp(cfg.ring.dashGapDeg, 5f, 75f);
                    float sweep = 90f - gapDeg;
                    StrokeRingAction(p =>
                    {
                        for (int i = 0; i < 4; i++)
                            g.DrawArc(p, -r, -r, r * 2, r * 2, i * 90f + gapDeg / 2f, sweep);
                    });
                    break;
                }
                case "arcs":
                {
                    float span = 90f - Math.Min(70f, cfg.ring.dashGapDeg);
                    StrokeRingAction(p =>
                    {
                        g.DrawArc(p, -r, -r, r * 2, r * 2, -span / 2f, span);
                        g.DrawArc(p, -r, -r, r * 2, r * 2, 180f - span / 2f, span);
                    });
                    break;
                }
                case "brackets":
                {
                    float hh = r * 0.72f;
                    float lip = r * 0.3f;
                    StrokeRingAction(p =>
                    {
                        g.DrawLines(p, new[] { new PointF(-r + lip, -hh), new PointF(-r, -hh), new PointF(-r, hh), new PointF(-r + lip, hh) });
                        g.DrawLines(p, new[] { new PointF(r - lip, -hh), new PointF(r, -hh), new PointF(r, hh), new PointF(r - lip, hh) });
                    });
                    break;
                }
                case "chevron":
                    StrokeRingAction(p => g.DrawLines(p, new[] { new PointF(-r * 0.7f, r * 0.55f), new PointF(0, 0), new PointF(r * 0.7f, r * 0.55f) }));
                    break;
                case "scope":
                    StrokeRingAction(p =>
                    {
                        g.DrawEllipse(p, -r, -r, r * 2, r * 2);
                        for (int k = 1; k <= 3; k++)
                        {
                            float d = r * k / 4f;
                            float tk = k == 2 ? 3.5f : 2f;
                            g.DrawLine(p, -tk, d, tk, d);
                            g.DrawLine(p, d, -tk, d, tk);
                            g.DrawLine(p, -d, -tk, -d, tk);
                        }
                    });
                    break;
            }

            if (cfg.animation.idleType == "radar")
            {
                using var rp = new Pen(ResolveColor(rHex, f, 0.65f * f.OpacityMult), Math.Max(1.5f, t))
                { StartCap = LineCap.Round, EndCap = LineCap.Round };
                g.DrawArc(rp, -(r + 3), -(r + 3), (r + 3) * 2, (r + 3) * 2, f.RadarAngleDeg, 95f);
            }
            g.Restore(st);
        }
        else if (cfg.animation.idleType == "radar")
        {
            using var rp = new Pen(ResolveColor(cfg.lines.color, f, 0.65f * f.OpacityMult), 1.5f)
            { StartCap = LineCap.Round, EndCap = LineCap.Round };
            g.DrawArc(rp, -16, -16, 32, 32, f.RadarAngleDeg, 105f);
        }

        // 3. Secondary Outer Lines
        if (cfg.outerLines.enabled)
        {
            var ol = cfg.outerLines;
            string hex = ol.usePrimaryColor ? cfg.lines.color : ol.color;
            float gap = Math.Max(0f, ol.gap + f.OuterGapDelta);
            float len = Math.Max(1f, ol.length);
            float t = Math.Max(1f, ol.thickness);
            var st = g.Save();
            g.RotateTransform(cfg.lines.rotation + f.RotationDeltaDeg);
            if (!cfg.lines.tShape && cfg.lines.showTop) DrawArm(-t / 2, -gap - len, t, len, hex, ol.opacity, cfg.lines.roundedCaps);
            if (cfg.lines.showBottom) DrawArm(-t / 2, gap, t, len, hex, ol.opacity, cfg.lines.roundedCaps);
            if (cfg.lines.showLeft) DrawArm(-gap - len, -t / 2, len, t, hex, ol.opacity, cfg.lines.roundedCaps);
            if (cfg.lines.showRight) DrawArm(gap, -t / 2, len, t, hex, ol.opacity, cfg.lines.roundedCaps);
            g.Restore(st);
        }

        // 4. Primary Inner Lines
        if (cfg.lines.enabled)
        {
            var l = cfg.lines;
            float gapH = Math.Max(0f, l.gap + f.GapDelta);
            float gapV = Math.Max(0f, (l.splitAxes ? l.gapVertical : l.gap) + f.GapDelta);
            float lenH = Math.Max(1f, l.length);
            float lenV = Math.Max(1f, l.splitAxes ? l.lengthVertical : l.length);
            float t = Math.Max(1f, l.thickness);
            var st = g.Save();
            g.RotateTransform(l.rotation + f.RotationDeltaDeg);
            if (!l.tShape && l.showTop) DrawArm(-t / 2, -gapV - lenV, t, lenV, l.color, l.opacity, l.roundedCaps);
            if (l.showBottom) DrawArm(-t / 2, gapV, t, lenV, l.color, l.opacity, l.roundedCaps);
            if (l.showLeft) DrawArm(-gapH - lenH, -t / 2, lenH, t, l.color, l.opacity, l.roundedCaps);
            if (l.showRight) DrawArm(gapH, -t / 2, lenH, t, l.color, l.opacity, l.roundedCaps);
            g.Restore(st);
        }

        // 5. Center Dot
        if (cfg.dot.enabled && cfg.dot.size > 0)
        {
            var d = cfg.dot;
            string dHex = d.usePrimaryColor ? cfg.lines.color : d.color;
            float s = d.size;
            bool dotOut = d.outline && d.outlineThickness > 0;
            float dotOt = d.outlineThickness;
            using var db = new SolidBrush(ResolveColor(dHex, f, d.opacity * f.OpacityMult));
            using var dob = new SolidBrush(ParseHex(d.outlineColor, d.opacity * oAlpha));

            if (d.shape == "circle")
            {
                float r = s / 2f;
                if (dotOut) g.FillEllipse(dob, -(r + dotOt), -(r + dotOt), (r + dotOt) * 2, (r + dotOt) * 2);
                g.FillEllipse(db, -r, -r, s, s);
            }
            else if (d.shape == "square")
            {
                if (dotOut) g.FillRectangle(dob, -s / 2 - dotOt, -s / 2 - dotOt, s + dotOt * 2, s + dotOt * 2);
                g.FillRectangle(db, -s / 2, -s / 2, s, s);
            }
            else if (d.shape == "diamond")
            {
                var st = g.Save();
                g.RotateTransform(45f);
                float side = s * 0.78f;
                if (dotOut) g.FillRectangle(dob, -side / 2 - dotOt, -side / 2 - dotOt, side + dotOt * 2, side + dotOt * 2);
                g.FillRectangle(db, -side / 2, -side / 2, side, side);
                g.Restore(st);
            }
            else if (d.shape == "plus")
            {
                float tk = Math.Clamp(s * 0.35f, 1f, 2.5f);
                float ln = Math.Max(3f, s * 1.4f);
                if (dotOut)
                {
                    g.FillRectangle(dob, -ln / 2 - dotOt, -tk / 2 - dotOt, ln + dotOt * 2, tk + dotOt * 2);
                    g.FillRectangle(dob, -tk / 2 - dotOt, -ln / 2 - dotOt, tk + dotOt * 2, ln + dotOt * 2);
                }
                g.FillRectangle(db, -ln / 2, -tk / 2, ln, tk);
                g.FillRectangle(db, -tk / 2, -ln / 2, tk, ln);
            }
        }

        // 6. Hitmarker Burst
        DrawHitmarker(g, cfg, f);

        g.Restore(rootState);
    }

    private static void DrawHitmarker(Graphics g, CrosshairConfigDto cfg, in AnimFrame f)
    {
        if (f.HitmarkerAlpha <= 0.02f) return;
        float size = Math.Max(6f, cfg.animation.hitmarkerSize);
        float inner = 4f + (1f - f.HitmarkerAlpha) * 3f;
        float outer = inner + size * 0.55f;
        using var pen = new Pen(ParseHex(cfg.animation.fireColor, f.HitmarkerAlpha * f.OpacityMult), 2f)
        { StartCap = LineCap.Round, EndCap = LineCap.Round };
        for (int i = 0; i < 4; i++)
        {
            float a = MathF.PI / 4f + i * MathF.PI / 2f;
            g.DrawLine(pen, MathF.Cos(a) * inner, MathF.Sin(a) * inner, MathF.Cos(a) * outer, MathF.Sin(a) * outer);
        }
    }

    #endregion

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _surface?.Dispose();
            _cachedImg?.Dispose();
        }
        base.Dispose(disposing);
    }
}
