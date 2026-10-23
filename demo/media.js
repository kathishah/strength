// The exercises that have original art in demo/media/<exercise id>.gif: animated figures drawn for this project (MIT with the
// repository). One list for the demo page and the landing page's phone previews; add an id here together with its file.
// Every other exercise shows the app's built-in placeholder (PLACEHOLDER_GIF). Paths are relative to demo/.

export const DEMO_MEDIA = [
  'back-extension-45',
  'chest-supported-row',
  'db-bench-press',
  'db-romanian-deadlift',
  'face-pull',
  'farmer-carry',
  'goblet-squat',
  'hip-thrust',
  'incline-db-press',
  'lat-pulldown',
  'leg-press',
  'machine-chest-press',
  'machine-high-row',
  'pushup',
  'reverse-lunge',
  'seated-cable-row',
  'seated-db-shoulder-press',
  'trap-bar-deadlift',
];

export const mediaPath = (id) => `media/${id}.gif`;
