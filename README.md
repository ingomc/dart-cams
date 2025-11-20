# Dart Cams 🎯📸

A web-based tool designed for online dart players to easily combine webcam streams with a live scoring board in a single view. Perfect for streaming or just having a better overview during matches.

## Features

- **Dual Camera Support**: Select independent video sources for:
  - **Camera 1**: Dartboard view.
  - **Camera 2**: Player view or Split view.
- **Live Scoring Integration**: Embeds a scoring website (default: 2K Dart Software) directly below the camera feeds.
- **Customizable Layout**:
  - **Vertical Resizing**: Adjust the height ratio between the camera section and the scoring board.
  - **Horizontal Resizing**: Adjust the width ratio between the two camera feeds.
- **Persisted Settings**: (Planned/In-progress) Remembers your selected cameras.
- **Browser-Based**: Runs entirely in the browser using the WebRTC API. No backend required.

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

This project is configured to deploy automatically to **GitHub Pages** via GitHub Actions.

1. Push your changes to the `main` branch.
2. Go to your repository **Settings** > **Pages**.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. The included workflow `.github/workflows/deploy.yml` will handle the build and deployment.

## Usage

1. **Allow Camera Access**: When you first load the page, allow the browser to access your cameras.
2. **Select Cameras**: Use the dropdown menus above each video feed to select the correct input device for your Board and Player cam.
3. **Set Scoring URL**: Enter the URL of your match lobby or scoring board in the input field at the bottom (default is 2K Dart Software).
4. **Adjust Layout**: Drag the gray bars between the cameras or between the cameras and the iframe to customize your view.

## License

MIT
