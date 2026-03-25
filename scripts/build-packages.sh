#!/bin/bash
set -e

# Build all packages in ./packages/ subdirectory
for pkg_dir in packages/*/; do
  pkg_json="${pkg_dir}package.json"
  if [ -f "$pkg_json" ]; then
    pkg_name=$(node -p "require('./$pkg_json').name" 2>/dev/null)
    if [ -n "$pkg_name" ] && [ "$pkg_name" != "null" ]; then
      # Check if package has a build script
      has_build=$(node -p "Object.prototype.hasOwnProperty.call(require('./$pkg_json').scripts || {}, 'build')" 2>/dev/null)
      if [ "$has_build" = "true" ]; then
        echo "Building $pkg_name..."
        npm run build -w "$pkg_name"
      else
        echo "Skipping $pkg_name (no build script)"
      fi
    fi
  fi
done

# Build all modules in ./packages/modules/ subdirectory
for pkg_dir in packages/modules/*/; do
  pkg_json="${pkg_dir}package.json"
  if [ -f "$pkg_json" ]; then
    pkg_name=$(node -p "require('./$pkg_json').name" 2>/dev/null)
    if [ -n "$pkg_name" ] && [ "$pkg_name" != "null" ]; then
      # Check if package has a build script
      has_build=$(node -p "Object.prototype.hasOwnProperty.call(require('./$pkg_json').scripts || {}, 'build')" 2>/dev/null)
      if [ "$has_build" = "true" ]; then
        echo "Building $pkg_name..."
        npm run build -w "$pkg_name"
      else
        echo "Skipping $pkg_name (no build script)"
      fi
    fi
  fi
done

echo "All packages built."
