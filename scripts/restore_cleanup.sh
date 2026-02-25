#!/bin/bash

# Argonaut Cleanup Restoration Script
# This script moves files back from the 'rollback' folder to their original locations.

PROJECT_ROOT="/Users/hmenon/Documents/Projects/Argonaut"
ROLLBACK_DIR="$PROJECT_ROOT/rollback"

if [ ! -d "$ROLLBACK_DIR" ]; then
    echo "Error: Rollback directory not found at $ROLLBACK_DIR"
    exit 1
fi

echo "Starting restoration from $ROLLBACK_DIR..."

restore_item() {
    local src="$ROLLBACK_DIR/$1"
    local dest="$PROJECT_ROOT/$1"
    
    if [ -e "$src" ]; then
        echo "Restoring $1..."
        mkdir -p "$(dirname "$dest")"
        mv "$src" "$dest"
    else
        echo "Skipping $1 (not found in rollback)"
    fi
}

# Restore identified items
restore_item "argus_core/node_modules"
restore_item "console/argonaut_console/node_modules"
restore_item "argus_core/.next"
restore_item "console/argonaut_console/.next"
restore_item "argus_core/demo_bundles_archive"

# Restore root files if they exist in rollback
[ -f "$ROLLBACK_DIR/.DS_Store" ] && mv "$ROLLBACK_DIR/.DS_Store" "$PROJECT_ROOT/.DS_Store"

echo "Restoration complete."
