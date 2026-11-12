// Where the page reads data and starts workflows. Client data lives ONLY in the private repo;
// the page reads it through the GitHub API with your token, never from this public site.
window.BUILDER_CONFIG = {
  // TEMPORARY (2026-11-13): runs from PJ's personal account until LFMP-Rockstars Actions billing is fixed.
  // Moving back = change this to 'LFMP-Rockstars/ghl-subaccount-builder' (see HANDOFF.md "Move back").
  repo: 'peejayedz/ghl-subaccount-builder',
  branch: 'main',
  api: 'https://api.github.com',
};
