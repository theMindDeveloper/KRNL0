#!/bin/bash
# Renders the film in 4 muted video chunks + one audio track, then muxes them. A failed chunk only re-runs itself.
set -e
cd "$(dirname "$0")/.."
export REMOTION_BROWSER=${REMOTION_BROWSER:-$(ls -d /opt/pw-browsers/chromium_headless_shell-1243/*/)chrome-headless-shell}
mkdir -p out/chunks
N=5040; STEP=420
# Small pieces (14 s) so a container restart loses at most one piece. c1.mp4 (frames 1260-2519) is an older finished block, reused if present.
LIST=""
for i in $(seq 0 11); do
  a=$((i*STEP)); b=$(( (i+1)*STEP - 1 ))
  if [ -s out/chunks/c1.mp4 ] && [ $a -ge 1260 ] && [ $a -lt 2520 ]; then
    [ $a -eq 1260 ] && LIST="$LIST
file 'c1.mp4'"
    continue
  fi
  f=out/chunks/p$(printf %02d $i).mp4
  LIST="$LIST
file '$(basename $f)'"
  [ -s $f ] && continue
  npx remotion render src/index.ts Film $f.tmp.mp4 --frames=$a-$b --muted --concurrency=4 --codec=h264 --crf=17 --jpeg-quality=92 --timeout=120000 && mv $f.tmp.mp4 $f
done
[ -s out/chunks/audio.aac ] || npx remotion render src/index.ts Film out/chunks/audio.aac --codec=aac
echo "$LIST" | sed '/^$/d' > out/chunks/list.txt
ffmpeg -loglevel error -y -f concat -safe 0 -i out/chunks/list.txt -i out/chunks/audio.aac -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest out/film-v2-raw.mp4
echo built out/film-v2-raw.mp4
