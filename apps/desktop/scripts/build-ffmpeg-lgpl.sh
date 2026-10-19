#!/usr/bin/env bash
# Builds an LGPL-only FFmpeg (ffmpeg + ffprobe) from the pinned source release, for platforms where
# no trustworthy prebuilt LGPL build exists (macOS). Also works on Linux, which is how CI-free
# maintainers can check the recipe.
#
# Usage: scripts/build-ffmpeg-lgpl.sh <output-dir> <rust-target-triple>
#   e.g. scripts/build-ffmpeg-lgpl.sh src-tauri/binaries aarch64-apple-darwin
#        scripts/build-ffmpeg-lgpl.sh src-tauri/binaries x86_64-apple-darwin   (cross-built on arm64)
#
# Output: <output-dir>/dax-ffmpeg-<triple>, dax-ffprobe-<triple>, FFMPEG-LICENSE.txt
#
# What is enabled: native decoders/encoders and muxers, zlib, FreeType and HarfBuzz (both are
# required by the `drawtext` filter that text overlays need), and on macOS VideoToolbox + AudioToolbox (hardware H.264/HEVC and AAC).
# What is NOT enabled, on purpose: --enable-gpl, --enable-nonfree, libx264, libx265, anything
# auto-detected from the build machine. VP9/VP8 decode is built in; VP9 *encode* (libvpx) and
# software H.264 encode (libopenh264) are not included in this minimal macOS build because
# VideoToolbox covers H.264 on every supported Mac.

set -euo pipefail

FFMPEG_VERSION="9.0.2"
# Verified against the FFmpeg release signing key FCF9 86EA 15E6 E293 A564 4F10 B432 2F04 D676 58D8.
FFMPEG_SHA256="8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e"
FREETYPE_VERSION="2.13.3"
FREETYPE_SHA256="0550350666d427c74daeb85d5ac7bb353acba5f76956395995311a9c6f063289"
HARFBUZZ_VERSION="14.6.0"
HARFBUZZ_SHA256="d07a007327277708a2a73ae437887cdbaf282937f6d03ca5467723e9099af586"

OUT_DIR="${1:?usage: build-ffmpeg-lgpl.sh <output-dir> <target-triple>}"
TRIPLE="${2:?usage: build-ffmpeg-lgpl.sh <output-dir> <target-triple>}"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}"
CACHE="${DAX_FFMPEG_CACHE:-$HOME/.cache/dax/src}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$CACHE" "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

case "$TRIPLE" in
  aarch64-apple-darwin) ARCH=arm64; CROSS_ARGS=(--arch=arm64); HOST_ARGS=() ;;
  x86_64-apple-darwin)  ARCH=x86_64; CROSS_ARGS=(--arch=x86_64); HOST_ARGS=() ;;
  x86_64-unknown-linux-gnu)  ARCH=x86_64; CROSS_ARGS=(); HOST_ARGS=() ;;
  aarch64-unknown-linux-gnu) ARCH=arm64; CROSS_ARGS=(); HOST_ARGS=() ;;
  *) echo "unsupported target $TRIPLE" >&2; exit 2 ;;
esac

EXTRA_CFLAGS=""
CMAKE_ARGS=()
CXX_RUNTIME="-lstdc++"
EXTRA_LDFLAGS=""
PLATFORM_FLAGS=()
case "$TRIPLE" in
  *-apple-darwin)
    export MACOSX_DEPLOYMENT_TARGET="11.0"
    EXTRA_CFLAGS="-arch $ARCH -mmacosx-version-min=11.0"
    EXTRA_LDFLAGS="-arch $ARCH -mmacosx-version-min=11.0"
    CMAKE_ARGS=(-DCMAKE_OSX_ARCHITECTURES="$ARCH" -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0)
    CXX_RUNTIME="-lc++"
    PLATFORM_FLAGS=(--enable-videotoolbox --enable-audiotoolbox --enable-iconv)
    # x86_64 on an arm64 runner (or the reverse) is a cross build for ./configure.
    HOST_ARCH="$(uname -m)"
    [ "$HOST_ARCH" = "aarch64" ] && HOST_ARCH=arm64
    if [ "$HOST_ARCH" != "$ARCH" ]; then
      CROSS_ARGS+=(--enable-cross-compile --target-os=darwin)
      HOST_ARGS=(--host="$TRIPLE")
    fi
    export CC="clang -arch $ARCH"
    ;;
esac

fetch() { # url file sha256
  local url="$1" file="$CACHE/$2" sha="$3"
  [ -f "$file" ] || curl -fL --retry 3 -sS -o "$file" "$url"
  echo "$sha  $file" > "$WORK/sum"
  if command -v sha256sum >/dev/null; then sha256sum -c "$WORK/sum" >/dev/null; else shasum -a 256 -c "$WORK/sum" >/dev/null; fi
}

