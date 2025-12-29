import init, { BinaryImageConverter, ColorImageConverter } from './pkg/haidar_app.js';
import { removeBackground as rembgRemove } from '@imgly/background-removal';
import JSZip from 'jszip';

let runner;
const canvas = document.getElementById('frame');
// Use willReadFrequently for better performance with multiple getImageData calls during conversion
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const svg = document.getElementById('svg');
const img = new Image();
const progress = document.getElementById('progressbar');
const progressregion = document.getElementById('progressregion');
let mode = 'spline', clustering_mode = 'color', clustering_hierarchical = 'stacked';
let wasmInitialized = false;
let bgRemoved = false;
// Make it globally accessible
window.bgRemoved = false;

// Default settings for no-background images
const defaultNoBgSettings = {
    filter_speckle: 2,
    color_precision: 7,
    layer_difference: 12,
    corner_threshold: 60,
    length_threshold: 4,
    splice_threshold: 45
};

// Hide canvas and svg on load
const previewContainer = document.getElementById('preview-container');
const droptext = document.getElementById('droptext');
const convertBtn = document.getElementById('convert-btn');
const downloadBtn = document.getElementById('export');
const downloadPngBtn = document.getElementById('export-png');
const downloadNoBgBtn = document.getElementById('download-nobg');
const retouchBtn = document.getElementById('retouch-btn');
const retouchControls = document.getElementById('retouch-controls');
const brushSizeSlider = document.getElementById('brush-size');
const brushSizeValue = document.getElementById('brush-size-value');
const retouchRemoveBtn = document.getElementById('retouch-remove');
const retouchRestoreBtn = document.getElementById('retouch-restore');
const retouchDoneBtn = document.getElementById('retouch-done');

// Debug: Check if elements exist
console.log('Retouch elements:', {
    retouchBtn: !!retouchBtn,
    retouchControls: !!retouchControls,
    downloadNoBgBtn: !!downloadNoBgBtn,
    retouchRemoveBtn: !!retouchRemoveBtn,
    retouchRestoreBtn: !!retouchRestoreBtn,
    retouchDoneBtn: !!retouchDoneBtn
});

let imageLoaded = false;
let originalImageData = null; // Store original for retouching
let retouchMode = false; // 'remove' or 'restore'
let isRetouching = false;
let brushSize = 20;

// Initialize buttons
convertBtn.disabled = true;
const removeBgBtn = document.getElementById('remove-bg-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
removeBgBtn.disabled = true;

// Settings panel toggle
let settingsOpen = false;
if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener('click', function() {
        settingsOpen = !settingsOpen;
        settingsPanel.style.display = settingsOpen ? 'block' : 'none';
        const btnText = settingsBtn.querySelector('span:last-child') || settingsBtn;
        if (btnText.tagName === 'SPAN') {
            btnText.textContent = settingsOpen ? 'Hide Settings' : 'Vectorization Settings';
        } else {
            settingsBtn.innerHTML = settingsOpen ? '<span>⚙️</span><span>Hide Settings</span>' : '<span>⚙️</span><span>Vectorization Settings</span>';
        }
    });
}

// Background removal using @imgly/background-removal
// This uses the EXACT SAME U2-Net model as Python rembg
// It's the best rembg alternative for browser - same quality, same model
async function removeBackground() {
    removeBgBtn.disabled = true;
    const btnText = removeBgBtn.querySelector('span:last-child') || removeBgBtn;
    if (btnText.tagName === 'SPAN') {
        btnText.textContent = 'Processing...';
    } else {
        removeBgBtn.innerHTML = '<span>⏳</span><span>Processing...</span>';
    }
    
    try {
        // Save original canvas dimensions
        const originalCanvasWidth = canvas.width;
        const originalCanvasHeight = canvas.height;
        
        // Convert canvas to blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
        
        if (btnText.tagName === 'SPAN') {
            btnText.textContent = 'Removing background (rembg model)...';
        } else {
            removeBgBtn.innerHTML = '<span>⏳</span><span>Removing background (rembg model)...</span>';
        }
        console.log('Processing with @imgly/background-removal (U2-Net - same as rembg Python)...');
        
        // Use U2-Net model (same as rembg Python)
        const resultBlob = await rembgRemove(blob, {
            model: 'isnet_fp16', // High quality model (same as rembg)
            output: {
                format: 'image/png'
            }
        });
        
        if (btnText.tagName === 'SPAN') {
            btnText.textContent = 'Applying result...';
        } else {
            removeBgBtn.innerHTML = '<span>⏳</span><span>Applying result...</span>';
        }
        
        // Create image from result
        const resultImg = new Image();
        resultImg.onload = () => {
            // Clear canvas and draw the result at ORIGINAL size
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw the result at original size
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(resultImg, 0, 0, originalCanvasWidth, originalCanvasHeight);
            
            // Enhanced post-processing: Preserve more of the subject by dilating the mask
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const width = canvas.width;
            const height = canvas.height;
            
            // Step 1: Dilate the foreground mask to preserve edges (expand opaque areas)
            // This helps recover pixels that were incorrectly removed
            const dilatedData = new Uint8ClampedArray(data);
            const dilationRadius = 2; // Pixels to expand the mask
            
            for (let y = dilationRadius; y < height - dilationRadius; y++) {
                for (let x = dilationRadius; x < width - dilationRadius; x++) {
                    const idx = (y * width + x) * 4;
                    const alpha = data[idx + 3];
                    
                    // If this pixel is mostly opaque, check neighbors to preserve edge pixels
                    if (alpha > 128) {
                        // Check surrounding pixels in a small radius
                        let maxNeighborAlpha = alpha;
                        for (let dy = -dilationRadius; dy <= dilationRadius; dy++) {
                            for (let dx = -dilationRadius; dx <= dilationRadius; dx++) {
                                if (dx === 0 && dy === 0) continue;
                                const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
                                const neighborAlpha = data[neighborIdx + 3];
                                if (neighborAlpha > maxNeighborAlpha) {
                                    maxNeighborAlpha = neighborAlpha;
                                }
                            }
                        }
                        
                        // If we found a more opaque neighbor, preserve this pixel more
                        if (maxNeighborAlpha > alpha && alpha > 50) {
                            dilatedData[idx + 3] = Math.min(255, alpha + (maxNeighborAlpha - alpha) * 0.3);
                        }
                    }
                }
            }
            
            // Step 2: Refine edges with better smoothing
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    const alpha = dilatedData[idx + 3];
                    
                    // Process edge pixels (partial transparency)
                    if (alpha > 20 && alpha < 235) {
                        // Get neighbor alphas
                        const topAlpha = dilatedData[((y - 1) * width + x) * 4 + 3];
                        const bottomAlpha = dilatedData[((y + 1) * width + x) * 4 + 3];
                        const leftAlpha = dilatedData[(y * width + (x - 1)) * 4 + 3];
                        const rightAlpha = dilatedData[(y * width + (x + 1)) * 4 + 3];
                        
                        // Weighted average with more weight on current pixel to preserve details
                        const avgAlpha = Math.round(
                            (alpha * 3 + topAlpha + bottomAlpha + leftAlpha + rightAlpha) / 7
                        );
                        dilatedData[idx + 3] = avgAlpha;
                    }
                }
            }
            
            // Step 3: Boost semi-transparent pixels that are likely part of the subject
            // This helps recover fine details like hair, fur, or transparent objects
            for (let i = 0; i < dilatedData.length; i += 4) {
                const alpha = dilatedData[i + 3];
                // If pixel has some opacity and color, boost it slightly
                if (alpha > 30 && alpha < 200) {
                    const r = dilatedData[i];
                    const g = dilatedData[i + 1];
                    const b = dilatedData[i + 2];
                    // If pixel has significant color, it's likely part of the subject
                    if (r + g + b > 50) {
                        dilatedData[i + 3] = Math.min(255, alpha * 1.15);
                    }
                }
            }
            
            ctx.putImageData(new ImageData(dilatedData, width, height), 0, 0);
            
            // Save original image data for retouching
            originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Set bgRemoved FIRST before updating img.src
            bgRemoved = true;
            window.bgRemoved = true; // Also set global
            
            // Set flag to prevent img.onload from resetting bgRemoved
            window.skipBgReset = true;
            
            // Update source image - this will trigger img.onload but skipBgReset will prevent reset
            img.src = canvas.toDataURL();
            
            // DEBUG: Verify bgRemoved is set
            console.log('🔵 bgRemoved set to TRUE:', bgRemoved);
            console.log('🔵 window.bgRemoved set to TRUE:', window.bgRemoved);
            console.log('🔵 originalImageData exists:', !!originalImageData);
            
            // Clear the flag after a delay to allow img.onload to complete
            setTimeout(() => {
                window.skipBgReset = false;
                console.log('🔵 skipBgReset cleared, bgRemoved should still be:', bgRemoved, 'window.bgRemoved:', window.bgRemoved);
            }, 2000);
            
            // Apply optimized settings
            applyNoBgSettings();
            
            // Show retouch section and download no-bg button - FORCE VISIBILITY
            const afterBgRemoved = document.getElementById('after-bg-removed');
            if (afterBgRemoved) {
                afterBgRemoved.style.display = 'block';
                afterBgRemoved.style.visibility = 'visible';
                afterBgRemoved.style.opacity = '1';
            }
            
            if (downloadNoBgBtn) {
                downloadNoBgBtn.style.opacity = '1';
                downloadNoBgBtn.style.pointerEvents = 'auto';
            }
            
            // Get fresh reference to button
            const currentRetouchBtn = document.getElementById('retouch-btn');
            if (currentRetouchBtn) {
                // Force enable the button
                currentRetouchBtn.disabled = false;
                currentRetouchBtn.removeAttribute('disabled');
                currentRetouchBtn.style.opacity = '1';
                currentRetouchBtn.style.pointerEvents = 'auto';
                currentRetouchBtn.style.cursor = 'pointer';
                currentRetouchBtn.style.visibility = 'visible';
                currentRetouchBtn.style.display = 'block';
                currentRetouchBtn.style.position = 'relative';
                currentRetouchBtn.style.zIndex = '1000';
                
                // Force clickability by removing any blocking styles
                currentRetouchBtn.style.userSelect = 'auto';
                currentRetouchBtn.style.touchAction = 'auto';
                
                // Re-attach listeners in case button was recreated
                attachRetouchListeners();
                
                // Test if button is actually clickable
                setTimeout(() => {
                    const rect = currentRetouchBtn.getBoundingClientRect();
                    const computedStyle = window.getComputedStyle(currentRetouchBtn);
                    console.log('✅ Retouch button enabled:', {
                        disabled: currentRetouchBtn.disabled,
                        opacity: computedStyle.opacity,
                        pointerEvents: computedStyle.pointerEvents,
                        cursor: computedStyle.cursor,
                        display: computedStyle.display,
                        visibility: computedStyle.visibility,
                        zIndex: computedStyle.zIndex,
                        position: computedStyle.position,
                        width: rect.width,
                        height: rect.height,
                        top: rect.top,
                        left: rect.left
                    });
                    
                    // Double-check button is not blocked
                    const elementAtPoint = document.elementFromPoint(
                        rect.left + rect.width / 2,
                        rect.top + rect.height / 2
                    );
                    console.log('Element at button center:', elementAtPoint?.id || elementAtPoint?.tagName);
                    if (elementAtPoint !== currentRetouchBtn && !currentRetouchBtn.contains(elementAtPoint)) {
                        console.warn('⚠️ Button might be blocked by:', elementAtPoint);
                    }
                }, 100);
            } else {
                console.error('❌ retouchBtn is null!');
            }
            
            removeBgBtn.textContent = '✅ Background Removed';
            removeBgBtn.style.background = '#28a745 !important';
            removeBgBtn.disabled = false;
            
            console.log('✅ Background removal completed with edge refinement');
            console.log('✅ bgRemoved status:', bgRemoved);
            console.log('✅ originalImageData status:', !!originalImageData);
            console.log('Retouch buttons should now be visible and clickable');
        };
        resultImg.onerror = (error) => {
            throw new Error('Failed to load processed image: ' + error);
        };
        resultImg.src = URL.createObjectURL(resultBlob);
        
    } catch (error) {
        console.error('Error removing background with rembg:', error);
        const btnText = removeBgBtn.querySelector('span:last-child') || removeBgBtn;
        if (btnText.tagName === 'SPAN') {
            btnText.textContent = 'Remove Background';
        } else {
            removeBgBtn.innerHTML = '<span>🎨</span><span>Remove Background</span>';
        }
        removeBgBtn.disabled = false;
        
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('model')) {
            alert('⚠️ Error: Could not load AI model.\n\n' +
                  'The U2-Net model needs to be downloaded on first use (~10-20MB).\n\n' +
                  'Please check your internet connection and try again.\n\n' +
                  'After first download, it will be cached for offline use.');
        } else {
            alert('Error removing background: ' + error.message);
        }
    }
}

