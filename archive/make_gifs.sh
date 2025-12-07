#!/usr/bin/env bash
set -euo pipefail

FRAMES_DIR="frames"
GIFS_DIR="gifs"

# Check for ImageMagick's convert
if ! command -v convert >/dev/null 2>&1; then
  echo "Error: ImageMagick 'convert' command not found."
  echo "Install it on macOS with:  brew install imagemagick"
  exit 1
fi

# Ensure directories exist
if [ ! -d "$FRAMES_DIR" ]; then
  echo "Error: '$FRAMES_DIR' directory not found. Create it and add exercise subfolders."
  exit 1
fi

mkdir -p "$GIFS_DIR"

echo "Generating GIFs from PNG frames..."
echo

# Loop through each exercise folder in frames/
shopt -s nullglob
for exercise_dir in "$FRAMES_DIR"/*/; do
  slug=$(basename "$exercise_dir")

  # Collect frames for this exercise
  frames=( "$exercise_dir"*.png "$exercise_dir"*.jpg "$exercise_dir"*.jpeg )
  if [ ${#frames[@]} -eq 0 ]; then
    echo "Skipping '$slug' (no PNG/JPG frames found)."
    continue
  fi

  # Sort frames by name
  IFS=$'\n' frames_sorted=($(printf '%s\n' "${frames[@]}" | sort))
  unset IFS

  output_gif="$GIFS_DIR/$slug.gif"

  echo "→ Creating GIF for '$slug' (${#frames_sorted[@]} frames) → $output_gif"

  # -delay 10 = ~0.1s per frame (adjust to taste)
  # -loop 0 = loop forever
  convert -delay 10 -loop 0 "${frames_sorted[@]}" "$output_gif"
done
shopt -u nullglob

echo
echo "Done. GIFs are in the '$GIFS_DIR' directory."
