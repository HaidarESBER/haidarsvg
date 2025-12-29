use wasm_bindgen::prelude::*;
use visioncortex::{Color, ColorImage, PathSimplifyMode};
use visioncortex::color_clusters::{Clusters, Runner, RunnerConfig, HIERARCHICAL_MAX, IncrementalBuilder, KeyingAction};

use crate::canvas::*;
use crate::svg::*;

use serde::Deserialize;
use super::util;

const KEYING_THRESHOLD: f32 = 0.2;

#[derive(Debug, Deserialize)]
pub struct ColorImageConverterParams {
    pub canvas_id: String,
    pub svg_id: String,
    pub mode: String,
    pub hierarchical: String,
    pub corner_threshold: f64,
    pub length_threshold: f64,
    pub max_iterations: usize,
    pub splice_threshold: f64,
    pub filter_speckle: usize,
    pub color_precision: i32,
    pub layer_difference: i32,
    pub path_precision: u32,
}

#[wasm_bindgen]
pub struct ColorImageConverter {
    canvas: Canvas,
    svg: Svg,
    stage: Stage,
    counter: usize,
    mode: PathSimplifyMode,
    params: ColorImageConverterParams,
}

pub enum Stage {
    New,
    Clustering(IncrementalBuilder),
    Reclustering(IncrementalBuilder),
    Vectorize(Clusters),
}

impl ColorImageConverter {
    pub fn new(params: ColorImageConverterParams) -> Self {
        let canvas = Canvas::new_from_id(&params.canvas_id);
        let svg = Svg::new_from_id(&params.svg_id);
        Self {
            canvas,
            svg,
            stage: Stage::New,
            counter: 0,
            mode: util::path_simplify_mode(&params.mode),
            params,
        }
    }
}

#[wasm_bindgen]
impl ColorImageConverter {
    pub fn new_with_string(params: String) -> Self {
        let params: ColorImageConverterParams = serde_json::from_str(params.as_str()).unwrap();
        Self::new(params)
    }

    pub fn init(&mut self) {
        let width = self.canvas.width() as u32;
        let height = self.canvas.height() as u32;
        let mut image = self.canvas.get_image_data_as_color_image(0, 0, width, height);

        // For cutout mode with transparent backgrounds, we need to:
        // 1. Replace transparent pixels with a key color that won't be in the image
        // 2. Use KeyingAction::Discard so the key color is removed from the final SVG
        // This ensures transparent backgrounds stay transparent
        let (key_color, keying_action) = if self.params.hierarchical == "cutout" {
            // For cutout mode, replace transparent pixels with a key color and discard it
            // This prevents black or red backgrounds from appearing
            if let Ok(key_color) = Self::find_unused_color_in_image(&image) {
                // Replace transparent pixels with the key color
                // Also replace black pixels (0,0,0) with low alpha, as they might be transparent pixels
                // that were converted to black by the canvas API
                for y in 0..height as usize {
                    for x in 0..width as usize {
                        let pixel = image.get_pixel(x, y);
                        if pixel.a == 0 || (pixel.a < 10 && pixel.r == 0 && pixel.g == 0 && pixel.b == 0) {
                            image.set_pixel(x, y, &key_color);
                        }
                    }
                }
                // Use Discard so the key color is removed from final SVG (keeps transparency)
                (key_color, KeyingAction::Discard)
            } else {
                // Fallback: use a very specific color that's extremely unlikely to be in any image
                // Use a specific shade of cyan that's not a standard color
                let fallback_key = Color::new(1, 254, 253); // Very specific cyan shade
                for y in 0..height as usize {
                    for x in 0..width as usize {
                        let pixel = image.get_pixel(x, y);
                        if pixel.a == 0 || (pixel.a < 10 && pixel.r == 0 && pixel.g == 0 && pixel.b == 0) {
                            image.set_pixel(x, y, &fallback_key);
                        }
                    }
                }
                (fallback_key, KeyingAction::Discard)
            }
        } else if Self::should_key_image(&image) {
            // For stacked mode, use a key color and discard it
            if let Ok(key_color) = Self::find_unused_color_in_image(&image) {
                for y in 0..height as usize {
                    for x in 0..width as usize {
                        let pixel = image.get_pixel(x, y);
                        if pixel.a == 0 || (pixel.a < 10 && pixel.r == 0 && pixel.g == 0 && pixel.b == 0) {
                            image.set_pixel(x, y, &key_color);
                        }
                    }
                }
                (key_color, KeyingAction::Discard)
            } else {
                // Fallback: use a very specific color
                let fallback_key = Color::new(1, 254, 253);
                for y in 0..height as usize {
                    for x in 0..width as usize {
                        let pixel = image.get_pixel(x, y);
                        if pixel.a == 0 || (pixel.a < 10 && pixel.r == 0 && pixel.g == 0 && pixel.b == 0) {
                            image.set_pixel(x, y, &fallback_key);
                        }
                    }
                }
                (fallback_key, KeyingAction::Discard)
            }
        } else {
            (Color::default(), KeyingAction::Discard)
        };

        let runner = Runner::new(RunnerConfig {
            diagonal: self.params.layer_difference == 0,
            hierarchical: HIERARCHICAL_MAX,
            batch_size: 25600,
            good_min_area: self.params.filter_speckle,
            good_max_area: (width * height) as usize,
            is_same_color_a: self.params.color_precision,
            is_same_color_b: 1,
            deepen_diff: self.params.layer_difference,
            hollow_neighbours: 1,
            key_color,
            keying_action,
        }, image);
        self.stage = Stage::Clustering(runner.start());
    }

