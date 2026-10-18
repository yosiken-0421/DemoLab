# OCR精度テスト用の前処理（アプリの src/lib/enhance.ts と同じ考え方）
# 長辺2000pxに縮小 → グレースケール → 暗い1%〜明るい1%を0〜255に引き伸ばす
import sys
from PIL import Image, ImageOps

src, dst = sys.argv[1], sys.argv[2]
img = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
s = min(1.0, 2000 / max(img.size))
if s < 1:
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
g = img.convert('L')
hist = g.histogram()
n = sum(hist)
cut = max(1, n // 100)
acc, low = 0, 0
while low < 255 and acc + hist[low] < cut:
    acc += hist[low]; low += 1
acc, high = 0, 255
while high > 0 and acc + hist[high] < cut:
    acc += hist[high]; high -= 1
if high - low >= 24:
    g = g.point(lambda v: max(0, min(255, round((v - low) * 255 / (high - low)))))
g.save(dst, quality=90)
