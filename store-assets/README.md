# Store assets

Imagens prontas para submissão na **Amazon Appstore** (Fire TV + tablet/phone)
e qualquer outra loja que aceite os mesmos formatos. Gerados a partir do
`public/assets/streamix-icon.svg` e `public/assets/streamix-logo.png` via
ImageMagick. Pode regerar com os comandos abaixo se trocar a marca.

## Fire TV (`fire-tv/`)

| Arquivo                    | Tamanho   | Formato               | Onde aparece                                                                        |
| -------------------------- | --------- | --------------------- | ----------------------------------------------------------------------------------- |
| `app-icon-1280x720.png`    | 1280×720  | PNG sem transparência | App Icon na home do Fire TV. Safe zone interna: 882×448                             |
| `background-1920x1080.jpg` | 1920×1080 | JPG                   | Mini-detail page (canto superior direito). Sujeito à direita pq UI cobre a esquerda |

## Tablet / Phone (`tablet/`)

| Arquivo            | Tamanho | Formato          | Onde aparece             |
| ------------------ | ------- | ---------------- | ------------------------ |
| `icon-512x512.png` | 512×512 | PNG transparente | Large icon (loja, lista) |
| `icon-114x114.png` | 114×114 | PNG transparente | Small icon (thumbnail)   |

## Faltam (capturar manualmente quando der)

- **Screenshots 1920×1080** (3 a 10, JPG/PNG sem transparência) — devem mostrar
  Home, Movies, Series, Channels e Detail/Player. Capturar pelo emulador AVD
  via `adb -s emulator-5554 exec-out screencap -p > store-assets/screenshots/01-home.png`
  com a app em estado representativo.
- **Feature Rotator** (1920×1080, opcional) — banner promocional rotativo.

## Regerar com ImageMagick

Pré-requisitos: `imagemagick`, fonte `public/fonts/NotoSans-Bold.ttf`.

```bash
# Fire TV App Icon 1280x720 (logo + STREAMIX wordmark)
magick -background none -density 600 public/assets/streamix-icon.svg \
  -resize 420x420 /tmp/logo-720.png
magick -size 1280x720 gradient:'#0a0a14-#1f0a22' -alpha off /tmp/banner-bg-720.png
magick /tmp/banner-bg-720.png \
  /tmp/logo-720.png -geometry +200+150 -composite \
  -font public/fonts/NotoSans-Bold.ttf \
  -pointsize 110 -fill white -gravity West -annotate +680+0 'STREAMIX' \
  -alpha off store-assets/fire-tv/app-icon-1280x720.png

# Fire TV Background 1920x1080 (cinematic, sujeito à direita)
magick -size 1920x1080 radial-gradient:'#3a0a3f-#0a0a14' /tmp/bg-radial.png
magick -background none -density 600 public/assets/streamix-icon.svg \
  -resize 700x700 -channel A -evaluate multiply 0.08 +channel /tmp/logo-ghost.png
magick /tmp/bg-radial.png \
  /tmp/logo-ghost.png -geometry +1080+200 -composite \
  -alpha off -quality 90 store-assets/fire-tv/background-1920x1080.jpg

# Tablet icons (transparency)
magick -background none -density 600 public/assets/streamix-icon.svg \
  -resize 512x512 store-assets/tablet/icon-512x512.png
magick -background none -density 600 public/assets/streamix-icon.svg \
  -resize 114x114 store-assets/tablet/icon-114x114.png
```

## Diretrizes da Amazon

Cheat-sheet do que **não** fazer:

- Sem marketing slogans no App Icon — só logo + nome
- Sem rounded corners ou border (Amazon adiciona)
- Sem logo/título no Background Image
- Cinematic > screenshot literal pro Background
- Manter elementos importantes dentro de 90% (overscan 5%)

Spec completa: <https://developer.amazon.com/docs/app-submission/appstore-details.html>