    pub fn tick(&mut self) -> bool {
        match &mut self.stage {
            Stage::New => {
                panic!("uninitialized");
            },
            Stage::Clustering(builder) => {
                if builder.tick() {
                    match self.params.hierarchical.as_str() {
                        "stacked" => {
                            self.stage = Stage::Vectorize(builder.result());
                        },
                        "cutout" => {
                            let clusters = builder.result();
                            let view = clusters.view();
                            let image = view.to_color_image();
                            let runner = Runner::new(RunnerConfig {
                                diagonal: false,
                                hierarchical: 64,
                                batch_size: 25600,
                                good_min_area: 0,
                                good_max_area: (image.width * image.height) as usize,
                                is_same_color_a: 0,
                                is_same_color_b: 1,
                                deepen_diff: 0,
                                hollow_neighbours: 0,
                                key_color: Default::default(),
                                keying_action: KeyingAction::Discard,
                            }, image);
                            self.stage = Stage::Reclustering(runner.start());
                        },
                        _ => panic!("unknown hierarchical `{}`", self.params.hierarchical)
                    }
                }
                false
            },
            Stage::Reclustering(builder) => {
                if builder.tick() {
                    self.stage = Stage::Vectorize(builder.result())
                }
                false
            },
            Stage::Vectorize(clusters) => {
                let view = clusters.view();
                if self.counter < view.clusters_output.len() {
                    let cluster = view.get_cluster(view.clusters_output[self.counter]);
                    let paths = cluster.to_compound_path(
                        &view, false, self.mode,
                        self.params.corner_threshold,
                        self.params.length_threshold,
                        self.params.max_iterations,
                        self.params.splice_threshold
                    );
                    self.svg.prepend_path(
                        &paths,
                        &cluster.residue_color(),
                        Some(self.params.path_precision),
                    );
                    self.counter += 1;
                    false
                } else {
                    true
                }
            }
        }
    }

    pub fn progress(&self) -> i32 {
        (match &self.stage {
            Stage::New => {
                0
            },
            Stage::Clustering(builder) => {
                builder.progress() / 2
            },
            Stage::Reclustering(_builder) => {
                50
            },
            Stage::Vectorize(clusters) => {
                50 + 50 * self.counter as u32 / clusters.view().clusters_output.len() as u32
            }
        }) as i32
    }

    fn color_exists_in_image(img: &ColorImage, color: Color) -> bool {
        for y in 0..img.height {
            for x in 0..img.width {
                let pixel_color = img.get_pixel(x, y);
                if pixel_color.r == color.r && pixel_color.g == color.g && pixel_color.b == color.b {
                    return true
                }
            }
        }
        false
    }

    fn find_unused_color_in_image(img: &ColorImage) -> Result<Color, String> {
        // Avoid red as first choice - it causes visible red backgrounds in vectorized images
        // Try less common colors first, then fall back to others
        let special_colors = IntoIterator::into_iter([
            Color::new(0,   255, 255), // Cyan first (less common)
            Color::new(255, 0,   255), // Magenta second
            Color::new(0,   255, 0),   // Green third
            Color::new(0,   0,   255), // Blue fourth
            Color::new(255, 255, 0),  // Yellow fifth
            Color::new(128, 128, 128), // Gray sixth
            Color::new(255, 0,   0),   // Red LAST (only if nothing else works)
        ]);
        for color in special_colors {
            if !Self::color_exists_in_image(img, color) {
                return Ok(color);
            }
        }
        Err(String::from("unable to find unused color in image to use as key"))
    }

    fn should_key_image(img: &ColorImage) -> bool {
        if img.width == 0 || img.height == 0 {
            return false;
        }

        let threshold = ((img.width * 2) as f32 * KEYING_THRESHOLD) as usize;
        let mut num_transparent_pixels = 0;
        let y_positions = [0, img.height / 4, img.height / 2, 3 * img.height / 4, img.height - 1];
        for y in y_positions {
            for x in 0..img.width {
                if img.get_pixel(x, y).a == 0 {
                    num_transparent_pixels += 1;
                }
                if num_transparent_pixels >= threshold {
                    return true;
                }
            }
        }
    
        false
    }
}

