/**
 * Asset Atlas Folder Manager
 * Manages the dedicated folder structure for Asset Atlas
 */
class AssetAtlasFolder {
    constructor() {
        this.baseFolder = 'asset-atlas';
        this.libraryFolder = 'library';
        this.worldsFolder = 'worlds';
    }
    /**
     * Get the base Asset Atlas folder path
     */
    getBasePath() {
        return this.baseFolder;
    }
    /**
     * Get the global library path
     */
    getLibraryPath() {
        return `${this.baseFolder}/${this.libraryFolder}`;
    }
    /**
     * Get the library path for a specific asset type
     */
    getLibraryTypePath(type) {
        return `${this.getLibraryPath()}/${type}s`;
    }
    /**
     * Get the world folder path
     */
    getWorldPath(worldName) {
        return `${this.baseFolder}/${this.worldsFolder}/${worldName}`;
    }
    /**
     * Get the world path for a specific asset type
     */
    getWorldTypePath(worldName, type) {
        return `${this.getWorldPath(worldName)}/${type}s`;
    }
    /**
     * Get all standard paths that should be created
     */
    getStandardPaths(worldName) {
        const paths = [
            this.getBasePath(),
            this.getLibraryPath(),
            this.getLibraryTypePath('image'),
            this.getLibraryTypePath('audio'),
            this.getLibraryTypePath('video')
        ];
        if (worldName) {
            // Add the worlds folder first, then the specific world folder
            paths.push(`${this.baseFolder}/${this.worldsFolder}`, this.getWorldPath(worldName), this.getWorldTypePath(worldName, 'image'), this.getWorldTypePath(worldName, 'audio'), this.getWorldTypePath(worldName, 'video'));
        }
        return paths;
    }
    /**
     * Initialize the folder structure
     * Creates all necessary directories using Foundry's FilePicker API
     */
    async initializeFolders(worldName) {
        const paths = this.getStandardPaths(worldName);
        const result = {
            created: [],
            existing: [],
            errors: []
        };
        // Sort paths by depth to ensure parent directories are created first
        const sortedPaths = paths.sort((a, b) => {
            const depthA = a.split('/').length;
            const depthB = b.split('/').length;
            return depthA - depthB;
        });
        for (const path of sortedPaths) {
            try {
                // Use Foundry's FilePicker to create directory
                // Support both v13+ namespaced and legacy global FilePicker
                const FilePickerClass = (foundry?.applications?.apps?.FilePicker || window.FilePicker);
                if (typeof FilePickerClass !== 'undefined') {
                    await FilePickerClass.createDirectory("data", path, {});
                    result.created.push(path);
                    console.log(`Asset Atlas | Created directory: ${path}`);
                }
                else {
                    // Fallback for testing environment
                    console.log(`Asset Atlas | Would create directory: ${path}`);
                    result.created.push(path);
                }
            }
            catch (error) {
                // Directory might already exist, which is fine
                if (error?.message?.includes('EEXIST') || error?.message?.includes('exists')) {
                    result.existing.push(path);
                    console.log(`Asset Atlas | Directory already exists: ${path}`);
                }
                else {
                    result.errors.push(`${path}: ${error?.message || 'Unknown error'}`);
                    console.warn(`Asset Atlas | Error creating directory ${path}:`, error);
                }
            }
        }
        return result;
    }
    /**
     * Check if a path is in the Asset Atlas folder structure
     */
    isAssetAtlasPath(path) {
        return path.startsWith(this.baseFolder);
    }
    /**
     * Check if a path is in the global library
     */
    isLibraryPath(path) {
        return path.startsWith(this.getLibraryPath());
    }
    /**
     * Check if a path is in a world folder
     */
    isWorldPath(path) {
        return path.startsWith(`${this.baseFolder}/${this.worldsFolder}`);
    }
    /**
     * Extract world name from a world path
     */
    getWorldNameFromPath(path) {
        if (!this.isWorldPath(path))
            return null;
        const prefix = `${this.baseFolder}/${this.worldsFolder}/`;
        const remainder = path.substring(prefix.length);
        const firstSlash = remainder.indexOf('/');
        return firstSlash >= 0 ? remainder.substring(0, firstSlash) : remainder;
    }
    /**
     * Get the asset type from a path
     */
    getAssetTypeFromPath(path) {
        if (path.includes('/images/'))
            return 'image';
        if (path.includes('/audios/'))
            return 'audio';
        if (path.includes('/videos/'))
            return 'video';
        return null;
    }
}

export { AssetAtlasFolder };
//# sourceMappingURL=AssetAtlasFolder.js.map
