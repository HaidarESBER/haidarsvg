# HaidarApp — Installation & Troubleshooting

## Prerequisites

### 1. Rust and Cargo

- Install from <https://www.rust-lang.org/tools/install> (on Windows, run
  `rustup-init.exe`).
- **Restart your terminal** afterwards so `PATH` is updated.
- Verify: `cargo --version`
- Add the WebAssembly target: `rustup target add wasm32-unknown-unknown`

### 2. Node.js and npm

- Install the LTS release from <https://nodejs.org/>.
- Verify: `node --version` and `npm --version`

### 3. wasm-pack

`build.sh` installs it automatically if missing, or install it manually:

```bash
cargo install wasm-pack
```

## Build

From the `HaidarApp/` directory:

```bash
./build.sh          # Linux/macOS (chmod +x build.sh first if needed)
```

`build.sh` installs `wasm-pack` if missing, builds the WASM package into
`app/www/pkg`, and runs `npm install`.

On Windows (Git Bash / WSL) you can run `./build.sh` as well, or perform the
steps manually:

```bash
cd app
wasm-pack build --target web --out-dir www/pkg
cd www
npm install
```

Then start the dev server:

```bash
cd app/www
npm start
```

Open <http://localhost:8080>.

> **Note:** the first build can take 5–15 minutes because Rust compiles all
> dependencies to WebAssembly. Subsequent builds are much faster.

## Troubleshooting

**`cargo` / `node` / `wasm-pack` not recognized**
Not installed, or the terminal wasn't restarted after installing. Reinstall and
open a fresh terminal so `PATH` picks it up.

**`wasm-pack build` fails**
Update Rust (`rustup update`) and make sure the target is installed
(`rustup target add wasm32-unknown-unknown`).

**`npm install` fails**
Ensure Node.js is installed, clear the cache (`npm cache clean --force`), then
delete `node_modules` and `package-lock.json` and reinstall.

**`Module not found: Can't resolve 'haidar_app'`**
The WASM package hasn't been built or `app/www/pkg/` is missing. Run
`wasm-pack build --target web --out-dir www/pkg` from `app/`. `index.js` imports
the module by relative path (`./pkg/haidar_app.js`), so `app/www/pkg/` must exist
and contain `haidar_app.js` and `haidar_app_bg.wasm`.
