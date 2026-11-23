#!/bin/bash
# Renders the film in 4 muted video chunks + one audio track, then muxes them. A failed chunk only re-runs itself.
set -e
cd "$(dirname "$0")/.."
export REMOTION_BROWSER=${REMOTION_BROWSER:-$(ls -d /opt/pw-browsers/chromium_headless_shell-1243/*/)chrome-headless-shell}
mkdir -p out/chunks
N=5040; STEP=1260
for i in 0 1 2 3; do
  a=$((i*STEP)); b=$(( (i+1)*STEP - 1 )); [ $b -ge $N ] && b=$((N-1))
  f=out/chunks/c$i.mp4
  [ -s $f ] && continue
  npx remotion render src/index.ts Film $f --frames=$a-$b --muted --concurrency=4 --codec=h264 --crf=17 --jpeg-quality=92 --timeout=120000
done
[ -s out/chunks/audio.aac ] || npx remotion render src/index.ts Film out/chunks/audio.aac --codec=aac
printf "file 'c0.mp4'\nfile 'c1.mp4'\nfile 'c2.mp4'\nfile 'c3.mp4'\n" > out/chunks/list.txt
ffmpeg -loglevel error -y -f concat -safe 0 -i out/chunks/list.txt -i out/chunks/audio.aac -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest out/film-v2-raw.mp4
echo built out/film-v2-raw.mp4
