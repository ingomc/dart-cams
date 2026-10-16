# Dart Cams 🎯📸

A web-based tool designed for online dart players to easily combine webcam streams with a live scoring board in a single view. Perfect for streaming or just having a better overview during matches.

## Features

- **Dual Camera Support**: Select independent video sources for:
  - **Camera 1**: Dartboard view.
  - **Camera 2**: Player view or Split view.
- **Live Scoring Integration**: Compact 3K scores on each board, with an optional live view below the cameras. Fülltreffer automatically supplies the current or next SCO fixture; Dartstory supplies the team logos.
- **Customizable Layout**:
  - **Vertical Resizing**: Adjust the height ratio between the camera section and the scoring board.
  - **Horizontal Resizing**: Adjust the width ratio between the two camera feeds.
- **Persisted Settings**: Remembers camera sources, labels, board assignments and separate image profiles for each layout.
- **Browser-Based**: Static SvelteKit app using browser cameras or DartRectify. Automatic fixture selection uses the public Fülltreffer API; scores come directly from 3K.

## Tech Stack

- **Framework**: [SvelteKit](https://kit.svelte.dev/)
- **Runtime/Package Manager**: [Bun](https://bun.sh/)
- **Deployment**: GitHub Pages (Static Adapter)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed on your machine.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/dart-cams.git
   cd dart-cams
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

### Development

Start the development server:

```bash
bun run dev
```

Open your browser and navigate to `http://localhost:5173`.

### Automatic scoring configuration

The default context endpoint is `https://darts.sc-oberfuellbach.de/api/dartcams/context`.
The matching Fülltreffer backend change must be deployed first. For local integration, run that project and point Dartcams to it:

```bash
VITE_DARTCAMS_CONTEXT_URL=http://localhost:4000/api/dartcams/context bun run dev
```

This optional URL is a public build-time setting, not a secret. The API selects the current/next fixture for the team and season configured in Fülltreffer. Logos stay in Dartstory and are matched by 3K participant ID. No duplicate team setup is needed in Dartcams.

### Building for Production

To create a production build:

```bash
bun run build
```

You can preview the production build with:

```bash
bun run preview
```

## Deployment

Owncast holding images, the custom end-of-stream clip and setup instructions are maintained in [docs/owncast](docs/owncast/README.md).

This project is configured to deploy automatically to **GitHub Pages** via GitHub Actions.

1. Push your changes to the `main` branch.
2. Go to your repository **Settings** > **Pages**.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. The included workflow `.github/workflows/deploy.yml` will handle the build and deployment.

## Usage

1. **Allow Camera Access**: When you first load the page, allow the browser to access your cameras.
2. **Select Cameras**: Open the gear beside the lower Heim/Gast label to select a source, board or image settings.
3. **Live Scoring**: The current or next SCO match is selected automatically on startup. Available boards are assigned to unconfigured camera slots as they arrive. Saved board assignments, including explicitly disabled overlays, stay unchanged. In Settings → Live-Scoring, refresh the selection or disable automatic selection to enter another 3K link. During a session the selected fixture stays fixed, including its final result; before live data is available, the app shows a waiting status.
4. **Adjust Layout**: Drag the gray bars between the cameras or between the cameras and the iframe to customize your view.

If automatic selection is unavailable, the last cached fixture (or previously connected event) remains usable with a visible notice in Live-Scoring settings. Missing logos fall back to the existing camera labels. Automatic-mode preference and cached context use `dartScoringAutomatic` and `dartScoringAutoContext`; the existing event and board storage keys remain in use.

## License

MIT
