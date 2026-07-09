import init, { ColorImageConverter } from './pkg/haidar_app.js';
import { removeBackground as rembgRemove } from '@imgly/background-removal';
import JSZip from 'jszip';
import { showToast } from './toast.js';
// Set to true to enable verbose debug logging in the console.
const DEBUG = false;
const debugLog = (...args) => { if (DEBUG) console.log(...args); };

// Global state
let files = [];
let wasmInitialized = false;
let isProcessing = false;
const processedJPEGs = new Map(); // filename -> jpeg blob

// DOM elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const filesList = document.getElementById('filesList');
const controls = document.getElementById('controls');
const processBtn = document.getElementById('processBtn');
const clearBtn = document.getElementById('clearBtn');
const summary = document.getElementById('summary');
const summaryText = document.getElementById('summaryText');
const downloadBtn = document.getElementById('downloadBtn');

// Initialize WASM
async function initWasm() {
    if (wasmInitialized) return;
    try {
        await init();
        wasmInitialized = true;
        debugLog('✅ WASM initialized');
    } catch (error) {
        console.error('❌ WASM initialization failed:', error);
        showToast('Failed to initialize WASM module');
    }
}

// Initialize on load
initWasm();

// Drop zone events
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(Array.from(e.dataTransfer.files));
});

fileInput.addEventListener('change', (e) => {
    handleFiles(Array.from(e.target.files));
});

// Handle file selection
function handleFiles(newFiles) {
    const imageFiles = newFiles.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
        showToast('Please select image files');
        return;
    }

    if (imageFiles.length > 50) {
        showToast('Maximum 50 images allowed');
        return;
    }

    files = imageFiles;
    renderFilesList();
    controls.style.display = 'flex';
    summary.style.display = 'none';
}

// Render files list
function renderFilesList() {
    if (files.length === 0) {
        filesList.style.display = 'none';
        return;
    }

    filesList.style.display = 'block';
    filesList.innerHTML = files.map((file, index) => `
        <div class="file-item" id="file-${index}">
            <div class="file-header">
                <span class="file-name">${file.name}</span>
                <span class="file-status status-pending" id="status-${index}">Pending</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" id="progress-${index}"></div>
            </div>
            <div class="progress-text" id="progress-text-${index}">Waiting...</div>
        </div>
    `).join('');
}

// Update file status
function updateFileStatus(index, status, progressPercent, progressText) {
    const statusEl = document.getElementById(`status-${index}`);
    const progressFill = document.getElementById(`progress-${index}`);
    const progressTextEl = document.getElementById(`progress-text-${index}`);

    if (statusEl) {
        statusEl.className = `file-status status-${status}`;
        statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }

    if (progressFill) {
        progressFill.style.width = `${progressPercent}%`;
    }

    if (progressTextEl) {
        progressTextEl.textContent = progressText;
    }
}

// Process button
processBtn.addEventListener('click', async () => {
    if (isProcessing || files.length === 0) return;

    isProcessing = true;
    processBtn.disabled = true;
    clearBtn.disabled = true;
    processedJPEGs.clear();

    try {
        for (let i = 0; i < files.length; i++) {
            await processFile(files[i], i);
        }

        // Show summary
        const successCount = processedJPEGs.size;
        summaryText.textContent = `${successCount} of ${files.length} images processed successfully`;
        summary.style.display = 'block';

    } catch (error) {
        console.error('Processing error:', error);
        showToast('Processing failed: ' + error.message);
    } finally {
        isProcessing = false;
        processBtn.disabled = false;
        clearBtn.disabled = false;
    }
});

