# HaidarApp - Windows Setup Guide

## Quick Setup for Windows

### Step 1: Install Rust

1. **Download Rust:**
   - Visit: https://www.rust-lang.org/tools/install
   - Click "Download rustup-init.exe"

2. **Install Rust:**
   - Run the downloaded `rustup-init.exe`
   - Press Enter to proceed with default installation
   - Wait for installation to complete

3. **Restart Terminal:**
   - Close your current command prompt/PowerShell
   - Open a new command prompt/PowerShell
   - This is important so the PATH is updated!

4. **Verify Installation:**
   ```bash
   cargo --version
   ```
   You should see something like: `cargo 1.x.x`

### Step 2: Install Node.js

1. **Download Node.js:**
   - Visit: https://nodejs.org/
   - Download the LTS version (recommended)

2. **Install Node.js:**
   - Run the installer
   - Follow the installation wizard
   - Make sure "Add to PATH" is checked

3. **Restart Terminal:**
   - Close and reopen your command prompt

4. **Verify Installation:**
   ```bash
   node --version
   npm --version
   ```

### Step 3: Build HaidarApp

1. **Open Command Prompt:**
   - Navigate to the HaidarApp folder:
   ```bash
   cd path\to\vtracer-master\vtracer-master\HaidarApp
   ```

2. **Run Build Script:**
   ```bash
   build.bat
   ```

   The script will:
   - Check if Rust is installed
   - Install wasm-pack if needed
   - Build the WASM package
   - Install npm dependencies

3. **Wait for Build:**
   - First build can take 5-15 minutes
   - Be patient, it's compiling everything!

### Step 4: Start the Server

```bash
cd app\www
npm start
```

### Step 5: Open in Browser

Open your browser and go to: **http://localhost:8080**

## Common Issues

### "cargo is not recognized"
- Rust is not installed OR terminal wasn't restarted
- Solution: Install Rust, then **restart your terminal**

### "wasm-pack is not recognized"
- The build script will install it automatically
- Or install manually: `cargo install wasm-pack`

### "node is not recognized"
- Node.js is not installed
- Solution: Install Node.js from https://nodejs.org/

### Build fails with errors
- Make sure you restarted terminal after installing Rust
- Try: `rustup update` to update Rust
- Try: `rustup target add wasm32-unknown-unknown`

## Alternative: Using Chocolatey (Package Manager)

If you have Chocolatey installed:

```bash
# Install Rust
choco install rust

# Install Node.js
choco install nodejs-lts

# Restart terminal, then build
cd HaidarApp
build.bat
```

## What to Expect

✅ **First build:** 5-15 minutes (compiling everything)  
✅ **Subsequent builds:** 30 seconds - 2 minutes (only changed files)  
✅ **Server startup:** Instant  
✅ **App loads:** Instant in browser  

## Success!

Once you see:
```
Build complete!
To start the development server:
  cd app\www
  npm start
```

You're ready to go! 🎉


