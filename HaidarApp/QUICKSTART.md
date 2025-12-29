# HaidarApp Quick Start Guide

## What is HaidarApp?

HaidarApp is a complete web-based raster to vector graphics converter with drag-and-drop functionality. It includes **all the same features** as VTracer:

✅ Drag and drop images  
✅ Paste from clipboard  
✅ Binary and Color clustering modes  
✅ Stacked and Cutout hierarchical modes  
✅ Pixel, Polygon, and Spline curve fitting  
✅ All advanced controls (Filter Speckle, Color Precision, Gradient Step, etc.)  
✅ Download as SVG  

## Quick Setup

### Option 1: Using Build Scripts (Recommended)

**Windows:**
```bash
cd HaidarApp
build.bat
cd app\www
npm start
```

**Linux/Mac:**
```bash
cd HaidarApp
chmod +x build.sh
./build.sh
cd app/www
npm start
```

### Option 2: Manual Build

1. **Install wasm-pack** (if not already installed):
```bash
cargo install wasm-pack
```

2. **Build the WASM package**:
```bash
cd HaidarApp/app
wasm-pack build --target web --out-dir www/pkg
```

3. **Install npm dependencies**:
```bash
cd www
npm install
```

4. **Start the development server**:
```bash
npm start
```

5. **Open in browser**: http://localhost:8080

## Usage

1. **Load an image**: 
   - Drag and drop an image file onto the page
   - Click "Select file" to browse
   - Paste from clipboard (Ctrl+V / Cmd+V)

2. **Adjust settings** (all features from VTracer):
   - Choose clustering mode (B/W or Color)
   - Select hierarchical mode (Stacked or Cutout)
   - Pick curve fitting (Pixel, Polygon, or Spline)
   - Fine-tune with sliders

3. **Download**: Click "Download as SVG" when conversion is complete

## Project Structure

```
HaidarApp/
├── app/                    # Rust WASM application
│   ├── src/               # Rust source code
│   │   ├── lib.rs        # Main entry point
│   │   ├── canvas.rs     # Canvas handling
│   │   ├── svg.rs        # SVG generation
│   │   ├── conversion/   # Conversion algorithms
│   │   │   ├── color_image.rs
│   │   │   └── binary_image.rs
│   │   └── ...
│   └── www/              # Web frontend
│       ├── index.html   # Main HTML
│       ├── index.js     # JavaScript logic
│       └── package.json
├── Cargo.toml           # Rust workspace config
└── README.md
```

## Features Included

All VTracer features are preserved:

- **Clustering**: Binary and Color modes
- **Hierarchical**: Stacked and Cutout modes  
- **Curve Fitting**: Pixel, Polygon, Spline
- **Controls**: Filter Speckle, Color Precision, Gradient Step, Corner Threshold, Segment Length, Splice Threshold, Path Precision
- **Input Methods**: Drag & Drop, File Select, Clipboard Paste
- **Output**: SVG download

## Troubleshooting

**Issue**: `wasm-pack` not found
- **Solution**: Install with `cargo install wasm-pack`

**Issue**: npm install fails
- **Solution**: Make sure Node.js is installed (v12+)

**Issue**: Import errors in browser
- **Solution**: Make sure you ran `wasm-pack build` and the `www/pkg` directory exists

## License

MIT OR Apache-2.0


