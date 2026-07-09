# HaidarApp

A browser-based **raster → vector** pipeline built on the VTracer tracing engine
(Rust → WebAssembly), with drag-and-drop input, in-browser AI background removal,
manual retouch, high-quality upscaling, and SVG export. Includes a bulk page for
batch processing.

## Features

- **Input**: drag & drop, file picker, or clipboard paste (Ctrl/Cmd+V)
- **AI background removal** via `@imgly/background-removal` (ONNX Runtime Web,
  `isnet_fp16` model), with a low-alpha residue cleanup pass
- **Manual retouch** (brush-based remove/restore) to refine the cutout
- **Upscale** (2× / 4×) using high-quality canvas interpolation
  *(a resolution resize — not an ML super-resolution model)*
- **Vectorization** (WASM) with the full VTracer feature set:
  - Clustering: Binary (B/W) or Color
  - Hierarchical: Stacked or Cutout
  - Curve fitting: Pixel, Polygon, or Spline
  - Controls: Filter Speckle, Color Precision, Gradient Step, Corner Threshold,
    Segment Length, Splice Threshold, Path Precision
- **Export**: SVG (plus PNG / no-background raster from the UI)
- **Bulk page** (`bulk.html`): process up to 50 images and download a ZIP

## Quickstart

Prerequisites: Rust (with the `wasm32-unknown-unknown` target), `wasm-pack`, and
Node.js + npm. See [INSTALL.md](INSTALL.md) for detailed setup and troubleshooting.

```bash
# From the HaidarApp/ directory
./build.sh              # builds the WASM package and installs npm deps
cd app/www
npm start
```

Then open <http://localhost:8080>. The bulk page is at `bulk.html`.

To build the WASM package manually instead of using `build.sh`:

```bash
cd app
wasm-pack build --target web --out-dir www/pkg
cd www && npm install && npm start
```

Production build: `npm run build` (from `app/www`).

## Usage

1. Load an image (drag & drop, **Select file**, or paste).
2. Optionally **Remove Background**, then **retouch** the result.
3. Optionally **Upscale** (2× / 4×) for more detail before tracing.
4. Adjust vectorization settings (clustering, hierarchical, curve fitting, sliders).
5. **Convert**, then **Download as SVG** (or export PNG / no-bg).

## Project structure

```
HaidarApp/
├── app/
│   ├── src/                # Rust source (compiled to WASM)
│   │   ├── lib.rs
│   │   ├── canvas.rs
│   │   ├── svg.rs
│   │   └── conversion/     # color_image.rs, binary_image.rs, ...
│   └── www/                # Web frontend
│       ├── index.html      # single-image UI
│       ├── index.js
│       ├── bulk.html       # batch UI
│       ├── bulk.js
│       ├── toast.js        # notification helper
│       └── package.json
├── build.sh
└── README.md
```

## License

MIT OR Apache-2.0. See the `LICENSE-MIT` and `LICENSE-APACHE` files at the
repository root.