fetch "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" "ffmpeg-$FFMPEG_VERSION.tar.xz" "$FFMPEG_SHA256"
fetch "https://download.savannah.gnu.org/releases/freetype/freetype-$FREETYPE_VERSION.tar.xz" "freetype-$FREETYPE_VERSION.tar.xz" "$FREETYPE_SHA256"
fetch "https://github.com/harfbuzz/harfbuzz/releases/download/$HARFBUZZ_VERSION/harfbuzz-$HARFBUZZ_VERSION.tar.xz" "harfbuzz-$HARFBUZZ_VERSION.tar.xz" "$HARFBUZZ_SHA256"

PREFIX="$WORK/prefix"
mkdir -p "$PREFIX" "$WORK/src"
tar -xf "$CACHE/freetype-$FREETYPE_VERSION.tar.xz" -C "$WORK/src"
tar -xf "$CACHE/harfbuzz-$HARFBUZZ_VERSION.tar.xz" -C "$WORK/src"
tar -xf "$CACHE/ffmpeg-$FFMPEG_VERSION.tar.xz" -C "$WORK/src"

echo "== FreeType $FREETYPE_VERSION (static, FreeType License)"
(
  cd "$WORK/src/freetype-$FREETYPE_VERSION"
  CFLAGS="$EXTRA_CFLAGS" LDFLAGS="$EXTRA_LDFLAGS" ./configure --prefix="$PREFIX" \
    --disable-shared --enable-static --with-harfbuzz=no --with-png=no --with-bzip2=no \
    --with-brotli=no --with-zlib=yes "${HOST_ARGS[@]}" >/dev/null
  make -j"$JOBS" >/dev/null
  make install >/dev/null
)

echo "== HarfBuzz $HARFBUZZ_VERSION (static, MIT licence)"
(
  cd "$WORK/src/harfbuzz-$HARFBUZZ_VERSION"
  cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$PREFIX" \
    -DCMAKE_PREFIX_PATH="$PREFIX" -DBUILD_SHARED_LIBS=OFF -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
    -DHB_HAVE_FREETYPE=ON -DHB_BUILD_UTILS=OFF -DHB_BUILD_TESTS=OFF \
    -DHB_BUILD_SUBSET=OFF "${CMAKE_ARGS[@]}" >/dev/null
  cmake --build build -j"$JOBS" >/dev/null
  cmake --install build >/dev/null
)

echo "== FFmpeg $FFMPEG_VERSION (LGPL only) for $TRIPLE"
(
  cd "$WORK/src/ffmpeg-$FFMPEG_VERSION"
  PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" ./configure \
    --prefix="$WORK/ffmpeg-out" \
    --disable-gpl --disable-nonfree --disable-debug --disable-doc --disable-ffplay \
    --disable-autodetect --enable-static --disable-shared \
    --enable-zlib --enable-libfreetype --enable-libharfbuzz \
    --pkg-config-flags=--static \
    --extra-cflags="-I$PREFIX/include $EXTRA_CFLAGS" \
    --extra-ldflags="-L$PREFIX/lib $EXTRA_LDFLAGS" \
    --extra-libs="$CXX_RUNTIME" \
    "${CROSS_ARGS[@]}" "${PLATFORM_FLAGS[@]}"
  make -j"$JOBS" >/dev/null
  make install >/dev/null
)

install -m 755 "$WORK/ffmpeg-out/bin/ffmpeg" "$OUT_DIR/dax-ffmpeg-$TRIPLE"
install -m 755 "$WORK/ffmpeg-out/bin/ffprobe" "$OUT_DIR/dax-ffprobe-$TRIPLE"
strip "$OUT_DIR/dax-ffmpeg-$TRIPLE" "$OUT_DIR/dax-ffprobe-$TRIPLE" 2>/dev/null || true
{
  echo "FFmpeg $FFMPEG_VERSION is licensed under the LGPL (version 2.1 or later). Source:"
  echo "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz"
  echo "Built with FreeType $FREETYPE_VERSION (FreeType License), HarfBuzz $HARFBUZZ_VERSION (MIT) and the options printed by 'ffmpeg -version'."
  echo
  cat "$WORK/src/ffmpeg-$FFMPEG_VERSION/COPYING.LGPLv2.1"
} > "$OUT_DIR/FFMPEG-LICENSE.txt"

# Final guard (also run by prepare-sidecars.mjs): a build that ever turns GPL on must not ship.
if grep -aq -e " --enable-gpl" -e " --enable-nonfree" "$OUT_DIR/dax-ffmpeg-$TRIPLE"; then
  echo "FATAL: the built FFmpeg is not LGPL-only" >&2
  exit 1
fi
echo "== done: $OUT_DIR/dax-ffmpeg-$TRIPLE (LGPL-only)"
