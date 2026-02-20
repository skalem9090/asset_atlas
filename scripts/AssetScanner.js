/**
 * Asset Scanner - Discovers and indexes assets from the file system
 */
class AssetScanner {
    constructor(cache) {
        this.excludedDirectories = [];
        this.supportedExtensions = {
            image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
            audio: ['mp3', 'ogg', 'wav', 'flac'],
            video: ['mp4', 'webm']
        };
        this.cache = cache;
    }
    /**
     * Sets the excluded directories
     */
    setExcludedDirectories(directories) {
        this.excludedDirectories = directories;
    }
    /**
     * Gets the excluded directories
     */
    getExcludedDirectories() {
        return [...this.excludedDirectories];
    }
    /**
     * Checks if a path should be excluded from scanning
     */
    isPathExcluded(path) {
        // Normalize path separators
        const normalizedPath = path.replace(/\\/g, '/');
        for (const excludedDir of this.excludedDirectories) {
            const normalizedExcluded = excludedDir.replace(/\\/g, '/');
            // Check if path starts with excluded directory
            if (normalizedPath.startsWith(normalizedExcluded)) {
                return true;
            }
            // Check if path contains excluded directory as a segment
            if (normalizedPath.includes(`/${normalizedExcluded}/`) ||
                normalizedPath.includes(`/${normalizedExcluded}`)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Checks if a file is a supported asset type
     */
    isSupportedAsset(path) {
        const extension = this.getFileExtension(path);
        for (const type of Object.keys(this.supportedExtensions)) {
            const extensions = this.supportedExtensions[type];
            if (extensions.includes(extension)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Gets the asset type from a file path
     */
    getAssetType(path) {
        const extension = this.getFileExtension(path);
        for (const [type, extensions] of Object.entries(this.supportedExtensions)) {
            if (extensions.includes(extension)) {
                return type;
            }
        }
        return null;
    }
    /**
     * Extracts metadata from an asset file
     */
    async extractMetadata(path) {
        const type = this.getAssetType(path);
        if (!type) {
            throw new Error(`Unsupported asset type: ${path}`);
        }
        const name = this.getFileName(path);
        // Get file size using HTTP HEAD request
        let size = 0;
        try {
            const response = await fetch(path, { method: 'HEAD' });
            const contentLength = response.headers.get('content-length');
            if (contentLength) {
                size = parseInt(contentLength, 10);
            }
        }
        catch (error) {
            console.warn(`Asset Atlas | Could not get file size for ${path}:`, error);
        }
        const metadata = {
            path,
            name,
            type,
            size,
            modifiedDate: Date.now()
        };
        // For images, try to extract dimensions
        if (type === 'image') {
            try {
                metadata.dimensions = await this.extractImageDimensions(path);
            }
            catch (error) {
                console.warn(`Asset Atlas | Could not extract dimensions for ${path}`);
            }
        }
        return metadata;
    }
    /**
     * Generates a thumbnail for an image asset
     */
    async generateThumbnail(path) {
        // In a real implementation, this would:
        // 1. Load the image
        // 2. Create a canvas element
        // 3. Draw the image scaled down
        // 4. Return base64 encoded thumbnail
        // For now, return a placeholder
        return `data:image/png;base64,placeholder-for-${path}`;
    }
    /**
     * Scans directories for assets and updates the cache
     */
    async scan(directories, incremental = true) {
        const startTime = Date.now();
        const result = {
            assetsFound: 0,
            assetsAdded: 0,
            assetsUpdated: 0,
            assetsRemoved: 0,
            duration: 0,
            errors: []
        };
        try {
            // Filter out excluded directories
            const filteredDirectories = directories.filter(dir => !this.isPathExcluded(dir));
            if (filteredDirectories.length < directories.length) {
                console.log(`Asset Atlas | Excluded ${directories.length - filteredDirectories.length} directories from scan`);
            }
            console.log(`Asset Atlas | Scanning ${filteredDirectories.length} directories...`);
            // Scan each directory
            for (const directory of filteredDirectories) {
                try {
                    await this.scanDirectory(directory, incremental, result);
                }
                catch (error) {
                    console.error(`Asset Atlas | Error scanning directory ${directory}:`, error);
                    result.errors.push(`${directory}: ${error.message}`);
                }
            }
            result.duration = Date.now() - startTime;
            console.log(`Asset Atlas | Scan complete in ${result.duration}ms`);
        }
        catch (error) {
            result.errors.push(error.message);
        }
        return result;
    }
    /**
     * Recursively scans a directory for assets
     */
    async scanDirectory(path, incremental, result) {
        // Check if path is excluded
        if (this.isPathExcluded(path)) {
            console.log(`Asset Atlas | Skipping excluded path: ${path}`);
            return;
        }
        try {
            // Use Foundry's FilePicker to browse the directory
            if (typeof FilePicker === 'undefined') {
                console.warn('Asset Atlas | FilePicker not available, skipping scan');
                return;
            }
            console.log(`Asset Atlas | Browsing directory: ${path}`);
            const browseResult = await FilePicker.browse("data", path);
            console.log(`Asset Atlas | Browse result for ${path}:`, {
                files: browseResult.files?.length || 0,
                dirs: browseResult.dirs?.length || 0
            });
            // Process files in this directory
            if (browseResult.files && Array.isArray(browseResult.files)) {
                console.log(`Asset Atlas | Found ${browseResult.files.length} files in ${path}`);
                for (const filePath of browseResult.files) {
                    if (this.isSupportedAsset(filePath)) {
                        console.log(`Asset Atlas | Processing supported asset: ${filePath}`);
                        await this.processAsset(filePath, incremental, result);
                    }
                    else {
                        console.log(`Asset Atlas | Skipping unsupported file: ${filePath}`);
                    }
                }
            }
            // Recursively scan subdirectories
            if (browseResult.dirs && Array.isArray(browseResult.dirs)) {
                console.log(`Asset Atlas | Found ${browseResult.dirs.length} subdirectories in ${path}`);
                for (const subdir of browseResult.dirs) {
                    await this.scanDirectory(subdir, incremental, result);
                }
            }
        }
        catch (error) {
            // Directory might not exist or be inaccessible
            console.warn(`Asset Atlas | Error browsing ${path}:`, error);
            if (!error?.message?.includes('ENOENT') && !error?.message?.includes('does not exist')) {
                result.errors.push(`${path}: ${error?.message || 'Unknown error'}`);
            }
        }
    }
    /**
     * Processes a single asset file
     */
    async processAsset(path, incremental, result) {
        result.assetsFound++;
        try {
            // Check if asset already exists in cache
            const existing = await this.cache.getAsset(path);
            if (existing && incremental) {
                // For incremental scan, check if file has been modified
                // For now, we'll skip checking modification dates and just count as found
                return;
            }
            // Extract metadata
            const metadata = await this.extractMetadata(path);
            // Add to cache
            await this.cache.upsertAsset(metadata);
            if (existing) {
                result.assetsUpdated++;
            }
            else {
                result.assetsAdded++;
            }
            // Log progress every 10 assets
            if (result.assetsFound % 10 === 0) {
                console.log(`Asset Atlas | Processed ${result.assetsFound} assets...`);
            }
        }
        catch (error) {
            const errorMessage = error.message;
            console.error(`Asset Atlas | Error processing ${path}:`, error);
            // Handle specific error types
            if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
                // File was deleted between scan and processing - mark as missing
                console.warn(`Asset Atlas | File missing: ${path}`);
                result.errors.push(`${path}: File not found (may have been deleted)`);
            }
            else if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
                // Permission error - log and continue
                console.warn(`Asset Atlas | Permission denied: ${path}`);
                result.errors.push(`${path}: Permission denied`);
            }
            else if (errorMessage.includes('corrupted') || errorMessage.includes('invalid')) {
                // Corrupted file - log and continue
                console.warn(`Asset Atlas | Corrupted file: ${path}`);
                result.errors.push(`${path}: File appears to be corrupted`);
            }
            else {
                // Unknown error
                result.errors.push(`${path}: ${errorMessage}`);
            }
        }
    }
    /**
     * Gets the file extension from a path
     */
    getFileExtension(path) {
        const parts = path.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }
    /**
     * Gets the file name from a path
     */
    getFileName(path) {
        const parts = path.split('/');
        return parts[parts.length - 1];
    }
    /**
     * Extracts image dimensions
     */
    async extractImageDimensions(path) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.width, height: img.height });
            };
            img.onerror = () => {
                resolve(undefined);
            };
            // Set the image source to the asset path
            img.src = path;
            // Timeout after 5 seconds
            setTimeout(() => resolve(undefined), 5000);
        });
    }
    /**
     * Extracts media duration
     */
    async extractMediaDuration(path) {
        // In a real implementation, this would load the media and get its duration
        // For now, return undefined
        return undefined;
    }
}

export { AssetScanner };
//# sourceMappingURL=AssetScanner.js.map