// Old advanced algorithm kept as fallback (not used)
function removeBackgroundOld() {
    removeBgBtn.disabled = true;
    removeBgBtn.textContent = '⏳ Analyzing Image...';
    
    setTimeout(() => {
        try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const width = canvas.width;
            const height = canvas.height;
            
            console.log('Starting advanced background removal...');
            
            // Step 1: Enhanced edge sampling with corner emphasis
            const edgeSamples = [];
            const edgeWidth = Math.max(8, Math.floor(Math.min(width, height) / 15));
            const centerX = width / 2;
            const centerY = height / 2;
            
            // Sample edges with higher density
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < edgeWidth; y++) {
                    // Top and bottom edges
                    let idx = (y * width + x) * 4;
                    const cornerWeight = Math.min(
                        Math.min(x, width - x) / (width / 4),
                        Math.min(y, height - y) / (height / 4)
                    );
                    edgeSamples.push({
                        r: data[idx],
                        g: data[idx + 1],
                        b: data[idx + 2],
                        weight: 2 + cornerWeight * 3 // Higher weight for corners
                    });
                    idx = ((height - 1 - y) * width + x) * 4;
                    edgeSamples.push({
                        r: data[idx],
                        g: data[idx + 1],
                        b: data[idx + 2],
                        weight: 2 + cornerWeight * 3
                    });
                }
            }
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < edgeWidth; x++) {
                    // Left and right edges
                    let idx = (y * width + x) * 4;
                    const cornerWeight = Math.min(
                        Math.min(x, width - x) / (width / 4),
                        Math.min(y, height - y) / (height / 4)
                    );
                    edgeSamples.push({
                        r: data[idx],
                        g: data[idx + 1],
                        b: data[idx + 2],
                        weight: 2 + cornerWeight * 3
                    });
                    idx = (y * width + (width - 1 - x)) * 4;
                    edgeSamples.push({
                        r: data[idx],
                        g: data[idx + 1],
                        b: data[idx + 2],
                        weight: 2 + cornerWeight * 3
                    });
                }
            }
            
            // Step 2: Advanced clustering with variance analysis
            const clusters = [];
            const clusterThreshold = 25;
            
            edgeSamples.forEach(sample => {
                let bestCluster = null;
                let minDistance = Infinity;
                
                for (let cluster of clusters) {
                    const distance = Math.sqrt(
                        Math.pow(sample.r - cluster.r, 2) +
                        Math.pow(sample.g - cluster.g, 2) +
                        Math.pow(sample.b - cluster.b, 2)
                    );
                    if (distance < clusterThreshold && distance < minDistance) {
                        minDistance = distance;
                        bestCluster = cluster;
                    }
                }
                
                if (bestCluster) {
                    const weight = sample.weight || 1;
                    const totalWeight = bestCluster.totalWeight + weight;
                    bestCluster.r = (bestCluster.r * bestCluster.totalWeight + sample.r * weight) / totalWeight;
                    bestCluster.g = (bestCluster.g * bestCluster.totalWeight + sample.g * weight) / totalWeight;
                    bestCluster.b = (bestCluster.b * bestCluster.totalWeight + sample.b * weight) / totalWeight;
                    bestCluster.totalWeight = totalWeight;
                } else {
                    clusters.push({
                        r: sample.r,
                        g: sample.g,
                        b: sample.b,
                        totalWeight: sample.weight || 1
                    });
                }
            });
            
            clusters.sort((a, b) => b.totalWeight - a.totalWeight);
            const bgColors = clusters.slice(0, Math.min(5, clusters.length));
            
            // Calculate adaptive tolerance based on color variance
            let maxVariance = 0;
            bgColors.forEach(bg => {
                let variance = 0;
                let count = 0;
                edgeSamples.forEach(sample => {
                    const dist = Math.sqrt(
                        Math.pow(sample.r - bg.r, 2) +
                        Math.pow(sample.g - bg.g, 2) +
                        Math.pow(sample.b - bg.b, 2)
                    );
                    if (dist < clusterThreshold) {
                        variance += dist * dist;
                        count++;
                    }
                });
                if (count > 0) {
                    variance = Math.sqrt(variance / count);
                    maxVariance = Math.max(maxVariance, variance);
                }
            });
            
            const baseTolerance = 40;
            const adaptiveTolerance = baseTolerance + maxVariance * 0.5;
            
            console.log('Detected background colors:', bgColors.map(c => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`));
            console.log('Adaptive tolerance:', adaptiveTolerance.toFixed(1));
            
            // Step 3: Calculate local variance to detect textured objects vs uniform background
            const varianceMap = new Array(width * height);
            const varianceRadius = 3;
            
            for (let y = varianceRadius; y < height - varianceRadius; y++) {
                for (let x = varianceRadius; x < width - varianceRadius; x++) {
                    const idx = y * width + x;
                    const centerR = data[idx * 4];
                    const centerG = data[idx * 4 + 1];
                    const centerB = data[idx * 4 + 2];
                    
                    let sumDist = 0;
                    let count = 0;
                    for (let dy = -varianceRadius; dy <= varianceRadius; dy++) {
                        for (let dx = -varianceRadius; dx <= varianceRadius; dx++) {
                            const nIdx = (y + dy) * width + (x + dx);
                            const nR = data[nIdx * 4];
                            const nG = data[nIdx * 4 + 1];
                            const nB = data[nIdx * 4 + 2];
                            const dist = Math.sqrt(
                                Math.pow(nR - centerR, 2) +
                                Math.pow(nG - centerG, 2) +
                                Math.pow(nB - centerB, 2)
                            );
                            sumDist += dist;
                            count++;
                        }
                    }
                    varianceMap[idx] = sumDist / count; // Local color variance
                }
            }
            
            // Step 4: Enhanced flood fill with variance-based protection
            const mask = new Array(width * height).fill(false);
            const visited = new Array(width * height).fill(false);
            
            function isBackgroundColor(r, g, b, tolerance) {
                for (let bg of bgColors) {
                    const distance = Math.sqrt(
                        Math.pow(r - bg.r, 2) +
                        Math.pow(g - bg.g, 2) +
                        Math.pow(b - bg.b, 2)
                    );
                    if (distance < tolerance) {
                        return true;
                    }
                }
                return false;
            }
            
            // Start flood fill from edges
            const queue = [];
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    if (x < edgeWidth || x >= width - edgeWidth || y < edgeWidth || y >= height - edgeWidth) {
                        const idx = (y * width + x) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        if (isBackgroundColor(r, g, b, adaptiveTolerance)) {
                            queue.push({x, y});
                            visited[y * width + x] = true;
                        }
                    }
                }
            }
            
            // Flood fill with variance protection
            let processed = 0;
            while (queue.length > 0) {
                const {x, y} = queue.shift();
                const idx = y * width + x;
                
                // Check if pixel should be removed
                const pixelIdx = idx * 4;
                const r = data[pixelIdx];
                const g = data[pixelIdx + 1];
                const b = data[pixelIdx + 2];
                
                // Calculate distance from center
                const distFromCenter = Math.sqrt(
                    Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
                );
                const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
                const centerRatio = distFromCenter / maxDist;
                
                // Get local variance
                const variance = varianceMap[idx] || 0;
                const highVariance = variance > 15; // Textured area (likely object)
                
                // Mark as background if:
                // 1. Color matches background
                // 2. Not in center (centerRatio > 0.3)
                // 3. Low variance (uniform area, likely background)
                if (isBackgroundColor(r, g, b, adaptiveTolerance) && 
                    (centerRatio > 0.3 || !highVariance)) {
                    mask[idx] = true;
                }
                
                processed++;
                
                // Check neighbors
                const neighbors = [
                    {x: x - 1, y: y},
                    {x: x + 1, y: y},
                    {x: x, y: y - 1},
                    {x: x, y: y + 1}
                ];
                
                for (let neighbor of neighbors) {
                    const nx = neighbor.x;
                    const ny = neighbor.y;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nIdx = ny * width + nx;
                        if (!visited[nIdx]) {
                            visited[nIdx] = true;
                            const nPixelIdx = nIdx * 4;
                            const nR = data[nPixelIdx];
                            const nG = data[nPixelIdx + 1];
                            const nB = data[nPixelIdx + 2];
                            
                            const nDistFromCenter = Math.sqrt(
                                Math.pow(nx - centerX, 2) + Math.pow(ny - centerY, 2)
                            );
                            const nCenterRatio = nDistFromCenter / maxDist;
                            const nVariance = varianceMap[nIdx] || 0;
                            const nHighVariance = nVariance > 15;
                            
                            // Continue flood fill with stricter conditions
                            if (isBackgroundColor(nR, nG, nB, adaptiveTolerance * 0.9) &&
                                (nCenterRatio > 0.25 || !nHighVariance)) {
                                queue.push({x: nx, y: ny});
                            }
                        }
                    }
                }
                
                if (processed % 10000 === 0) {
                    removeBgBtn.textContent = `⏳ Processing... ${Math.round(processed / (width * height) * 100)}%`;
                }
            }
            
            console.log(`Flood fill processed ${processed} pixels`);
            
            // Step 5: Post-processing - clean up isolated pixels and smooth edges
            const cleanedMask = [...mask];
            
            // Remove isolated background pixels (likely noise)
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = y * width + x;
                    if (mask[idx]) {
                        let foregroundNeighbors = 0;
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (dx === 0 && dy === 0) continue;
                                if (!mask[(y + dy) * width + (x + dx)]) {
                                    foregroundNeighbors++;
                                }
                            }
                        }
                        // If surrounded by foreground, keep it (don't remove)
                        if (foregroundNeighbors >= 6) {
                            cleanedMask[idx] = false;
                        }
                    }
                }
            }
            
            // Step 6: Apply mask with edge feathering
            const newData = new Uint8ClampedArray(data);
            let removedPixels = 0;
            
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = y * width + x;
                    const pixelIdx = idx * 4;
                    
                    if (cleanedMask[idx]) {
                        // Check if on edge for feathering
                        let isEdge = false;
                        let foregroundNeighbors = 0;
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const nx = x + dx;
                                const ny = y + dy;
                                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                    if (!cleanedMask[ny * width + nx]) {
                                        isEdge = true;
                                        foregroundNeighbors++;
                                    }
                                }
                            }
                        }
                        
                        if (isEdge && foregroundNeighbors > 0) {
                            // Feather edge for smooth transition
                            const alpha = Math.max(0, 255 - (foregroundNeighbors * 30));
                            newData[pixelIdx + 3] = alpha;
                        } else {
                            // Fully transparent
                            newData[pixelIdx + 3] = 0;
                            removedPixels++;
                        }
                    }
                }
            }
            
            console.log(`Removed ${removedPixels} background pixels (${Math.round(removedPixels / (width * height) * 100)}%)`);
            
            const newImageData = new ImageData(newData, width, height);
            ctx.putImageData(newImageData, 0, 0);
            
            img.src = canvas.toDataURL();
            bgRemoved = true;
            
            applyNoBgSettings();
            
            removeBgBtn.textContent = '✅ Background Removed';
            removeBgBtn.style.background = '#28a745 !important';
            removeBgBtn.disabled = false;
            
            console.log('✅ Advanced background removal completed');
        } catch (error) {
            console.error('Error removing background:', error);
            removeBgBtn.textContent = '🎨 Remove Background';
            removeBgBtn.disabled = false;
            alert('Error removing background: ' + error.message);
        }
    }, 10);
}

// Apply default settings for no-background images
function applyNoBgSettings() {
    globalfilterspeckle = defaultNoBgSettings.filter_speckle;
    globalcolorprecision = defaultNoBgSettings.color_precision;
    globallayerdifference = defaultNoBgSettings.layer_difference;
    globalcorner = defaultNoBgSettings.corner_threshold;
    globallength = defaultNoBgSettings.length_threshold;
    globalsplice = defaultNoBgSettings.splice_threshold;
    
    // Update UI
    document.getElementById('filterspeckle').value = globalfilterspeckle;
    document.getElementById('filterspecklevalue').innerHTML = globalfilterspeckle;
    document.getElementById('colorprecision').value = globalcolorprecision;
    document.getElementById('colorprecisionvalue').innerHTML = globalcolorprecision;
    document.getElementById('layerdifference').value = globallayerdifference;
    document.getElementById('layerdifferencevalue').innerHTML = globallayerdifference;
    document.getElementById('corner').value = globalcorner;
    document.getElementById('cornervalue').innerHTML = globalcorner;
    document.getElementById('length').value = globallength;
    document.getElementById('lengthvalue').innerHTML = globallength;
    document.getElementById('splice').value = globalsplice;
    document.getElementById('splicevalue').innerHTML = globalsplice;
    
    console.log('Applied default no-background settings');
}

// Remove background button
removeBgBtn.addEventListener('click', function() {
    if (imageLoaded && img.src) {
        removeBackground();
    } else {
        alert('Please load an image first.');
    }
});

// Retouch tool - manual background adjustment
// Make function globally accessible for onclick handler
// Prevent rapid clicking
let retouchClickLock = false;

window.handleRetouchClick = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }
    
    // Prevent rapid clicking
    if (retouchClickLock) {
        console.log('⏸️ Retouch click locked, ignoring');
        return false;
    }
    
    const actualRetouchBtn = document.getElementById('retouch-btn');
    if (!actualRetouchBtn) {
        console.error('❌ retouchBtn not found!');
        return false;
    }
    
    // Get fresh value of bgRemoved from global scope
    const currentBgRemoved = window.bgRemoved !== undefined ? window.bgRemoved : bgRemoved;
    
    // Use the current value
    if (!currentBgRemoved && !bgRemoved) {
        console.error('❌ bgRemoved is FALSE! Cannot proceed.');
        alert('Please remove background first.');
        return false;
    }
    
    if (!originalImageData) {
        alert('Error: Original image data not available. Please remove background again.');
        return false;
    }
    
    // Lock to prevent rapid clicking
    retouchClickLock = true;
    setTimeout(() => {
        retouchClickLock = false;
    }, 300);
    
    // Toggle retouching mode
    isRetouching = !isRetouching;
    
    if (isRetouching) {
        // ACTIVATE RETOUCHING
        if (retouchControls) {
            retouchControls.style.display = 'block';
            retouchControls.style.visibility = 'visible';
            retouchControls.style.opacity = '1';
        }
        
        const btnText = actualRetouchBtn.querySelector('span:last-child') || actualRetouchBtn;
        if (btnText.tagName === 'SPAN') {
            btnText.textContent = 'Stop Retouching';
        } else {
            actualRetouchBtn.innerHTML = '<span>⏸️</span><span>Stop Retouching</span>';
        }
        actualRetouchBtn.className = 'btn btn-danger';
        
        canvas.style.cursor = 'crosshair';
        canvas.style.userSelect = 'none'; // Prevent text selection while painting
        
        // Set default mode to remove if not already set
        if (!retouchMode) {
            retouchMode = 'remove';
        }
        
        // Activate remove button by default
        if (retouchRemoveBtn) {
            retouchRemoveBtn.classList.add('active');
        }
        if (retouchRestoreBtn) {
            retouchRestoreBtn.classList.remove('active');
        }
        
        console.log('✅ Retouching mode ACTIVATED, mode:', retouchMode);
    } else {
        // DEACTIVATE RETOUCHING
        if (retouchControls) {
            retouchControls.style.display = 'none';
        }
        
        const btnText = actualRetouchBtn.querySelector('span:last-child') || actualRetouchBtn;
        if (btnText.tagName === 'SPAN') {
            btnText.textContent = 'Start Retouching';
        } else {
            actualRetouchBtn.innerHTML = '<span>✏️</span><span>Start Retouching</span>';
        }
        actualRetouchBtn.className = 'btn btn-warning';
        
        canvas.style.cursor = 'default';
        canvas.style.userSelect = 'auto';
        isPainting = false;
        
        // Update img.src ONLY when retouching is done
        window.skipBgReset = true;
        img.src = canvas.toDataURL();
        setTimeout(() => {
            window.skipBgReset = false;
        }, 500);
        
        console.log('⏸️ Retouching mode DEACTIVATED');
    }
    
    return false;
};

// Also attach via addEventListener as backup
function attachRetouchListeners() {
    const actualRetouchBtn = document.getElementById('retouch-btn');
    if (!actualRetouchBtn) {
        console.error('❌ retouchBtn not found when trying to attach event listener!');
        return;
    }
    
    console.log('Attaching retouch button event listener to:', actualRetouchBtn);
    
    // Remove any existing listeners
    const newBtn = actualRetouchBtn.cloneNode(true);
    actualRetouchBtn.parentNode.replaceChild(newBtn, actualRetouchBtn);
    const freshBtn = document.getElementById('retouch-btn');
    
    // Attach click listener
    freshBtn.addEventListener('click', window.handleRetouchClick, true);
    freshBtn.addEventListener('mousedown', function(e) {
        console.log('🔵 Retouch button mousedown event');
        e.preventDefault();
        window.handleRetouchClick(e);
    }, true);
}

// Attach listeners immediately when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachRetouchListeners);
} else {
    attachRetouchListeners();
}

// Brush size control
if (brushSizeSlider) {
    brushSizeSlider.addEventListener('input', function() {
        brushSize = parseInt(this.value);
        if (brushSizeValue) brushSizeValue.textContent = brushSize;
        console.log('Brush size changed to:', brushSize);
    });
}

// Retouch mode buttons
if (retouchRemoveBtn) {
    retouchRemoveBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        if (!isRetouching) {
            // Auto-activate retouching if not active
            isRetouching = true;
            if (retouchControls) {
                retouchControls.style.display = 'block';
            }
            const retouchBtn = document.getElementById('retouch-btn');
            if (retouchBtn) {
                const btnText = retouchBtn.querySelector('span:last-child') || retouchBtn;
                if (btnText.tagName === 'SPAN') {
                    btnText.textContent = 'Stop Retouching';
                } else {
                    retouchBtn.innerHTML = '<span>⏸️</span><span>Stop Retouching</span>';
                }
                retouchBtn.className = 'btn btn-danger';
            }
            canvas.style.cursor = 'crosshair';
        }
        
        retouchMode = 'remove';
        retouchRemoveBtn.classList.add('active');
        if (retouchRestoreBtn) {
            retouchRestoreBtn.classList.remove('active');
        }
        console.log('✅ Retouch mode set to: remove');
    });
}

if (retouchRestoreBtn) {
    retouchRestoreBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        if (!isRetouching) {
            // Auto-activate retouching if not active
            isRetouching = true;
            if (retouchControls) {
                retouchControls.style.display = 'block';
            }
            const retouchBtn = document.getElementById('retouch-btn');
            if (retouchBtn) {
                const btnText = retouchBtn.querySelector('span:last-child') || retouchBtn;
                if (btnText.tagName === 'SPAN') {
                    btnText.textContent = 'Stop Retouching';
                } else {
                    retouchBtn.innerHTML = '<span>⏸️</span><span>Stop Retouching</span>';
                }
                retouchBtn.className = 'btn btn-danger';
            }
            canvas.style.cursor = 'crosshair';
        }
        
        retouchMode = 'restore';
        retouchRestoreBtn.classList.add('active');
        if (retouchRemoveBtn) {
            retouchRemoveBtn.classList.remove('active');
        }
        console.log('✅ Retouch mode set to: restore');
    });
}

if (retouchDoneBtn) {
    retouchDoneBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Deactivate retouching
        isRetouching = false;
        isPainting = false;
        
        if (retouchControls) {
            retouchControls.style.display = 'none';
        }
        
        const retouchBtn = document.getElementById('retouch-btn');
        if (retouchBtn) {
            const btnText = retouchBtn.querySelector('span:last-child') || retouchBtn;
            if (btnText.tagName === 'SPAN') {
                btnText.textContent = 'Start Retouching';
            } else {
                retouchBtn.innerHTML = '<span>✏️</span><span>Start Retouching</span>';
            }
            retouchBtn.className = 'btn btn-warning';
        }
        
        canvas.style.cursor = 'default';
        canvas.style.userSelect = 'auto';
        
        // Update img.src when retouching is done (with protection)
        window.skipBgReset = true;
        img.src = canvas.toDataURL();
        setTimeout(() => {
            window.skipBgReset = false;
        }, 500);
        
        console.log('✅ Retouching done and saved');
    });
}

// Retouch painting on canvas
let isPainting = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('mousedown', function(e) {
    if (!isRetouching) {
        return; // Silently return if not in retouching mode
    }
    if (!retouchMode) {
        // Auto-select remove mode if none selected
        retouchMode = 'remove';
        if (retouchRemoveBtn) {
            retouchRemoveBtn.classList.add('active');
        }
        if (retouchRestoreBtn) {
            retouchRestoreBtn.classList.remove('active');
        }
    }
    e.preventDefault();
    e.stopPropagation();
    isPainting = true;
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
    paintAt(lastX, lastY);
});

canvas.addEventListener('mousemove', function(e) {
    if (!isRetouching || !isPainting) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    paintLine(lastX, lastY, x, y);
    lastX = x;
    lastY = y;
});

canvas.addEventListener('mouseup', function(e) {
    if (isRetouching) {
        e.preventDefault();
        e.stopPropagation();
    }
    isPainting = false;
});

canvas.addEventListener('mouseleave', function(e) {
    if (isRetouching) {
        e.preventDefault();
    }
    isPainting = false;
});

// Prevent context menu while retouching
canvas.addEventListener('contextmenu', function(e) {
    if (isRetouching) {
        e.preventDefault();
        return false;
    }
});

function paintAt(x, y) {
    // Double-check we're in retouching mode
    if (!isRetouching) {
        return;
    }
    
    if (!originalImageData) {
        console.warn('No original image data for retouching');
        return;
    }
    
    if (!retouchMode) {
        // Auto-select remove mode
        retouchMode = 'remove';
    }
    
    // Get current canvas image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const origData = originalImageData.data;
    const radius = brushSize;
    
    // Convert screen coordinates to canvas coordinates
    const scaleX = canvas.width / canvas.getBoundingClientRect().width;
    const scaleY = canvas.height / canvas.getBoundingClientRect().height;
    const canvasX = Math.round(x * scaleX);
    const canvasY = Math.round(y * scaleY);
    
    // Improved brush with smoother edges
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > radius) continue;
            
            const px = canvasX + dx;
            const py = canvasY + dy;
            
            if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height) continue;
            
            const idx = (py * canvas.width + px) * 4;
            // Smoother brush falloff
            const normalizedDist = dist / radius;
            const alpha = 1 - (normalizedDist * normalizedDist); // Quadratic falloff for smoother edges
            
            if (retouchMode === 'remove') {
                // Remove: make transparent (fade out)
                const currentAlpha = data[idx + 3];
                const removeAmount = alpha * 0.9; // 90% removal strength
                data[idx + 3] = Math.max(0, Math.round(currentAlpha * (1 - removeAmount)));
            } else if (retouchMode === 'restore') {
                // Restore: restore from original (fade in)
                const currentAlpha = data[idx + 3];
                const origAlpha = origData[idx + 3];
                // Blend between current and original based on brush strength
                data[idx + 3] = Math.min(255, Math.round(origAlpha * alpha + currentAlpha * (1 - alpha)));
                // Also restore RGB values
                data[idx] = Math.round(origData[idx] * alpha + data[idx] * (1 - alpha));
                data[idx + 1] = Math.round(origData[idx + 1] * alpha + data[idx + 1] * (1 - alpha));
                data[idx + 2] = Math.round(origData[idx + 2] * alpha + data[idx + 2] * (1 - alpha));
            }
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    // DON'T update img.src during retouching - it triggers img.onload and resets everything
    // The canvas is already updated, which is all we need for visual feedback
    // img.src will be updated when retouching is done
}

function paintLine(x1, y1, x2, y2) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        paintAt(x, y);
    }
}

// Download no-background image
downloadNoBgBtn.addEventListener('click', function(e) {
    e.preventDefault();
    if (!bgRemoved) {
        alert('Please remove background first.');
        return;
    }
    
    // Download canvas as PNG (with transparency)
    canvas.toBlob(function(blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'haidar-app-no-bg-' + new Date().toISOString().slice(0, 19).replace(/:/g, '').replace('T', ' ') + '.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 'image/png');
});

// Initialize WASM module
console.log('Initializing WASM module...');
init('./pkg/haidar_app_bg.wasm').then(() => {
    console.log('WASM module initialized successfully!');
    wasmInitialized = true;
    // Enable buttons if image is already loaded
    if (imageLoaded) {
        convertBtn.disabled = false;
        removeBgBtn.disabled = false;
    }
}).catch((err) => {
    console.error('Failed to initialize WASM module:', err);
    alert('Failed to initialize the application. Please refresh the page.');
});

// Paste from clipboard
document.addEventListener('paste', function (e) {
    if (e.clipboardData) {
        var items = e.clipboardData.items;
        if (!items) return;

        //access data directly
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                //image
                var blob = items[i].getAsFile();
                var URLObj = window.URL || window.webkitURL;
                var source = URLObj.createObjectURL(blob);
                setSourceAndRestart(source);
            }
        }
        e.preventDefault();
    }
});

// Convert button
convertBtn.addEventListener('click', function (e) {
    console.log('Convert button clicked', { imageLoaded, hasImgSrc: !!img.src, wasmInitialized });
    if (!wasmInitialized) {
        alert('WASM module is still initializing. Please wait a moment and try again.');
        return;
    }
    if (imageLoaded && img.src) {
        console.log('Starting conversion...');
        restart();
    } else {
        console.warn('Cannot convert: image not loaded', { imageLoaded, hasImgSrc: !!img.src });
        alert('Please load an image first by dragging and dropping or selecting a file.');
    }
});

// Download as SVG
document.getElementById('export').addEventListener('click', function (e) {
    const blob = new Blob([
        `<?xml version="1.0" encoding="UTF-8"?>\n`,
        `<!-- Generator: HaidarApp -->\n`,
        new XMLSerializer().serializeToString(svg)
    ], {type: 'octet/stream'}),
    url = window.URL.createObjectURL(blob);

    this.href = url;
    this.target = '_blank';

    this.download = 'haidar-app-export-' + new Date().toISOString().slice(0, 19).replace(/:/g, '').replace('T', ' ') + '.svg';
});

// Download as PNG (with transparent background preserved)
document.getElementById('export-png').addEventListener('click', function (e) {
    e.preventDefault();
    
    // Create a temporary canvas with the same size as the SVG
    const svgRect = svg.getBoundingClientRect();
    const svgWidth = parseInt(svg.getAttribute('width')) || svgRect.width;
    const svgHeight = parseInt(svg.getAttribute('height')) || svgRect.height;
    
    const pngCanvas = document.createElement('canvas');
    pngCanvas.width = svgWidth;
    pngCanvas.height = svgHeight;
    const pngCtx = pngCanvas.getContext('2d');
    
    // Create an image from the SVG
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.onload = function() {
        // Draw the SVG image onto the canvas (preserves transparency)
        pngCtx.drawImage(img, 0, 0, svgWidth, svgHeight);
        
        // Convert to PNG blob and download
        pngCanvas.toBlob(function(blob) {
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = 'haidar-app-export-' + new Date().toISOString().slice(0, 19).replace(/:/g, '').replace('T', ' ') + '.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);
            URL.revokeObjectURL(url);
        }, 'image/png');
    };
    img.onerror = function() {
        alert('Error converting SVG to PNG. Please try again.');
        URL.revokeObjectURL(url);
    };
    img.src = url;
});

// Upload button
var imageSelect = document.getElementById('imageSelect'),
imageInput = document.getElementById('imageInput');  
imageSelect.addEventListener('click', function (e) {
    imageInput.click();
    e.preventDefault();
});

imageInput.addEventListener('change', function (e) {
    setSourceAndRestart(this.files[0]);
});

// Drag-n-Drop
var drop = document.getElementById('drop');
drop.addEventListener('dragenter', function (e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    droptext.classList.add('hovering');
    return false;
});

drop.addEventListener('dragleave', function (e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    droptext.classList.remove('hovering');
    return false;
});

drop.addEventListener('dragover', function (e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    droptext.classList.add('hovering');
    return false;
});

drop.addEventListener('drop', function (e) {
    if (e.preventDefault) e.preventDefault();
    droptext.classList.remove('hovering');
    setSourceAndRestart(e.dataTransfer.files[0]);
    return false;
});

// Get Input from UI controls
var globalcorner = parseInt(document.getElementById('corner').value),
    globallength = parseFloat(document.getElementById('length').value),
    globalsplice = parseInt(document.getElementById('splice').value),
    globalfilterspeckle = parseInt(document.getElementById('filterspeckle').value),
    globalcolorprecision = parseInt(document.getElementById('colorprecision').value),
    globallayerdifference = parseInt(document.getElementById('layerdifference').value),
    globalpathprecision = parseInt(document.getElementById('pathprecision').value);

document.getElementById('none').addEventListener('click', function (e) {
    mode = 'none';
    updateButtonSelection('none', ['polygon', 'spline']);
    restart();
}, false);

document.getElementById('polygon').addEventListener('click', function (e) {
    mode = 'polygon';
    updateButtonSelection('polygon', ['none', 'spline']);
    restart();
}, false);

document.getElementById('spline').addEventListener('click', function (e) {
    mode = 'spline';
    updateButtonSelection('spline', ['none', 'polygon']);
    restart();
}, false);

document.getElementById('clustering-binary').addEventListener('click', function (e) {
    clustering_mode = 'binary';
    updateButtonSelection('clustering-binary', ['clustering-color']);
    restart();
}, false);

document.getElementById('clustering-color').addEventListener('click', function (e) {
    clustering_mode = 'color';
    updateButtonSelection('clustering-color', ['clustering-binary']);
    restart();
}, false);

document.getElementById('clustering-cutout').addEventListener('click', function (e) {
    clustering_hierarchical = 'cutout';
    updateButtonSelection('clustering-cutout', ['clustering-stacked']);
    restart();
}, false);

document.getElementById('clustering-stacked').addEventListener('click', function (e) {
    clustering_hierarchical = 'stacked';
    updateButtonSelection('clustering-stacked', ['clustering-cutout']);
    restart();
}, false);

document.getElementById('filterspeckle').addEventListener('change', function (e) {
    globalfilterspeckle = parseInt(this.value);
    document.getElementById('filterspecklevalue').innerHTML = this.value;
    restart();
});

document.getElementById('colorprecision').addEventListener('change', function (e) {
    globalcolorprecision = parseInt(this.value);
    document.getElementById('colorprecisionvalue').innerHTML = this.value;
    restart();
});

document.getElementById('layerdifference').addEventListener('change', function (e) {
    globallayerdifference = parseInt(this.value);
    document.getElementById('layerdifferencevalue').innerHTML = this.value;
    restart();
});

document.getElementById('corner').addEventListener('change', function (e) {
    globalcorner = parseInt(this.value);
    document.getElementById('cornervalue').innerHTML = this.value;
    restart();
});

document.getElementById('length').addEventListener('change', function (e) {
    globallength = parseFloat(this.value);
    document.getElementById('lengthvalue').innerHTML = globallength;
    restart();
});

document.getElementById('splice').addEventListener('change', function (e) {
    globalsplice = parseInt(this.value);
    document.getElementById('splicevalue').innerHTML = this.value;
    restart();
});

document.getElementById('pathprecision').addEventListener('change', function (e) {
    globalpathprecision = parseInt(this.value);
    document.getElementById('pathprecisionvalue').innerHTML = this.value;
    restart();
});

function updateButtonSelection(selectedId, otherIds) {
    document.getElementById(selectedId).classList.add('selected');
    otherIds.forEach(id => {
        document.getElementById(id).classList.remove('selected');
    });
}

function setSourceAndRestart(source) {
    // Don't reset if we're in the middle of background removal
    if (window.skipBgReset) {
        console.log('Skipping setSourceAndRestart because skipBgReset is true');
        return;
    }
    
    img.src = source instanceof File ? URL.createObjectURL(source) : source;
    img.onload = function () {
        // Don't reset if we're in the middle of background removal
        if (window.skipBgReset) {
            console.log('Skipping img.onload reset because skipBgReset is true');
            return;
        }
        const width = img.naturalWidth, height = img.naturalHeight;
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('style', 'background: transparent;');
        svg.style.background = 'transparent';
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        // Clear previous conversion
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Show preview
        droptext.style.display = 'none';
        previewContainer.style.display = 'grid';
        previewContainer.classList.add('active');
        imageLoaded = true;
        
        // Enable buttons, disable download (only if WASM is initialized)
        if (wasmInitialized) {
            convertBtn.disabled = false;
            convertBtn.textContent = '🔄 Convert to SVG';
            removeBgBtn.disabled = false;
        }
        downloadBtn.style.opacity = '0.5';
        downloadBtn.style.pointerEvents = 'none';
        downloadPngBtn.style.opacity = '0.5';
        downloadPngBtn.style.pointerEvents = 'none';
        // Keep retouch buttons visible but disable them
        if (downloadNoBgBtn) {
            downloadNoBgBtn.style.opacity = '0.5';
            downloadNoBgBtn.style.pointerEvents = 'none';
        }
        if (retouchBtn) {
            retouchBtn.disabled = true;
            retouchBtn.setAttribute('disabled', 'disabled');
            retouchBtn.style.opacity = '0.5';
            retouchBtn.style.pointerEvents = 'none';
            retouchBtn.style.cursor = 'not-allowed';
        }
        retouchControls.style.display = 'none';
        // Only reset if not skipping (i.e., not during background removal or retouching)
        if (!window.skipBgReset) {
            bgRemoved = false;
            window.bgRemoved = false; // Also reset global
            originalImageData = null;
            isRetouching = false;
        } else {
            // Preserve retouching state if we're in the middle of retouching
            console.log('Preserving state during img.onload - isRetouching:', isRetouching, 'bgRemoved:', bgRemoved);
        }
        removeBgBtn.textContent = '🎨 Remove Background';
        removeBgBtn.style.background = '#28a745 !important';
        canvas.style.cursor = 'default';
        console.log('Image loaded and preview shown. Buttons enabled:', wasmInitialized);
    }
}

function restart() {
    document.getElementById('clustering-binary').classList.remove('selected');
    document.getElementById('clustering-color').classList.remove('selected');
    document.getElementById('clustering-' + clustering_mode).classList.add('selected');
    Array.from(document.getElementsByClassName('clustering-color-options')).forEach((el) => {
        el.style.display = clustering_mode == 'color' ? '' : 'none';
    });

    document.getElementById('clustering-cutout').classList.remove('selected');
    document.getElementById('clustering-stacked').classList.remove('selected');
    document.getElementById('clustering-' + clustering_hierarchical).classList.add('selected');

    document.getElementById('none').classList.remove('selected');
    document.getElementById('polygon').classList.remove('selected');
    document.getElementById('spline').classList.remove('selected');
    document.getElementById(mode).classList.add('selected');
    Array.from(document.getElementsByClassName('spline-options')).forEach((el) => {
        el.style.display = mode == 'spline' ? '' : 'none';
    });

    if (!img.src || !imageLoaded) {
        return;
    }
    
    // Disable convert button during conversion
    convertBtn.disabled = true;
    convertBtn.textContent = '⏳ Converting...';
    
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }
    
    // IMPORTANT: Use the current canvas content (which includes retouching if applicable)
    // Don't redraw img - the canvas already has the retouched version!
    // Only redraw if we haven't done background removal yet (canvas might be from original image)
    if (!bgRemoved) {
        // No background removal yet, use original image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        console.log('Using original image (no background removal yet)');
    } else {
        // Background was removed (and possibly retouched), keep current canvas content
        // The canvas already has the retouched version, don't overwrite it!
        console.log('Using current canvas content (includes retouching if applicable)');
    }
    
    // Filter out transparent pixels before vectorization
    // This ensures transparent areas are not vectorized
    if (bgRemoved) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Remove any pixels that are fully transparent
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 10) { // Alpha < 10 (almost transparent)
                // Make fully transparent
                data[i + 3] = 0;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    let converter_params = JSON.stringify({
        'canvas_id': canvas.id,
        'svg_id': svg.id,
        'mode': mode,
        'clustering_mode': clustering_mode,
        'hierarchical': clustering_hierarchical,
        'corner_threshold': deg2rad(globalcorner),
        'length_threshold': globallength,
        'max_iterations': 10,
        'splice_threshold': deg2rad(globalsplice),
        'filter_speckle': globalfilterspeckle*globalfilterspeckle,
        'color_precision': 8-globalcolorprecision,
        'layer_difference': globallayerdifference,
        'path_precision': globalpathprecision,
    });
    if (runner && !runner.stopped) {
        try {
            runner.stop();
        } catch (e) {
            console.warn('Error stopping previous runner:', e);
        }
    }
    console.log('Creating converter runner with params:', converter_params);
    runner = new ConverterRunner(converter_params);
    progress.value = 0;
    progressregion.style.display = 'block';
    console.log('Starting conversion, progress bar shown');
    runner.run().then(() => {
        console.log('Conversion complete!');
        convertBtn.textContent = '🔄 Convert to SVG';
        convertBtn.disabled = false;
        
        // Update bulk result if we're editing one
        if (window.currentBulkEditIndex !== undefined) {
            updateBulkResultAfterEdit();
        }
    }).catch((err) => {
        console.error('Conversion error:', err);
        convertBtn.textContent = '🔄 Convert to SVG';
        convertBtn.disabled = false;
        alert('Conversion failed: ' + err.message);
    });
}

function deg2rad(deg) {
    return deg/180*3.141592654;
}

class ConverterRunner {
    constructor (converter_params) {
        try {
            console.log('Initializing converter, mode:', clustering_mode);
            this.converter =
                clustering_mode == 'color' ?
                    ColorImageConverter.new_with_string(converter_params):
                    BinaryImageConverter.new_with_string(converter_params);
            console.log('Converter created, initializing...');
            this.converter.init();
            console.log('Converter initialized successfully');
            this.stopped = false;
        } catch (error) {
            console.error('Error creating converter:', error);
            throw error;
        }
        // Always use transparent background for SVG
        svg.style.background = 'transparent';
        svg.setAttribute('style', 'background: transparent;');
        
        if (clustering_mode == 'binary') {
            canvas.style.display = 'none';
        } else {
            canvas.style.display = '';
        }
        canvas.style.opacity = '';
    }

    run () {
        const This = this;
        console.log('ConverterRunner.run() called');
        return new Promise((resolve) => {
            setTimeout(function tick () {
                if (This.stopped || !This.converter) {
                    console.log('Conversion stopped or converter freed');
                    resolve();
                    return;
                }
                if (!This.stopped) {
                    let done = false;
                    const startTick = performance.now();
                    try {
                        while (!(done = This.converter.tick()) &&
                            performance.now() - startTick < 25) {
                        }
                        const progressValue = This.converter.progress();
                        progress.value = progressValue;
                        if (progressValue >= 50) {
                            document.getElementById('canvas-container').style.opacity = '0.3';
                        } else {
                            document.getElementById('canvas-container').style.opacity = (50 - progressValue) / 25;
                        }
                        if (progressValue >= progress.max) {
                            console.log('Conversion 100% complete');
                            progressregion.style.display = 'none';
                            progress.value = 0;
                            // Enable download buttons when conversion is complete
                            downloadBtn.style.opacity = '1';
                            downloadBtn.style.pointerEvents = 'auto';
                            downloadPngBtn.style.opacity = '1';
                            downloadPngBtn.style.pointerEvents = 'auto';
                            convertBtn.disabled = false;
                            convertBtn.textContent = '🔄 Convert to SVG';
                            resolve();
                            return;
                        }
                        if (!done && !This.stopped && This.converter) {
                            setTimeout(tick, 1);
                        } else {
                            if (done) {
                                console.log('Conversion done (tick returned true)');
                            }
                            resolve();
                        }
                    } catch (error) {
                        console.error('Error during conversion tick:', error);
                        This.stopped = true;
                        resolve();
                    }
                } else {
                    console.log('Conversion stopped');
                    resolve();
                }
            }, 1);
        });
    }

    stop () {
        if (this.stopped) {
            return; // Already stopped
        }
        this.stopped = true;
        try {
            if (this.converter) {
                this.converter.free();
                this.converter = null;
            }
        } catch (e) {
            console.warn('Error freeing converter:', e);
        }
    }
}

// ==================== BULK PROCESSING ====================

let bulkFiles = [];
let bulkResults = [];
let bulkProcessing = false;

const bulkInput = document.getElementById('bulkInput');
const bulkSelectBtn = document.getElementById('bulk-select-btn');
const bulkClearBtn = document.getElementById('bulk-clear-btn');
const bulkProcessBtn = document.getElementById('bulk-process-btn');
const bulkDownloadBtn = document.getElementById('bulk-download-btn');
const bulkProcessingPanel = document.getElementById('bulk-processing-panel');
const bulkFileList = document.getElementById('bulk-file-list');
const bulkCount = document.getElementById('bulk-count');
const bulkProgress = document.getElementById('bulk-progress');
const bulkProgressBar = document.getElementById('bulk-progress-bar');
const bulkProgressText = document.getElementById('bulk-progress-text');
const bulkStatus = document.getElementById('bulk-status');

// Select multiple files
bulkSelectBtn.addEventListener('click', function() {
    bulkInput.click();
});

bulkInput.addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    bulkFiles = files;
    updateBulkFileList();
    bulkProcessingPanel.style.display = 'block';
    bulkProcessBtn.disabled = false;
    bulkDownloadBtn.style.display = 'none';
    bulkResults = [];
});

bulkClearBtn.addEventListener('click', function() {
    bulkFiles = [];
    bulkResults = [];
    bulkInput.value = '';
    updateBulkFileList();
    bulkProcessingPanel.style.display = 'none';
    bulkProgress.style.display = 'none';
    bulkDownloadBtn.style.display = 'none';
    const gallery = document.getElementById('bulk-results-gallery');
    if (gallery) {
        gallery.classList.remove('active');
        gallery.innerHTML = '';
    }
});

function updateBulkFileList() {
    bulkCount.textContent = bulkFiles.length;
    bulkFileList.innerHTML = '';
    
    if (bulkFiles.length === 0) {
        bulkFileList.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">No files selected</div>';
        return;
    }
    
    bulkFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 8px; margin: 4px 0; background: white; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; font-size: 12px;';
        div.innerHTML = `
            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
            <span style="color: #999; margin-left: 10px; font-size: 11px;">${(file.size / 1024).toFixed(1)} KB</span>
        `;
        bulkFileList.appendChild(div);
    });
}

// Process all images
bulkProcessBtn.addEventListener('click', async function() {
    if (bulkFiles.length === 0) {
        alert('Please select images first.');
        return;
    }
    
    if (!wasmInitialized) {
        alert('WASM module is still initializing. Please wait a moment and try again.');
        return;
    }
    
    bulkProcessing = true;
    bulkProcessBtn.disabled = true;
    bulkProcessBtn.textContent = '⏳ Processing...';
    bulkProgress.style.display = 'block';
    bulkProgressBar.style.width = '0%';
    bulkProgressText.textContent = '0 / ' + bulkFiles.length;
    bulkStatus.textContent = 'Starting bulk processing...';
    bulkResults = [];
    
    try {
        for (let i = 0; i < bulkFiles.length; i++) {
            const file = bulkFiles[i];
            bulkStatus.textContent = `Processing ${i + 1}/${bulkFiles.length}: ${file.name}`;
            
            try {
                // Step 1: Remove background
                bulkStatus.textContent = `Removing background: ${file.name}...`;
                const noBgImage = await processBulkImage(file);
                
                // Step 2: Vectorize
                bulkStatus.textContent = `Vectorizing: ${file.name}...`;
                const vectorResult = await vectorizeBulkImage(noBgImage);
                
                // Store result
                const baseName = file.name.replace(/\.[^/.]+$/, '');
                bulkResults.push({
                    originalName: file.name,
                    name: baseName,
                    originalFile: file, // Store original file for editing
                    noBgImage: noBgImage,
                    svgData: vectorResult.svgData,
                    svgPng: vectorResult.pngBlob, // Transparent PNG for download
                    previewPngBlob: vectorResult.previewPngBlob // White background PNG for preview
                });
                
                // Update progress
                const progress = ((i + 1) / bulkFiles.length) * 100;
                bulkProgressBar.style.width = progress + '%';
                bulkProgressText.textContent = (i + 1) + ' / ' + bulkFiles.length;
                
            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
                bulkStatus.textContent = `Error processing ${file.name}: ${error.message}`;
                // Continue with next file
            }
        }
        
        bulkStatus.textContent = `✅ Completed! Processed ${bulkResults.length} images.`;
        bulkProcessBtn.disabled = false;
        bulkProcessBtn.textContent = '🚀 Process All Images';
        bulkDownloadBtn.style.display = 'block';
        bulkProcessing = false;
        
        // Display results gallery
        displayBulkResults();
        
    } catch (error) {
        console.error('Bulk processing error:', error);
        bulkStatus.textContent = `❌ Error: ${error.message}`;
        bulkProcessBtn.disabled = false;
        bulkProcessBtn.textContent = '🚀 Process All Images';
        bulkProcessing = false;
    }
});

async function processBulkImage(file) {
    try {
        // Create a blob from the file
        const blob = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    // Create a temporary canvas
                    const tempCanvas = document.createElement('canvas');
                    const tempCtx = tempCanvas.getContext('2d');
                    
                    // Resize if too large (for performance)
                    const maxSize = 1024;
                    let width = img.width;
                    let height = img.height;
                    if (width > maxSize || height > maxSize) {
                        const ratio = Math.min(maxSize / width, maxSize / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    
                    tempCanvas.width = width;
                    tempCanvas.height = height;
                    tempCtx.drawImage(img, 0, 0, width, height);
                    
                    // Convert to blob for rembg
                    tempCanvas.toBlob((resizedBlob) => {
                        resolve(resizedBlob);
                    }, 'image/png');
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = reader.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
        
        // Remove background using rembg (accepts blob)
        const resultBlob = await rembgRemove(blob, {
            model: 'isnet_fp16', // Use same model as single image processing
            output: {
                format: 'image/png'
            }
        });
        
        // Post-process to preserve more of the subject (same as single image processing)
        const resultImg = new Image();
        return new Promise((resolve, reject) => {
            resultImg.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = resultImg.width;
                tempCanvas.height = resultImg.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(resultImg, 0, 0);
                
                // Apply same post-processing as single image
                const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const data = imageData.data;
                const width = tempCanvas.width;
                const height = tempCanvas.height;
                
                // Dilate mask to preserve edges
                const dilatedData = new Uint8ClampedArray(data);
                const dilationRadius = 2;
                
                for (let y = dilationRadius; y < height - dilationRadius; y++) {
                    for (let x = dilationRadius; x < width - dilationRadius; x++) {
                        const idx = (y * width + x) * 4;
                        const alpha = data[idx + 3];
                        
                        if (alpha > 128) {
                            let maxNeighborAlpha = alpha;
                            for (let dy = -dilationRadius; dy <= dilationRadius; dy++) {
                                for (let dx = -dilationRadius; dx <= dilationRadius; dx++) {
                                    if (dx === 0 && dy === 0) continue;
                                    const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
                                    const neighborAlpha = data[neighborIdx + 3];
                                    if (neighborAlpha > maxNeighborAlpha) {
                                        maxNeighborAlpha = neighborAlpha;
                                    }
                                }
                            }
                            
                            if (maxNeighborAlpha > alpha && alpha > 50) {
                                dilatedData[idx + 3] = Math.min(255, alpha + (maxNeighborAlpha - alpha) * 0.3);
                            }
                        }
                    }
                }
                
                // Refine edges
                for (let y = 1; y < height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        const idx = (y * width + x) * 4;
                        const alpha = dilatedData[idx + 3];
                        
                        if (alpha > 20 && alpha < 235) {
                            const topAlpha = dilatedData[((y - 1) * width + x) * 4 + 3];
                            const bottomAlpha = dilatedData[((y + 1) * width + x) * 4 + 3];
                            const leftAlpha = dilatedData[(y * width + (x - 1)) * 4 + 3];
                            const rightAlpha = dilatedData[(y * width + (x + 1)) * 4 + 3];
                            
                            const avgAlpha = Math.round(
                                (alpha * 3 + topAlpha + bottomAlpha + leftAlpha + rightAlpha) / 7
                            );
                            dilatedData[idx + 3] = avgAlpha;
                        }
                    }
                }
                
                // Boost semi-transparent pixels with color
                for (let i = 0; i < dilatedData.length; i += 4) {
                    const alpha = dilatedData[i + 3];
                    if (alpha > 30 && alpha < 200) {
                        const r = dilatedData[i];
                        const g = dilatedData[i + 1];
                        const b = dilatedData[i + 2];
                        if (r + g + b > 50) {
                            dilatedData[i + 3] = Math.min(255, alpha * 1.15);
                        }
                    }
                }
                
                tempCtx.putImageData(new ImageData(dilatedData, width, height), 0, 0);
                tempCanvas.toBlob((processedBlob) => {
                    resolve(processedBlob);
                }, 'image/png');
            };
            resultImg.onerror = () => reject(new Error('Failed to load processed image'));
            resultImg.src = URL.createObjectURL(resultBlob);
        });
        
    } catch (error) {
        throw new Error('Failed to process image: ' + error.message);
    }
}

async function vectorizeBulkImage(imageBlob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            try {
                // Save current state of main canvas and SVG
                const savedCanvasWidth = canvas.width;
                const savedCanvasHeight = canvas.height;
                const savedSvgChildren = Array.from(svg.children);
                const savedSvgViewBox = svg.getAttribute('viewBox');
                const savedSvgWidth = svg.getAttribute('width');
                const savedSvgHeight = svg.getAttribute('height');
                const savedSvgStyle = svg.getAttribute('style');
                
                // Use MAIN canvas and SVG (same as individual conversion)
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                
                // Filter transparent pixels (EXACT same as restart())
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] < 10) {
                        data[i + 3] = 0;
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                
                // Clear SVG
                while (svg.firstChild) {
                    svg.removeChild(svg.firstChild);
                }
                
                svg.setAttribute('viewBox', '0 0 ' + img.width + ' ' + img.height);
                svg.setAttribute('width', img.width);
                svg.setAttribute('height', img.height);
                // Force transparent background - remove any fill or background color
                svg.removeAttribute('fill');
                svg.removeAttribute('background');
                svg.setAttribute('style', 'background: transparent !important;');
                svg.style.background = 'transparent';
                svg.style.backgroundColor = 'transparent';
                svg.style.fill = 'none';
                
                // Use stacked mode for background-removed images (better transparency handling)
                const hierarchicalMode = clustering_mode === 'color' ? 'stacked' : clustering_hierarchical;
                
                // Use optimized settings for background-removed images (better quality)
                const optimizedSettings = {
                    filter_speckle: defaultNoBgSettings.filter_speckle * defaultNoBgSettings.filter_speckle,
                    color_precision: 8 - defaultNoBgSettings.color_precision,
                    layer_difference: defaultNoBgSettings.layer_difference,
                    corner_threshold: deg2rad(defaultNoBgSettings.corner_threshold),
                    length_threshold: defaultNoBgSettings.length_threshold,
                    splice_threshold: deg2rad(defaultNoBgSettings.splice_threshold),
                };
                
                // Create converter using MAIN canvas and SVG with optimized settings
                // Use 'none' mode for pixel-accurate paths (no simplification)
                const converterParams = JSON.stringify({
                    'canvas_id': canvas.id,
                    'svg_id': svg.id,
                    'mode': 'none', // Pixel-accurate mode
                    'clustering_mode': clustering_mode,
                    'hierarchical': hierarchicalMode,
                    'corner_threshold': optimizedSettings.corner_threshold,
                    'length_threshold': optimizedSettings.length_threshold,
                    'max_iterations': 10,
                    'splice_threshold': optimizedSettings.splice_threshold,
                    'filter_speckle': optimizedSettings.filter_speckle,
                    'color_precision': optimizedSettings.color_precision,
                    'layer_difference': optimizedSettings.layer_difference,
                    'path_precision': globalpathprecision,
                });
                
                let converter;
                try {
                    converter = clustering_mode == 'color' ?
                        ColorImageConverter.new_with_string(converterParams) :
                        BinaryImageConverter.new_with_string(converterParams);
                    converter.init();
                } catch (error) {
                    // Restore saved state
                    canvas.width = savedCanvasWidth;
                    canvas.height = savedCanvasHeight;
                    reject(new Error('Failed to create converter: ' + error.message));
                    return;
                }
                
                // Run conversion - use same logic as ConverterRunner
                let tickCount = 0;
                const maxTicks = 100000;
                const runConversion = () => {
                    try {
                        if (tickCount++ > maxTicks) {
                            console.warn('Bulk conversion reached max ticks');
                        }
                        
                        let done = false;
                        const startTick = performance.now();
                        
                        while (!(done = converter.tick()) && performance.now() - startTick < 25) {
                            // Process multiple ticks per frame
                        }
                        
                        const progressValue = converter.progress();
                        
                        if (done || progressValue >= 100) {
                            // Wait for SVG to be fully populated
                            setTimeout(() => {
                                // CLEAN THE SVG DOM ELEMENT FIRST (just like single image does)
                                // AGGRESSIVELY remove ALL rectangles that could be backgrounds
                                const allRects = svg.querySelectorAll('rect');
                                allRects.forEach(rect => {
                                    const width = rect.getAttribute('width');
                                    const height = rect.getAttribute('height');
                                    const x = rect.getAttribute('x') || '0';
                                    const y = rect.getAttribute('y') || '0';
                                    const fill = rect.getAttribute('fill') || '';
                                    const style = rect.getAttribute('style') || '';
                                    const svgWidth = svg.getAttribute('width');
                                    const svgHeight = svg.getAttribute('height');
                                    
                                    // Check if it's a full-size rectangle
                                    const isFullWidth = width === '100%' || width === svgWidth || 
                                                       (parseFloat(width) >= parseFloat(svgWidth || 0) * 0.9);
                                    const isFullHeight = height === '100%' || height === svgHeight ||
                                                        (parseFloat(height) >= parseFloat(svgHeight || 0) * 0.9);
                                    const isAtOrigin = (x === '0' || !x) && (y === '0' || !y);
                                    
                                    // Check if fill is red (any shade)
                                    const fillLower = fill.toLowerCase();
                                    const isRed = fillLower.includes('red') || 
                                                  fillLower === '#ff0000' || fillLower === '#ff00' ||
                                                  fillLower.startsWith('#ff') && fillLower.length <= 7 ||
                                                  fillLower.includes('rgb(255') || fillLower.includes('rgb(255,0');
                                    
                                    // Remove if it's a background rectangle OR if it's red
                                    if ((isFullWidth && isFullHeight && isAtOrigin) || isRed) {
                                        rect.remove();
                                    }
                                });
                                
                                // Remove any fill/background from SVG element itself - check for red
                                const svgFill = svg.getAttribute('fill') || '';
                                const svgStyle = svg.getAttribute('style') || '';
                                if (svgFill.toLowerCase().includes('red') || svgFill.toLowerCase().includes('#ff')) {
                                    svg.removeAttribute('fill');
                                }
                                if (svgStyle.toLowerCase().includes('red') || svgStyle.toLowerCase().includes('#ff')) {
                                    svg.removeAttribute('style');
                                }
                                
                                svg.removeAttribute('fill');
                                svg.removeAttribute('background');
                                svg.style.background = 'transparent';
                                svg.style.backgroundColor = 'transparent';
                                svg.setAttribute('style', 'background: transparent !important;');
                                
                                // Double check - remove ANY red-colored elements
                                const allElements = svg.querySelectorAll('*');
                                allElements.forEach(el => {
                                    const fill = el.getAttribute('fill') || '';
                                    const style = el.getAttribute('style') || '';
                                    const fillLower = fill.toLowerCase();
                                    const styleLower = style.toLowerCase();
                                    
                                    if (fillLower.includes('red') || fillLower === '#ff0000' || 
                                        fillLower.startsWith('#ff') && fillLower.length <= 7 ||
                                        styleLower.includes('fill:') && (styleLower.includes('red') || styleLower.includes('#ff'))) {
                                        // Check if it's a background rectangle
                                        if (el.tagName === 'rect') {
                                            const width = el.getAttribute('width') || '';
                                            const height = el.getAttribute('height') || '';
                                            if (width === '100%' || height === '100%') {
                                                el.remove();
                                            }
                                        }
                                    }
                                });
                                
                                // NOW serialize the clean SVG (same as single image)
                                let svgString = new XMLSerializer().serializeToString(svg);
                                
                                // FINAL SAFETY CHECK: Parse the serialized SVG and remove ANY red backgrounds
                                // This ensures the SVG string is absolutely clean before saving
                                try {
                                    const finalCleanParser = new DOMParser();
                                    const finalCleanDoc = finalCleanParser.parseFromString(svgString, 'image/svg+xml');
                                    const finalCleanSvg = finalCleanDoc.documentElement;
                                    
                                    // Remove ALL background rectangles (any color, any size at origin)
                                    const finalRects = finalCleanSvg.querySelectorAll('rect');
                                    finalRects.forEach(rect => {
                                        const width = rect.getAttribute('width') || '';
                                        const height = rect.getAttribute('height') || '';
                                        const x = rect.getAttribute('x') || '0';
                                        const y = rect.getAttribute('y') || '0';
                                        const fill = rect.getAttribute('fill') || '';
                                        const style = rect.getAttribute('style') || '';
                                        
                                        const svgW = finalCleanSvg.getAttribute('width') || '';
                                        const svgH = finalCleanSvg.getAttribute('height') || '';
                                        
                                        // Check if it's a full-size rectangle at origin (background)
                                        const isFullWidth = width === '100%' || width === svgW || 
                                                           (parseFloat(width) >= parseFloat(svgW || 0) * 0.9);
                                        const isFullHeight = height === '100%' || height === svgH ||
                                                            (parseFloat(height) >= parseFloat(svgH || 0) * 0.9);
                                        const isAtOrigin = (x === '0' || !x) && (y === '0' || !y);
                                        
                                        // Check if it's red
                                        const fillLower = fill.toLowerCase();
                                        const styleLower = style.toLowerCase();
                                        const isRed = fillLower.includes('red') || fillLower === '#ff0000' || 
                                                      fillLower.startsWith('#ff') && fillLower.length <= 7 ||
                                                      fillLower.includes('rgb(255') ||
                                                      (styleLower.includes('fill:') && (styleLower.includes('red') || styleLower.includes('#ff')));
                                        
                                        // Remove if it's a background rectangle OR if it's red
                                        if ((isFullWidth && isFullHeight && isAtOrigin) || isRed) {
                                            rect.remove();
                                        }
                                    });
                                    
                                    // Remove red from SVG element itself
                                    finalCleanSvg.removeAttribute('fill');
                                    finalCleanSvg.removeAttribute('background');
                                    finalCleanSvg.removeAttribute('background-color');
                                    finalCleanSvg.setAttribute('style', 'background: transparent !important;');
                                    
                                    // Remove red from all child elements
                                    const finalAllElements = finalCleanSvg.querySelectorAll('*');
                                    finalAllElements.forEach(el => {
                                        const fill = el.getAttribute('fill') || '';
                                        const style = el.getAttribute('style') || '';
                                        const fillLower = fill.toLowerCase();
                                        const styleLower = style.toLowerCase();
                                        
                                        if (fillLower.includes('red') || fillLower === '#ff0000' || 
                                            fillLower.startsWith('#ff') && fillLower.length <= 7 ||
                                            (styleLower.includes('fill:') && (styleLower.includes('red') || styleLower.includes('#ff')))) {
                                            if (el.tagName === 'rect') {
                                                el.remove();
                                            } else {
                                                el.removeAttribute('fill');
                                                if (style) {
                                                    const newStyle = style.replace(/fill\s*:\s*[^;]+/gi, '').replace(/background[^;]*/gi, '').trim();
                                                    if (newStyle) {
                                                        el.setAttribute('style', newStyle);
                                                    } else {
                                                        el.removeAttribute('style');
                                                    }
                                                }
                                            }
                                        }
                                    });
                                    
                                    // Re-serialize the absolutely clean SVG
                                    svgString = new XMLSerializer().serializeToString(finalCleanSvg);
                                } catch (e) {
                                    console.warn('Error in final SVG cleanup:', e);
                                    // If parsing fails, at least try to remove red from the string
                                    svgString = svgString.replace(/fill\s*=\s*["']?#?ff[0-9a-fA-F]*["']?/gi, '');
                                    svgString = svgString.replace(/fill\s*:\s*#?ff[0-9a-fA-F]*/gi, '');
                                    svgString = svgString.replace(/fill\s*=\s*["']?red["']?/gi, '');
                                }
                                
                                // FINAL STRING-BASED CLEANUP: Remove any red that might still be in the string
                                // This is a last resort to ensure absolutely no red backgrounds
                                if (svgString.includes('fill="#ff') || svgString.includes('fill="#FF') || 
                                    svgString.includes('fill="red') || svgString.includes('fill="Red') ||
                                    svgString.includes('fill:#ff') || svgString.includes('fill:red') ||
                                    svgString.includes('background') && (svgString.includes('red') || svgString.includes('#ff'))) {
                                    // Remove red fills from the string
                                    svgString = svgString.replace(/fill\s*=\s*["']?#?ff[0-9a-fA-F]{0,6}["']?/gi, '');
                                    svgString = svgString.replace(/fill\s*:\s*#?ff[0-9a-fA-F]{0,6}/gi, '');
                                    svgString = svgString.replace(/fill\s*=\s*["']?red["']?/gi, '');
                                    svgString = svgString.replace(/fill\s*:\s*red/gi, '');
                                    svgString = svgString.replace(/background[^;]*red[^;]*/gi, 'background: transparent');
                                    svgString = svgString.replace(/background[^;]*#ff[^;]*/gi, 'background: transparent');
                                    
                                    // Remove full-size rect elements that might be backgrounds
                                    svgString = svgString.replace(/<rect[^>]*width\s*=\s*["']?100%["']?[^>]*>/gi, '');
                                    svgString = svgString.replace(/<rect[^>]*height\s*=\s*["']?100%["']?[^>]*>/gi, '');
                                    
                                    // Ensure SVG element has transparent background
                                    if (!svgString.includes('style="background: transparent')) {
                                        svgString = svgString.replace(/<svg([^>]*)>/, '<svg$1 style="background: transparent !important;">');
                                    }
                                }
                                
                                const childrenCount = svg.children ? svg.children.length : 0;
                                
                                console.log('Bulk conversion finished:', {
                                    svgLength: svgString ? svgString.length : 0,
                                    childrenCount: childrenCount
                                });
                                
                                if (!svgString || svgString.length < 100 || childrenCount === 0) {
                                    converter.free();
                                    // Restore saved state
                                    canvas.width = savedCanvasWidth;
                                    canvas.height = savedCanvasHeight;
                                    reject(new Error('SVG conversion produced empty result'));
                                    return;
                                }
                                
                                // For preview PNG: Create SVG with white background
                                // Parse the clean SVG string and add white background for preview only
                                const parser = new DOMParser();
                                const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
                                const svgElement = svgDoc.documentElement;
                                
                                // Create white background rectangle FOR PREVIEW ONLY
                                const bgRect = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'rect');
                                bgRect.setAttribute('width', '100%');
                                bgRect.setAttribute('height', '100%');
                                bgRect.setAttribute('fill', '#FFFFFF');
                                bgRect.setAttribute('x', '0');
                                bgRect.setAttribute('y', '0');
                                
                                // Insert white background as first child
                                if (svgElement.firstChild) {
                                    svgElement.insertBefore(bgRect, svgElement.firstChild);
                                } else {
                                    svgElement.appendChild(bgRect);
                                }
                                
                                // Serialize SVG with white background
                                const svgWithBg = new XMLSerializer().serializeToString(svgElement);
                                
                                // Convert SVG to PNG
                                const svgWidth = parseInt(svg.getAttribute('width')) || img.width;
                                const svgHeight = parseInt(svg.getAttribute('height')) || img.height;
                                
                                const pngCanvas = document.createElement('canvas');
                                pngCanvas.width = svgWidth;
                                pngCanvas.height = svgHeight;
                                const pngCtx = pngCanvas.getContext('2d', { willReadFrequently: true });
                                
                                // Use SVG with white background for preview
                                const svgBlob = new Blob([svgWithBg], {type: 'image/svg+xml;charset=utf-8'});
                                const svgUrl = URL.createObjectURL(svgBlob);
                                const svgImg = new Image();
                                
                                svgImg.onload = function() {
                                    // Draw SVG on a TRANSPARENT canvas first (to get the actual SVG content)
                                    const tempCanvas = document.createElement('canvas');
                                    tempCanvas.width = svgWidth;
                                    tempCanvas.height = svgHeight;
                                    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                                    
                                    // Clear to transparent
                                    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                                    
                                    // Draw SVG (this will include any red background from the SVG itself)
                                    tempCtx.drawImage(svgImg, 0, 0, svgWidth, svgHeight);
                                    
                                    // Now compose: white background + SVG content (but replace red background with white)
                                    // Fill with white background
                                    pngCtx.fillStyle = '#FFFFFF';
                                    pngCtx.fillRect(0, 0, pngCanvas.width, pngCanvas.height);
                                    
                                    // Get the SVG image data
                                    const svgImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                                    const svgData = svgImageData.data;
                                    
                                    // Replace red background pixels with white (more aggressive)
                                    for (let i = 0; i < svgData.length; i += 4) {
                                        const r = svgData[i];
                                        const g = svgData[i + 1];
                                        const b = svgData[i + 2];
                                        const a = svgData[i + 3];
                                        
                                        // If pixel is red (or very close to red) and opaque, replace with white
                                        // More aggressive detection - catch more shades of red
                                        if (a > 0 && r > 180 && g < 80 && b < 80) {
                                            svgData[i] = 255;     // R
                                            svgData[i + 1] = 255; // G
                                            svgData[i + 2] = 255; // B
                                            // Keep alpha
                                        }
                                    }
                                    
                                    // Put the modified image data back
                                    tempCtx.putImageData(svgImageData, 0, 0);
                                    
                                    // Draw the modified SVG on white background
                                    pngCtx.drawImage(tempCanvas, 0, 0, svgWidth, svgHeight);
                                    
                                    // Use the CLEAN svgString directly (already cleaned from DOM element above)
                                    // This is the same method as single image - just serialize the clean DOM element
                                    // Create transparent version for download (using CLEAN SVG without background)
                                    const transparentBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
                                    const transparentUrl = URL.createObjectURL(transparentBlob);
                                    const transparentImg = new Image();
                                    
                                    transparentImg.onload = function() {
                                        const transparentCanvas = document.createElement('canvas');
                                        transparentCanvas.width = svgWidth;
                                        transparentCanvas.height = svgHeight;
                                        const transparentCtx = transparentCanvas.getContext('2d', { willReadFrequently: true });
                                        transparentCtx.clearRect(0, 0, transparentCanvas.width, transparentCanvas.height);
                                        transparentCtx.drawImage(transparentImg, 0, 0, svgWidth, svgHeight);
                                        
                                        transparentCanvas.toBlob(function(transparentBlob) {
                                            pngCanvas.toBlob(function(previewBlob) {
                                                converter.free();
                                                URL.revokeObjectURL(svgUrl);
                                                URL.revokeObjectURL(transparentUrl);
                                                
                                                // Restore saved state
                                                canvas.width = savedCanvasWidth;
                                                canvas.height = savedCanvasHeight;
                                                
                                                resolve({
                                                    svgData: svgString, // CLEAN SVG (already cleaned from DOM element, same as single image)
                                                    pngBlob: transparentBlob, // Transparent for download
                                                    previewPngBlob: previewBlob // White background for preview
                                                });
                                            }, 'image/png');
                                        }, 'image/png');
                                    };
                                    
                                    transparentImg.onerror = function() {
                                        // Fallback: just use the preview version, but still use clean SVG
                                        pngCanvas.toBlob(function(previewBlob) {
                                            converter.free();
                                            URL.revokeObjectURL(svgUrl);
                                            URL.revokeObjectURL(transparentUrl);
                                            
                                            canvas.width = savedCanvasWidth;
                                            canvas.height = savedCanvasHeight;
                                            
                                            resolve({
                                                svgData: svgString, // Clean SVG (already cleaned from DOM element)
                                                pngBlob: previewBlob,
                                                previewPngBlob: previewBlob
                                            });
                                        }, 'image/png');
                                    };
                                    
                                    transparentImg.src = transparentUrl;
                                };
                                
                                svgImg.onerror = function() {
                                    converter.free();
                                    URL.revokeObjectURL(svgUrl);
                                    // Restore saved state
                                    canvas.width = savedCanvasWidth;
                                    canvas.height = savedCanvasHeight;
                                    reject(new Error('Failed to convert SVG to PNG'));
                                };
                                
                                svgImg.src = svgUrl;
                            }, 200);
                            return;
                        }
                        
                        // Continue conversion
                        setTimeout(runConversion, 1);
                    } catch (error) {
                        console.error('Bulk conversion error:', error);
                        converter.free();
                        // Restore saved state
                        canvas.width = savedCanvasWidth;
                        canvas.height = savedCanvasHeight;
                        reject(new Error('Conversion error: ' + error.message));
                    }
                };
                
                // Start conversion
                setTimeout(runConversion, 1);
                
            } catch (error) {
                reject(new Error('Failed to setup vectorization: ' + error.message));
            }
        };
        img.onerror = () => reject(new Error('Failed to load processed image'));
        img.src = URL.createObjectURL(imageBlob);
    });
}

// Display bulk results gallery
function displayBulkResults() {
    const gallery = document.getElementById('bulk-results-gallery');
    if (!gallery) return;
    
    gallery.innerHTML = '';
    gallery.classList.add('active');
    
    if (bulkResults.length === 0) {
        gallery.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No results to display</div>';
        return;
    }
    
    bulkResults.forEach((result, index) => {
        const item = document.createElement('div');
        item.className = 'bulk-result-item';
        item.dataset.index = index;
        
        // Create preview images - use PNG for vectorized preview (more reliable than SVG)
        const noBgUrl = URL.createObjectURL(result.noBgImage);
        // Always use preview PNG (with white background) if available, otherwise create one from SVG with white background
        let vectorizedUrl = '';
        if (result.previewPngBlob) {
            vectorizedUrl = URL.createObjectURL(result.previewPngBlob);
        } else if (result.svgData) {
            // Create SVG with white background for preview
            try {
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(result.svgData, 'image/svg+xml');
                const svgElement = svgDoc.documentElement;
                
                // Remove any existing background rectangles (including red ones)
                const allRects = svgElement.querySelectorAll('rect');
                allRects.forEach(rect => {
                    const width = rect.getAttribute('width');
                    const height = rect.getAttribute('height');
                    // Remove if it's a full-size background rectangle (any color)
                    if ((width === '100%' || width === svgElement.getAttribute('width')) && 
                        (height === '100%' || height === svgElement.getAttribute('height'))) {
                        rect.remove();
                    }
                });
                
                // Create white background rectangle
                const bgRect = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'rect');
                bgRect.setAttribute('width', '100%');
                bgRect.setAttribute('height', '100%');
                bgRect.setAttribute('fill', '#FFFFFF');
                bgRect.setAttribute('x', '0');
                bgRect.setAttribute('y', '0');
                
                // Insert white background as first child
                if (svgElement.firstChild) {
                    svgElement.insertBefore(bgRect, svgElement.firstChild);
                } else {
                    svgElement.appendChild(bgRect);
                }
                
                const svgWithBg = new XMLSerializer().serializeToString(svgElement);
                vectorizedUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgWithBg)));
            } catch (e) {
                console.error('Error creating SVG preview:', e);
                vectorizedUrl = result.svgPng ? URL.createObjectURL(result.svgPng) : '';
            }
        } else if (result.svgPng) {
            vectorizedUrl = URL.createObjectURL(result.svgPng);
        }
        
        item.innerHTML = 
            '<div class="bulk-result-header">' +
                '<div class="bulk-result-name" title="' + result.originalName + '">' + result.name + '</div>' +
                '<div class="bulk-result-actions">' +
                    '<button class="bulk-action-btn edit" data-index="' + index + '" data-action="edit">Edit</button>' +
                    '<button class="bulk-action-btn download" data-index="' + index + '" data-action="download">Download</button>' +
                '</div>' +
            '</div>' +
            '<div class="bulk-result-previews">' +
                '<div class="bulk-preview-card">' +
                    '<h4>No Background</h4>' +
                    '<img src="' + noBgUrl + '" alt="No background" class="bulk-preview-image" loading="lazy">' +
                '</div>' +
                '<div class="bulk-preview-card">' +
                    '<h4>Vectorized</h4>' +
                    (vectorizedUrl ? '<img src="' + vectorizedUrl + '" alt="Vectorized" class="bulk-preview-svg" loading="lazy">' : 
                    '<div style="padding: 20px; text-align: center; color: #999;">No vectorized image</div>') +
                '</div>' +
            '</div>';
        
        gallery.appendChild(item);
        
        // Add event listeners
        const editBtn = item.querySelector('[data-action="edit"]');
        const downloadBtn = item.querySelector('[data-action="download"]');
        
        editBtn.addEventListener('click', () => openBulkResultForEditing(index));
        downloadBtn.addEventListener('click', () => downloadBulkResult(index));
    });
}

// Open bulk result for editing in main editor
function openBulkResultForEditing(index) {
    const result = bulkResults[index];
    if (!result) return;
    
    // Load the original image (not the background-removed one) for editing
    const imgUrl = result.originalFile ? URL.createObjectURL(result.originalFile) : URL.createObjectURL(result.noBgImage);
    const isOriginalFile = !!result.originalFile;
    
    // Set as source - only mark as background removed if using noBgImage
    window.skipBgReset = true;
    if (!isOriginalFile) {
        bgRemoved = true;
        window.bgRemoved = true;
    } else {
        bgRemoved = false;
        window.bgRemoved = false;
    }
    
    // Load image
    const tempImg = new Image();
    tempImg.onload = function() {
        canvas.width = tempImg.width;
        canvas.height = tempImg.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempImg, 0, 0);
        
        // Clear SVG completely to remove any previous content (including any red backgrounds)
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }
        
        // Remove any background rectangles that might have been added
        const existingRects = svg.querySelectorAll('rect[width="100%"][height="100%"]');
        existingRects.forEach(rect => rect.remove());
        
        // Save as original image data for retouching
        originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Update UI - clear any previous SVG content
        img.src = imgUrl;
        svg.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
        svg.setAttribute('width', canvas.width);
        svg.setAttribute('height', canvas.height);
        svg.removeAttribute('style');
        svg.setAttribute('style', 'background: transparent !important;');
        svg.style.background = 'transparent';
        svg.style.backgroundColor = 'transparent';
        
        // Force clear any inline styles that might have red background
        svg.removeAttribute('fill');
        svg.removeAttribute('background-color');
        
        // Show preview
        droptext.style.display = 'none';
        previewContainer.style.display = 'grid';
        previewContainer.classList.add('active');
        imageLoaded = true;
        
        // Enable buttons
        convertBtn.disabled = false;
        removeBgBtn.disabled = false;
        if (isOriginalFile) {
            removeBgBtn.textContent = '🎨 Remove Background';
            removeBgBtn.style.background = '';
        } else {
            removeBgBtn.textContent = '✅ Background Removed';
            removeBgBtn.style.background = '#28a745 !important';
        }
        
        // Enable retouch buttons
        if (downloadNoBgBtn) {
            downloadNoBgBtn.style.opacity = '1';
            downloadNoBgBtn.style.pointerEvents = 'auto';
        }
        if (retouchBtn) {
            retouchBtn.disabled = false;
            retouchBtn.removeAttribute('disabled');
            retouchBtn.style.opacity = '1';
            retouchBtn.style.pointerEvents = 'auto';
            retouchBtn.style.cursor = 'pointer';
        }
        
        // Store the bulk result index for updating later
        window.currentBulkEditIndex = index;
        
        // Clear skip flag after a delay
        setTimeout(() => {
            window.skipBgReset = false;
        }, 1000);
        
        // Scroll to top to show editor
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Show notification
        bulkStatus.textContent = `✏️ Editing: ${result.name}. Make your changes and click "Convert to SVG" to update.`;
    };
    tempImg.onerror = () => {
        alert('Failed to load image for editing.');
        window.skipBgReset = false;
    };
    tempImg.src = imgUrl;
}

// Download individual bulk result
function downloadBulkResult(index) {
    const result = bulkResults[index];
    if (!result) return;
    
    // Create a zip with just this result
    const zip = new JSZip();
    zip.file('no-background/' + result.name + '.png', result.noBgImage);
    if (result.svgData) {
        zip.file('vectorized/' + result.name + '.svg', result.svgData);
    }
    if (result.svgPng) {
        zip.file('vectorized/' + result.name + '.png', result.svgPng);
    }
    
    zip.generateAsync({ type: 'blob' }).then(function(zipBlob) {
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.name + '-haidar-app.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });
}

// Update bulk result after editing
function updateBulkResultAfterEdit() {
    if (window.currentBulkEditIndex === undefined) return;
    
    const index = window.currentBulkEditIndex;
    const result = bulkResults[index];
    if (!result) return;
    
    // Update no-background image from canvas
    canvas.toBlob(function(blob) {
        result.noBgImage = blob;
        
        // Update SVG if conversion was done - get clean SVG without any background rectangles
        if (svg.children.length > 0) {
            // Clone SVG to remove any background rectangles (including red ones)
            const svgClone = svg.cloneNode(true);
            const allRects = svgClone.querySelectorAll('rect');
            allRects.forEach(rect => {
                const width = rect.getAttribute('width');
                const height = rect.getAttribute('height');
                const svgWidth = svgClone.getAttribute('width');
                const svgHeight = svgClone.getAttribute('height');
                // Remove if it's a full-size background rectangle (any color)
                if ((width === '100%' || width === svgWidth) && 
                    (height === '100%' || height === svgHeight)) {
                    rect.remove();
                }
            });
            
            let svgString = new XMLSerializer().serializeToString(svgClone);
            
            // FINAL SAFETY CHECK: Parse and clean the SVG string (same as vectorizeBulkImage)
            try {
                const finalCleanParser = new DOMParser();
                const finalCleanDoc = finalCleanParser.parseFromString(svgString, 'image/svg+xml');
                const finalCleanSvg = finalCleanDoc.documentElement;
                
                // Remove ALL background rectangles (any color, any size at origin)
                const finalRects = finalCleanSvg.querySelectorAll('rect');
                finalRects.forEach(rect => {
                    const width = rect.getAttribute('width') || '';
                    const height = rect.getAttribute('height') || '';
                    const x = rect.getAttribute('x') || '0';
                    const y = rect.getAttribute('y') || '0';
                    const fill = rect.getAttribute('fill') || '';
                    const style = rect.getAttribute('style') || '';
                    
                    const svgW = finalCleanSvg.getAttribute('width') || '';
                    const svgH = finalCleanSvg.getAttribute('height') || '';
                    
                    const isFullWidth = width === '100%' || width === svgW || 
                                       (parseFloat(width) >= parseFloat(svgW || 0) * 0.9);
                    const isFullHeight = height === '100%' || height === svgH ||
                                        (parseFloat(height) >= parseFloat(svgH || 0) * 0.9);
                    const isAtOrigin = (x === '0' || !x) && (y === '0' || !y);
                    
                    const fillLower = fill.toLowerCase();
                    const styleLower = style.toLowerCase();
                    const isRed = fillLower.includes('red') || fillLower === '#ff0000' || 
                                  fillLower.startsWith('#ff') && fillLower.length <= 7 ||
                                  fillLower.includes('rgb(255') ||
                                  (styleLower.includes('fill:') && (styleLower.includes('red') || styleLower.includes('#ff')));
                    
                    if ((isFullWidth && isFullHeight && isAtOrigin) || isRed) {
                        rect.remove();
                    }
                });
                
                // Remove red from SVG element itself
                finalCleanSvg.removeAttribute('fill');
                finalCleanSvg.removeAttribute('background');
                finalCleanSvg.removeAttribute('background-color');
                finalCleanSvg.setAttribute('style', 'background: transparent !important;');
                
                // Remove red from all child elements
                const finalAllElements = finalCleanSvg.querySelectorAll('*');
                finalAllElements.forEach(el => {
                    const fill = el.getAttribute('fill') || '';
                    const style = el.getAttribute('style') || '';
                    const fillLower = fill.toLowerCase();
                    const styleLower = style.toLowerCase();
                    
                    if (fillLower.includes('red') || fillLower === '#ff0000' || 
                        fillLower.startsWith('#ff') && fillLower.length <= 7 ||
                        (styleLower.includes('fill:') && (styleLower.includes('red') || styleLower.includes('#ff')))) {
                        if (el.tagName === 'rect') {
                            el.remove();
                        } else {
                            el.removeAttribute('fill');
                            if (style) {
                                const newStyle = style.replace(/fill\s*:\s*[^;]+/gi, '').replace(/background[^;]*/gi, '').trim();
                                if (newStyle) {
                                    el.setAttribute('style', newStyle);
                                } else {
                                    el.removeAttribute('style');
                                }
                            }
                        }
                    }
                });
                
                svgString = new XMLSerializer().serializeToString(finalCleanSvg);
            } catch (e) {
                console.warn('Error in final SVG cleanup (updateBulkResultAfterEdit):', e);
                svgString = svgString.replace(/fill\s*=\s*["']?#?ff[0-9a-fA-F]*["']?/gi, '');
                svgString = svgString.replace(/fill\s*:\s*#?ff[0-9a-fA-F]*/gi, '');
                svgString = svgString.replace(/fill\s*=\s*["']?red["']?/gi, '');
            }
            
            // FINAL STRING-BASED CLEANUP
            if (svgString.includes('fill="#ff') || svgString.includes('fill="#FF') || 
                svgString.includes('fill="red') || svgString.includes('fill="Red') ||
                svgString.includes('fill:#ff') || svgString.includes('fill:red') ||
                svgString.includes('background') && (svgString.includes('red') || svgString.includes('#ff'))) {
                svgString = svgString.replace(/fill\s*=\s*["']?#?ff[0-9a-fA-F]{0,6}["']?/gi, '');
                svgString = svgString.replace(/fill\s*:\s*#?ff[0-9a-fA-F]{0,6}/gi, '');
                svgString = svgString.replace(/fill\s*=\s*["']?red["']?/gi, '');
                svgString = svgString.replace(/fill\s*:\s*red/gi, '');
                svgString = svgString.replace(/background[^;]*red[^;]*/gi, 'background: transparent');
                svgString = svgString.replace(/background[^;]*#ff[^;]*/gi, 'background: transparent');
                svgString = svgString.replace(/<rect[^>]*width\s*=\s*["']?100%["']?[^>]*>/gi, '');
                svgString = svgString.replace(/<rect[^>]*height\s*=\s*["']?100%["']?[^>]*>/gi, '');
                if (!svgString.includes('style="background: transparent')) {
                    svgString = svgString.replace(/<svg([^>]*)>/, '<svg$1 style="background: transparent !important;">');
                }
            }
            
            result.svgData = svgString;
            
            // Regenerate preview PNG with white background (for gallery display)
            const svgWidth = parseInt(svg.getAttribute('width')) || canvas.width;
            const svgHeight = parseInt(svg.getAttribute('height')) || canvas.height;
            
            // Create SVG with white background for preview
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
            const svgElement = svgDoc.documentElement;
            
            const bgRect = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bgRect.setAttribute('width', '100%');
            bgRect.setAttribute('height', '100%');
            bgRect.setAttribute('fill', '#FFFFFF');
            bgRect.setAttribute('x', '0');
            bgRect.setAttribute('y', '0');
            
            if (svgElement.firstChild) {
                svgElement.insertBefore(bgRect, svgElement.firstChild);
            } else {
                svgElement.appendChild(bgRect);
            }
            
            const svgWithBg = new XMLSerializer().serializeToString(svgElement);
            const svgBlob = new Blob([svgWithBg], {type: 'image/svg+xml;charset=utf-8'});
            const svgUrl = URL.createObjectURL(svgBlob);
            const svgImg = new Image();
            
            svgImg.onload = function() {
                const pngCanvas = document.createElement('canvas');
                pngCanvas.width = svgWidth;
                pngCanvas.height = svgHeight;
                const pngCtx = pngCanvas.getContext('2d');
                pngCtx.fillStyle = '#FFFFFF';
                pngCtx.fillRect(0, 0, pngCanvas.width, pngCanvas.height);
                pngCtx.drawImage(svgImg, 0, 0, svgWidth, svgHeight);
                
                pngCanvas.toBlob(function(previewBlob) {
                    result.previewPngBlob = previewBlob;
                    URL.revokeObjectURL(svgUrl);
                    
                    // Refresh gallery
                    displayBulkResults();
                    
                    // Clear edit index
                    window.currentBulkEditIndex = undefined;
                    
                    bulkStatus.textContent = `✅ Updated: ${result.name}`;
                }, 'image/png');
            };
            
            svgImg.onerror = function() {
                URL.revokeObjectURL(svgUrl);
                // Refresh gallery even if preview generation fails
                displayBulkResults();
                window.currentBulkEditIndex = undefined;
                bulkStatus.textContent = `✅ Updated: ${result.name}`;
            };
            
            svgImg.src = svgUrl;
        } else {
            // No SVG, just refresh gallery
            displayBulkResults();
            window.currentBulkEditIndex = undefined;
            bulkStatus.textContent = `✅ Updated: ${result.name}`;
        }
    }, 'image/png');
}

// Note: updateBulkResultAfterEdit is called from runner.run().then() in the restart() function

// Download all results as ZIP
bulkDownloadBtn.addEventListener('click', async function() {
    if (bulkResults.length === 0) {
        alert('No results to download. Please process images first.');
        return;
    }
    
    bulkDownloadBtn.disabled = true;
    bulkDownloadBtn.textContent = '⏳ Creating ZIP...';
    
    try {
        const zip = new JSZip();
        const noBgFolder = zip.folder('no-background');
        const svgFolder = zip.folder('vectorized');
        
        for (const result of bulkResults) {
            // Add no-background PNG
            noBgFolder.file(result.name + '.png', result.noBgImage);
            
            // Add vectorized SVG
            if (result.svgData) {
                svgFolder.file(result.name + '.svg', result.svgData);
            }
            
            // Add vectorized PNG
            if (result.svgPng) {
                svgFolder.file(result.name + '.png', result.svgPng);
            }
        }
        
        // Generate ZIP
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // Download
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'haidar-app-bulk-results-' + new Date().toISOString().slice(0, 19).replace(/:/g, '').replace('T', ' ') + '.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        bulkDownloadBtn.disabled = false;
        bulkDownloadBtn.textContent = '💾 Download All Results (ZIP)';
        bulkStatus.textContent = `✅ Downloaded ZIP with ${bulkResults.length} images!`;
        
    } catch (error) {
        console.error('Error creating ZIP:', error);
        alert('Error creating ZIP file: ' + error.message);
        bulkDownloadBtn.disabled = false;
        bulkDownloadBtn.textContent = '💾 Download All Results (ZIP)';
    }
});

