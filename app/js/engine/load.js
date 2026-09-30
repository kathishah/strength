// Load arithmetic (spec 5.3, 5.4, 5.12). Pure.

// One increase: from 0 an exercise with a first-loaded weight jumps to it (spec 5.4), otherwise +one increment.
export function increaseLoad(base, cfg) {
  if (base <= 0 && cfg.firstLoadedWeightLbs > 0) return cfg.firstLoadedWeightLbs;
  return base + cfg.incrementLbs;
}