// Process single file through the pipeline
async function processFile(file, index) {
    const filename = file.name.replace(/\.[^/.]+$/, ''); // Remove extension

    try {
        updateFileStatus(index, 'processing', 0, 'Loading image...');

        // Step 1: Load image
        const img = await loadImage(file);
        updateFileStatus(index, 'processing', 10, 'Image loaded');

        // Step 2: Upscale 2x
        updateFileStatus(index, 'processing', 20, 'Upscaling 2x...');
        const upscaled = await upscaleImage(img, 2);
        updateFileStatus(index, 'processing', 35, 'Upscaled');

        // Step 3: Remove background
        updateFileStatus(index, 'processing', 45, 'Removing background...');
        const noBg = await removeBackground(upscaled);
        updateFileStatus(index, 'processing', 60, 'Background removed');

        // Step 4: Vectorize
        updateFileStatus(index, 'processing', 70, 'Vectorizing...');
        const { svg, canvas: vecCanvas } = await vectorize(noBg);
        updateFileStatus(index, 'processing', 85, 'Vectorized');

        // Step 5: Convert to JPEG (try SVG first, fallback to canvas)
        updateFileStatus(index, 'processing', 90, 'Converting to JPEG...');
        let jpeg;
        try {
            if (!svg || svg.length < 100) {
                throw new Error('SVG is empty or too small');
            }
            jpeg = await svgToJpeg(svg, noBg.width, noBg.height);
            debugLog('✓ SVG to JPEG successful');
        } catch (svgError) {
            console.warn('⚠ SVG to JPEG failed, using canvas fallback:', svgError.message);
            // Fallback: export canvas directly as JPEG
            jpeg = await canvasToJpeg(vecCanvas || noBg);
            debugLog('✓ Canvas to JPEG fallback successful');
        }

        // Cleanup temp canvas
        if (vecCanvas && vecCanvas.parentNode) {
            document.body.removeChild(vecCanvas);
        }

        updateFileStatus(index, 'processing', 95, 'Converted to JPEG');

        // Store result
        processedJPEGs.set(`${filename}.jpg`, jpeg);

        updateFileStatus(index, 'complete', 100, '✓ Complete');

    } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        updateFileStatus(index, 'error', 0, `Error: ${error.message}`);
    }
}

// Load image from file
function loadImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// Upscale image by factor
async function upscaleImage(img, factor) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    canvas.width = img.width * factor;
    canvas.height = img.height * factor;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Apply sharpening
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const sharpened = sharpenImage(imageData);
    ctx.putImageData(sharpened, 0, 0);

    return canvas;
}

// Sharpen filter
function sharpenImage(imageData) {
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const output = new Uint8ClampedArray(pixels);

    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                        const kernelIdx = (ky + 1) * 3 + (kx + 1);
                        sum += pixels[idx] * kernel[kernelIdx];
                    }
                }
                const idx = (y * width + x) * 4 + c;
                output[idx] = Math.max(0, Math.min(255, sum));
            }
        }
    }

    return new ImageData(output, width, height);
}

// Remove background
async function removeBackground(canvas) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

    const resultBlob = await rembgRemove(blob, {
        model: 'isnet_fp16',
        output: { format: 'image/png' }
    });

    const img = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load background-removed image'));
        img.src = URL.createObjectURL(resultBlob);
    });

    const resultCanvas = document.createElement('canvas');
    const ctx = resultCanvas.getContext('2d');
    resultCanvas.width = img.width;
    resultCanvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Clean up invisible residue
    const imageData = ctx.getImageData(0, 0, resultCanvas.width, resultCanvas.height);
    const data = imageData.data;
    const alphaThreshold = 20;

    for (let i = 3; i < data.length; i += 4) {
        if (data[i] < alphaThreshold) {
            data[i] = 0;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return resultCanvas;
}

// Vectorize canvas to SVG
async function vectorize(canvas) {
    if (!wasmInitialized) {
        await initWasm();
    }

    // Create temporary canvas for WASM
    const tempCanvas = document.createElement('canvas');
    tempCanvas.id = 'temp-canvas-' + Date.now();
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    document.body.appendChild(tempCanvas);

    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0);

    // Create temporary SVG element
    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tempSvg.id = 'temp-svg-' + Date.now();
    tempSvg.setAttribute('width', canvas.width);
    tempSvg.setAttribute('height', canvas.height);
    document.body.appendChild(tempSvg);

    // Vectorize
    const params = {
        canvas_id: tempCanvas.id,
        svg_id: tempSvg.id,
        mode: 'spline',
        hierarchical: 'stacked',
        corner_threshold: (180 / 180) * Math.PI,
        length_threshold: 4.0,
        max_iterations: 10,
        splice_threshold: (45 / 180) * Math.PI,
        filter_speckle: 4,
        color_precision: 0, // 8-8
        layer_difference: 8,
        path_precision: 2
    };

    const converter = ColorImageConverter.new_with_string(JSON.stringify(params));
    converter.init();

    while (!converter.tick()) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Get SVG content
    const svgContent = tempSvg.outerHTML;

    debugLog('Vectorization complete. SVG length:', svgContent.length);
    debugLog('SVG preview:', svgContent.substring(0, 300));

    // Keep canvas for fallback, cleanup SVG
    document.body.removeChild(tempSvg);

    return { svg: svgContent, canvas: tempCanvas };
}

