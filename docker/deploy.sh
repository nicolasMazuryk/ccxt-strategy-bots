#!/bin/bash

aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin 000000000000.dkr.ecr.eu-central-1.amazonaws.com

# Bot names to be build and pushed to ECR
# BOTS=("grid_bot_spot_stable")
BOTS=("grid_bot_spot_stable" "grid_bot_spot_infinity" "grid_bot_futures" "grid_bot_futures_infinity")

for BOT in "${BOTS[@]}"; do
    echo "Building and pushing $BOT..."
    
    docker build -f "./docker/Dockerfile.$BOT" -t "000000000000.dkr.ecr.eu-central-1.amazonaws.com/$BOT:latest" .
    
    docker push "000000000000.dkr.ecr.eu-central-1.amazonaws.com/$BOT:latest"
done

echo "All images have been pushed to ECR successfully!"