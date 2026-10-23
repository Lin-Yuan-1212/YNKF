# ============================================================
# tools/make-hero-thumbs.ps1 —— 从 img/*.jpg 生成首屏用的缩图 img/hero/*.jpg
# ------------------------------------------------------------
# 为什么要有这一步：首屏那排图在 CSS 里最大也就 300x190 上下，直接引用 960x677 的原图
# 等于首屏就压 322 KB 下去（而且首屏不能 lazy）。这里出 640x451，够 2 倍图用。
# 只做等比缩放：原图 960x677 是 1.418:1（不是 8:5），640x451 保持同一比例，不裁切、不重画、不加滤镜。
# 跑法（路径里有中文，所以脚本内容全 ASCII，一律用 $PSScriptRoot 相对定位）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/make-hero-thumbs.ps1
# 以后换成实物照片：覆盖 img/ 里同名文件，再跑一次这个脚本，两边就同步了。
# ============================================================
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$srcDir = Join-Path $PSScriptRoot '..\img'
$dstDir = Join-Path $PSScriptRoot '..\img\hero'
if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir | Out-Null }

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
         Where-Object { $_.MimeType -eq 'image/jpeg' }
if (-not $codec) { throw 'no jpeg encoder found' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [long]80)

$total = 0
Get-ChildItem -Path $srcDir -Filter *.jpg | ForEach-Object {
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    if ($img.Width -ne 960 -or $img.Height -ne 677) {
        # 尺寸信息要在 Dispose 之前取：Dispose 之后再读 Width 会抛 ObjectDisposedException，
        # 报错文案就变成"对象已释放"而不是真正的原因（尺寸不对），比原问题更难查
        $bad = "{0} is {1}x{2}" -f $_.Name, $img.Width, $img.Height
        $img.Dispose()
        throw ("$bad -- expected 960x677, check the source before regenerating")
    }
    # 目标宽度只有这一个数（640 = 首屏最大显示宽约 300px 的 2 倍图）。
    # 高按源比例算、不写死：写死会把图压出形变，脚本自己不该引入。
    # 两个维度都显式转 int：[math]::Round 返回 Double，Bitmap(Double,Double) 会撞上 GDI+ 的"参数无效"
    $W = [int]640
    $H = [int][math]::Round($img.Height * $W / $img.Width)
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($img, 0, 0, $W, $H)
    $out = Join-Path $dstDir ($_.BaseName + '.jpg')
    $bmp.Save($out, $codec, $ep)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
    $kb = [math]::Round((Get-Item $out).Length / 1KB)
    $script:total += $kb
    Write-Output ("{0} -> {1}x{2}  {3}KB" -f $_.Name, $W, $H, $kb)
}
Write-Output ("hero thumbs total ~{0}KB (originals in img/ are untouched)" -f $total)
