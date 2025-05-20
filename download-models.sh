#!/bin/bash

# Create models directory if it doesn't exist
mkdir -p public/models

# Base URL for the models
BASE_URL="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

# List of model files to download
MODELS=(
    "tiny_face_detector_model-weights_manifest.json"
    "tiny_face_detector_model-shard1"
    "face_landmark_68_model-weights_manifest.json"
    "face_landmark_68_model-shard1"
    "face_recognition_model-weights_manifest.json"
    "face_recognition_model-shard1"
    "face_expression_model-weights_manifest.json"
    "face_expression_model-shard1"
)

# Download each model file
for model in "${MODELS[@]}"; do
    echo "Downloading $model..."
    curl -L "$BASE_URL/$model" -o "public/models/$model"
done

echo "All model files have been downloaded successfully!" 