<div align="center">

  <img src="docs/images/visioncortex-banner.png">
  <h1>HaidarApp</h1>

  <p>
    <strong>Browser-first raster → vector pipeline (background removal + retouch + upscale + SVG vectorization + bulk)</strong>
  </p>

  <sub>Created by Haidar Esber (Lebanese software developer living in France)</sub>
</div>

## Introduction

HaidarApp is a **browser-first raster → vector pipeline**: take a raster image (PNG/JPG/WEBP), optionally **remove the background using an in-browser AI model**, **retouch** the result, optionally **upscale**, then **vectorize to SVG** using a Rust→WebAssembly vectorization engine.

It contains:

- A **custom web UI**: `HaidarApp/` (single image + bulk processing)
- A simpler **demo webapp**: `webapp/`
- A **CLI app**: `cmdapp/` (command-line raster → SVG conversion)

## What the site does (from the code)

### Single-image workflow (HaidarApp)

The `HaidarApp/app/www/` UI implements an interactive pipeline:

- **Load image** via drag & drop / file picker (renders to an HTML canvas)
- **AI background removal** using `@imgly/background-removal` running in the browser (ONNX Runtime Web), configured with `model: 'isnet_fp16'`
  - Includes a cleanup pass to remove low-alpha “invisible residue”
- **Manual retouching** tools (brush size + remove/restore modes) to refine the result before exporting
- **Upscale** options (2× / 4×) to improve detail before tracing
- **Vectorize to SVG** via WebAssembly:
  - **Color mode** uses incremental clustering + vectorization and outputs many filled paths using each cluster’s color
  - **B/W mode** thresholds to a binary image and traces filled black shapes
  - Special handling to preserve transparency by using a “key color” that is discarded from the final SVG
- **Export** as SVG (and additional raster exports in the UI such as PNG / “no-bg” image)

### Bulk workflow (HaidarApp)

The `HaidarApp/app/www/bulk.html` + `bulk.js` page processes up to 50 images and produces a downloadable ZIP:

1. Load image
2. Upscale (2×) + optional sharpening
3. Remove background (same in-browser AI model)
4. Vectorize to SVG (WASM converter)
5. Convert the result to JPEG (SVG-first, with canvas fallback)
6. Bundle outputs into a ZIP for download

### Core vectorization engine (Rust → WASM)

The WebAssembly module (Rust) exposes `ColorImageConverter` and `BinaryImageConverter` and writes SVG `<path>` elements into a target `<svg>` element. The key algorithmic knobs surfaced through the UI/params include:

- `filter_speckle`, `color_precision`, `layer_difference`
- `corner_threshold`, `length_threshold`, `splice_threshold`
- curve fitting mode: pixel/polygon/spline
- hierarchical mode: stacked/cutout (color mode)

The underlying vectorization approach supports both **B/W tracing** and **true-color vectorization**, exposing key tuning parameters (speckle filtering, color precision, curve fitting, stacked/cutout behavior) through the UI.

## Web App

The web app runs fully client-side: JavaScript UI + WebAssembly vectorization + optional in-browser AI background removal.

## Quickstart (HaidarApp)

Prereqs: Rust + `wasm-pack`, Node.js + npm.

```bash
cd HaidarApp/app
wasm-pack build --target web --out-dir www/pkg

cd www
npm install
npm start
```

Then open `http://localhost:8080`. The bulk page is available at `bulk.html`.


## Cmd App

```sh
Haidar Vectorizer (based on VTracer) 0.6.5
Raster-to-vector (SVG) converter.

USAGE:
    vtracer [OPTIONS] --input <input> --output <output>

FLAGS:
    -h, --help       Prints help information
    -V, --version    Prints version information

OPTIONS:
        --colormode <color_mode>                 True color image `color` (default) or Binary image `bw`
    -p, --color_precision <color_precision>      Number of significant bits to use in an RGB channel
    -c, --corner_threshold <corner_threshold>    Minimum momentary angle (degree) to be considered a corner
    -f, --filter_speckle <filter_speckle>        Discard patches smaller than X px in size
    -g, --gradient_step <gradient_step>          Color difference between gradient layers
        --hierarchical <hierarchical>
            Hierarchical clustering `stacked` (default) or non-stacked `cutout`. Only applies to color mode.

    -i, --input <input>                          Path to input raster image
    -m, --mode <mode>                            Curver fitting mode `pixel`, `polygon`, `spline`
    -o, --output <output>                        Path to output vector graphics
        --path_precision <path_precision>        Number of decimal places to use in path string
        --preset <preset>                        Use one of the preset configs `bw`, `poster`, `photo`
    -l, --segment_length <segment_length>
            Perform iterative subdivide smooth until all segments are shorter than this length

    -s, --splice_threshold <splice_threshold>    Minimum angle displacement (degree) to splice a spline
```

## Credits (libraries & tooling)

This repo stands on excellent open-source work:

- **visioncortex / VTracer lineage**: the Rust tracing + clustering foundation used by the vectorization engine  
  - https://github.com/visioncortex/vtracer  
  - https://github.com/visioncortex/visioncortex
- **Rust WASM bindings**: `wasm-bindgen` + `web-sys` for exposing Rust converters to the browser
- **In-browser background removal**: `@imgly/background-removal` (uses `onnxruntime-web` under the hood)
- **ZIP bundling (bulk exports)**: `jszip`
- **Bundling/dev server**: `webpack` / `webpack-dev-server`

## Licensing

See `LICENSE`, `LICENSE-MIT`, and `LICENSE-APACHE` files in this repository and subprojects. Third-party dependencies retain their respective licenses.