// Fallback: Convert canvas directly to JPEG
async function canvasToJpeg(canvas) {
    return new Promise((resolve, reject) => {
        try {
            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = canvas.width;
            outputCanvas.height = canvas.height;

            const ctx = outputCanvas.getContext('2d');

            // White background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

            // Draw canvas content
            ctx.drawImage(canvas, 0, 0);

            outputCanvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create JPEG from canvas'));
                }
            }, 'image/jpeg', 0.95);
        } catch (error) {
            reject(error);
        }
    });
}

// Convert SVG to JPEG
async function svgToJpeg(svgContent, width, height) {
    return new Promise((resolve, reject) => {
        try {
            // Parse and fix SVG content
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
            const svgElement = svgDoc.documentElement;

            // Ensure SVG has proper attributes
            if (!svgElement.hasAttribute('width')) {
                svgElement.setAttribute('width', width);
            }
            if (!svgElement.hasAttribute('height')) {
                svgElement.setAttribute('height', height);
            }
            if (!svgElement.hasAttribute('viewBox')) {
                svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
            }

            // Serialize back to string
            const serializer = new XMLSerializer();
            const fixedSvg = serializer.serializeToString(svgElement);

            // Create blob with proper encoding
            const blob = new Blob([fixedSvg], {
                type: 'image/svg+xml;charset=utf-8'
            });
            const url = URL.createObjectURL(blob);

            const img = new Image();

            // Add timeout to prevent hanging
            const timeout = setTimeout(() => {
                URL.revokeObjectURL(url);
                reject(new Error('SVG load timeout'));
            }, 10000);

            img.onload = () => {
                clearTimeout(timeout);

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');

                // White background
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, width, height);

                // Draw SVG
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((jpegBlob) => {
                    URL.revokeObjectURL(url);
                    if (jpegBlob) {
                        resolve(jpegBlob);
                    } else {
                        reject(new Error('Failed to create JPEG blob'));
                    }
                }, 'image/jpeg', 0.95);
            };

            img.onerror = (error) => {
                clearTimeout(timeout);
                URL.revokeObjectURL(url);
                console.error('SVG render error:', error);
                console.error('SVG content preview:', fixedSvg.substring(0, 500));
                reject(new Error('Failed to render SVG - check console for details'));
            };

            img.src = url;

        } catch (error) {
            console.error('SVG processing error:', error);
            reject(new Error('Failed to process SVG: ' + error.message));
        }
    });
}

// Download ZIP
downloadBtn.addEventListener('click', async () => {
    if (processedJPEGs.size === 0) return;

    downloadBtn.disabled = true;
    downloadBtn.innerHTML = '<div class="loading"></div><span>Creating ZIP...</span>';

    try {
        const zip = new JSZip();
        const folder = zip.folder('converted_images');

        for (const [filename, blob] of processedJPEGs.entries()) {
            folder.file(filename, blob);
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);

        const a = document.createElement('a');
        a.href = url;
        a.download = `bulk_converted_${Date.now()}.zip`;
        a.click();

        URL.revokeObjectURL(url);

    } catch (error) {
        console.error('ZIP creation error:', error);
        showToast('Failed to create ZIP file');
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '<span>💾</span><span>Download ZIP</span>';
    }
});

// Clear all
clearBtn.addEventListener('click', () => {
    if (isProcessing) return;

    files = [];
    processedJPEGs.clear();
    filesList.style.display = 'none';
    controls.style.display = 'none';
    summary.style.display = 'none';
    fileInput.value = '';
});
