# HaidarApp

A web-based raster to vector graphics converter with drag-and-drop functionality, built using the same powerful algorithms as VTracer.

## Features

- **Drag and Drop**: Simply drag an image onto the page to convert it
- **Clipboard Support**: Paste images directly from your clipboard
- **Full Feature Set**: All VTracer features included:
  - **Clustering Modes**: 
    - Binary (Black & White)
    - Color (True Color Image)
  - **Hierarchical Modes**:
    - Stacked (shapes on top of each other)
    - Cutout (disjoint shapes)
  - **Curve Fitting**:
    - Pixel (exact boundaries)
    - Polygon (straight lines)
    - Spline (smooth curves)
  - **Advanced Controls**:
    - Filter Speckle
    - Color Precision
    - Gradient Step
    - Corner Threshold
    - Segment Length
    - Splice Threshold
    - Path Precision

## Building

### Prerequisites

- Rust (with wasm32-unknown-unknown target)
- Node.js and npm
- wasm-pack

### Build Steps

1. Install wasm-pack:
```bash
cargo install wasm-pack
```

2. Build the WASM package:
```bash
cd app
wasm-pack build --target web --out-dir www/pkg
```

3. Install npm dependencies:
```bash
cd www
npm install
```

4. Start the development server:
```bash
npm start
```

Or build for production:
```bash
npm run build
```

## Usage

1. Open the app in your browser (default: http://localhost:8080)
2. Drag and drop an image file onto the page, or click "Select file"
3. Adjust the settings as needed
4. Wait for the conversion to complete
5. Click "Download as SVG" to save your vectorized image

## License

MIT OR Apache-2.0


