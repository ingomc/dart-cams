# Changelog

## [Unreleased]

### Added
- Created shared types definition file `src/lib/types.ts`.
- Created shared constants file `src/lib/constants.ts`.
- Created utility functions file `src/lib/utils.ts`.
- New reusable components:
  - `Scoreboard.svelte`: Displays match information and scores.
  - `CameraView.svelte`: Handles individual camera streams, overlays, and controls.
  - `SettingsModal.svelte`: Manages camera settings (transform, color, mask).
  - `IframeSection.svelte`: Encapsulates the iframe and its controls.

### Changed
- Refactored `src/routes/+page.svelte` to use the new component structure, significantly reducing file size and improving maintainability.
- Updated drag-and-drop logic for scoreboards to use direct element references instead of DOM querying, fixing issues with Camera 1.

### Fixed
- Restored visibility of the "arrow down" toggle button in camera controls by fixing CSS positioning.
- Fixed drag-and-drop functionality for the scoreboard on the first camera view.
