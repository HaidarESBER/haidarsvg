const path = require('path');

module.exports = {
  entry: "./bootstrap.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bootstrap.js",
    publicPath: '/'
  },
  mode: "development",
  devServer: {
    port: 8080,
    static: {
      directory: path.join(__dirname),
      watch: true
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  resolve: {
    extensions: ['.js', '.wasm', '.mjs'],
    fallback: {
      "fs": false,
      "path": false,
      "crypto": false
    }
  },
  experiments: {
    asyncWebAssembly: true
  }
};

