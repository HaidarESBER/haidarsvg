# HaidarApp - Installation Guide

## Prerequisites

Before building HaidarApp, you need to install the following:

### 1. Rust and Cargo

**Windows:**
1. Visit https://www.rust-lang.org/tools/install
2. Download and run `rustup-init.exe`
3. Follow the installation wizard
4. **Important**: Restart your terminal/command prompt after installation
5. Verify installation by running: `cargo --version`

**Alternative (using Chocolatey):**
```bash
choco install rust
```

### 2. Node.js and npm

1. Visit https://nodejs.org/
2. Download the LTS version (recommended)
3. Run the installer
4. Verify installation:
   ```bash
   node --version
   npm --version
   ```

**Alternative (using Chocolatey):**
```bash
choco install nodejs-lts
```

### 3. wasm-pack (will be installed automatically)

The build script will automatically install `wasm-pack` if it's not already installed. However, you can also install it manually:

```bash
cargo install wasm-pack
```

## Installation Steps

### Step 1: Install Prerequisites

Make sure you have:
- ✅ Rust/Cargo installed
- ✅ Node.js and npm installed

### Step 2: Build the Project

**Windows:**
```bash
cd HaidarApp
build.bat
```

**Linux/Mac:**
```bash
cd HaidarApp
chmod +x build.sh
./build.sh
```

### Step 3: Start the Development Server

```bash
cd app/www
npm start
```

### Step 4: Open in Browser

Navigate to: http://localhost:8080

## Troubleshooting

### Error: 'cargo' is not recognized

**Solution:** Rust is not installed or not in PATH
1. Install Rust from https://www.rust-lang.org/tools/install
2. Restart your terminal after installation
3. Verify with: `cargo --version`

### Error: 'wasm-pack' is not recognized

**Solution:** The build script will install it automatically, or install manually:
```bash
cargo install wasm-pack
```

### Error: 'node' is not recognized

**Solution:** Node.js is not installed
1. Install from https://nodejs.org/
2. Restart your terminal
3. Verify with: `node --version`

### Error: npm install fails

**Solutions:**
1. Make sure Node.js is installed
2. Try clearing npm cache: `npm cache clean --force`
3. Delete `node_modules` folder and `package-lock.json`, then run `npm install` again

### Error: wasm-pack build fails

**Solutions:**
1. Make sure Rust is up to date: `rustup update`
2. Install the wasm32 target: `rustup target add wasm32-unknown-unknown`
3. Try building manually: `cd app && wasm-pack build --target web --out-dir www/pkg`

### Build takes a long time

**This is normal!** The first build can take 5-15 minutes because:
- Rust needs to compile all dependencies
- wasm-pack needs to compile to WebAssembly
- Subsequent builds will be much faster (only changed files are recompiled)

## Manual Build (if scripts don't work)

1. **Install wasm-pack:**
   ```bash
   cargo install wasm-pack
   ```

2. **Build WASM package:**
   ```bash
   cd HaidarApp/app
   wasm-pack build --target web --out-dir www/pkg
   ```

3. **Install npm dependencies:**
   ```bash
   cd www
   npm install
   ```

4. **Start server:**
   ```bash
   npm start
   ```

## Need Help?

If you encounter issues:
1. Make sure all prerequisites are installed
2. Restart your terminal after installing Rust/Node.js
3. Check that you're in the correct directory
4. Try the manual build steps above


