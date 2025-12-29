// Load BodyPix model (optimized for background removal, similar to rembg)
async function loadSegmentationModel() {
    if (bodyPixModel) {
        return bodyPixModel;
    }
    
    if (modelLoading) {
        // Wait for existing load
        while (modelLoading) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return bodyPixModel;
    }
    
    modelLoading = true;
    try {
        console.log('Loading BodyPix AI model (optimized for background removal, similar to rembg)...');
        // BodyPix is specifically designed for person segmentation and background removal
        // It works well for general objects too, and is better than DeepLab for this use case
        bodyPixModel = await bodyPix.load({
            architecture: 'MobileNetV1',
            outputStride: 16,
            multiplier: 0.75,
            quantBytes: 2
        });
        console.log('✅ BodyPix AI model loaded successfully');
        modelLoading = false;
        return bodyPixModel;
    } catch (error) {
        console.error('Failed to load BodyPix model:', error);
        modelLoading = false;
        throw error;
    }
}


