#!/bin/bash

echo "Building HaidarApp..."

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null
then
    echo "wasm-pack is not installed. Installing..."
    cargo install wasm-pack
fi

# Build WASM package
echo "Building WASM package..."
cd app
wasm-pack build --target web --out-dir www/pkg

# Install npm dependencies
echo "Installing npm dependencies..."
cd www
npm install

echo "Build complete!"
echo "To start the development server, run: cd app/www && npm start"


