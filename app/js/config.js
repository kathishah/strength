// Sync settings. Empty on purpose: with any value missing the app runs in local-only mode (boot.js, mode "local"), saving workouts in
// this browser and making no network requests. scripts/deploy-app.sh writes the deployed copy of this file from your stack's outputs
// (docs/SELF-HOSTING.md), so the values below never need editing by hand and never belong in git. None of them are secrets: a Cognito
// app client without a secret and an API URL only work together with a valid login.
export const config = {
  region: '',
  userPoolClientId: '',
  apiUrl: '',
};

export const isConfigured = () =>
  !Object.values(config).some((v) => typeof v !== 'string' || v === '' || v.startsWith('REPLACE_'));
