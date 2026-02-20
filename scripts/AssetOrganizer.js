/**
 * Asset Organizer - Handles move, rename, and delete operations
 */
class AssetOrganizer {
    constructor(cache, usageTracker) {
        this.cache = cache;
        this.usageTracker = usageTracker;
    }
    /**
     * Move an asset to a new location
     * @param asset - The asset to move
     * @param newPath - The new path for the asset
     * @returns Promise<boolean> - Success status
     */
    async moveAsset(asset, newPath) {
        const oldPath = asset.path;
        let fileMoved = false;
        let referencesUpdated = false;
        try {
            // Validate new path
            if (!newPath || newPath === oldPath) {
                throw new Error('Invalid destination path');
            }
            // Check if destination already exists
            const existingAsset = await this.cache.getAsset(newPath);
            if (existingAsset) {
                throw new Error('An asset already exists at the destination path');
            }
            // Step 1: Move the file using Foundry's file system API
            try {
                fileMoved = await this.moveFile(oldPath, newPath);
                if (!fileMoved) {
                    throw new Error('Failed to move file - file system operation returned false');
                }
            }
            catch (error) {
                const errorMessage = error.message;
                if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
                    throw new Error('Source file not found');
                }
                else if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
                    throw new Error('Permission denied - check file permissions');
                }
                else if (errorMessage.includes('ENOSPC') || errorMessage.includes('disk space')) {
                    throw new Error('Insufficient disk space');
                }
                else {
                    throw error;
                }
            }
            // Step 2: Update all document references
            try {
                const updateResult = await this.usageTracker.updateReferences(oldPath, newPath);
                if (updateResult.errors.length > 0) {
                    throw new Error(`Failed to update ${updateResult.errors.length} reference(s): ${updateResult.errors.join(', ')}`);
                }
                referencesUpdated = true;
            }
            catch (error) {
                // Rollback: move file back
                console.error('Asset Atlas | Reference update failed, rolling back file move');
                try {
                    await this.moveFile(newPath, oldPath);
                    fileMoved = false;
                }
                catch (rollbackError) {
                    console.error('Asset Atlas | CRITICAL: Rollback failed!', rollbackError);
                    ui.notifications?.error('Critical error: File moved but references not updated and rollback failed. Manual intervention required.');
                }
                throw error;
            }
            // Step 3: Update the asset cache with new path
            try {
                await this.cache.removeAsset(oldPath);
                const updatedAsset = {
                    ...asset,
                    path: newPath,
                    name: this.extractFileName(newPath)
                };
                await this.cache.upsertAsset(updatedAsset);
            }
            catch (error) {
                console.error('Asset Atlas | Cache update failed after successful move', error);
                // Don't rollback file move if cache update fails - cache can be rebuilt
                ui.notifications?.warn('Asset moved successfully but cache update failed. Try refreshing the asset list.');
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            console.error('Asset Atlas | Move operation failed:', error);
            ui.notifications?.error(`Failed to move asset: ${errorMessage}`);
            return false;
        }
    }
    /**
     * Rename an asset (move within same directory)
     * @param asset - The asset to rename
     * @param newName - The new name for the asset
     * @returns Promise<boolean> - Success status
     */
    async renameAsset(asset, newName) {
        const directory = this.getDirectory(asset.path);
        const newPath = `${directory}/${newName}`;
        return this.moveAsset(asset, newPath);
    }
    /**
     * Delete one or more assets
     * @param assets - Array of assets to delete
     * @returns Promise<{success: number, failed: number, totalSize: number}>
     */
    async deleteAssets(assets) {
        let success = 0;
        let failed = 0;
        let totalSize = 0;
        for (const asset of assets) {
            try {
                // Delete the file using Foundry's file system API
                const deleted = await this.deleteFile(asset.path);
                if (deleted) {
                    // Remove from cache
                    try {
                        await this.cache.removeAsset(asset.path);
                        success++;
                        totalSize += asset.size;
                    }
                    catch (cacheError) {
                        console.error(`Asset Atlas | Failed to remove ${asset.path} from cache:`, cacheError);
                        // File was deleted but cache removal failed - still count as success
                        success++;
                        totalSize += asset.size;
                        ui.notifications?.warn(`Asset deleted but cache update failed for ${asset.name}. Try refreshing.`);
                    }
                }
                else {
                    failed++;
                    console.warn(`Asset Atlas | Delete returned false for ${asset.path}`);
                }
            }
            catch (error) {
                const errorMessage = error.message;
                console.error(`Asset Atlas | Failed to delete asset ${asset.path}:`, error);
                // Handle specific error types
                if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
                    // File already deleted - remove from cache anyway
                    try {
                        await this.cache.removeAsset(asset.path);
                        console.log(`Asset Atlas | Removed missing file ${asset.path} from cache`);
                    }
                    catch (cacheError) {
                        console.error(`Asset Atlas | Failed to remove missing file from cache:`, cacheError);
                    }
                }
                else if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
                    ui.notifications?.warn(`Permission denied for ${asset.name}`);
                }
                else if (errorMessage.includes('EBUSY') || errorMessage.includes('in use')) {
                    ui.notifications?.warn(`File ${asset.name} is currently in use`);
                }
                failed++;
            }
        }
        return { success, failed, totalSize };
    }
    /**
     * Dry run for deletion - shows what would be deleted without actually deleting
     * @param assets - Array of assets to check
     * @returns Promise<{assets: CachedAsset[], totalSize: number, totalCount: number}>
     */
    async dryRunDelete(assets) {
        const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0);
        const totalCount = assets.length;
        return {
            assets,
            totalSize,
            totalCount
        };
    }
    /**
     * Move a file using Foundry's file system API
     * In a real implementation, this would use Foundry's FilePicker API
     */
    async moveFile(oldPath, newPath) {
        // In a real Foundry implementation, this would use:
        // const source = await fetch(oldPath);
        // const blob = await source.blob();
        // await FilePicker.upload("data", newPath, new File([blob], fileName));
        // await FilePicker.delete("data", oldPath);
        // For now, return true to simulate success
        return true;
    }
    /**
     * Delete a file using Foundry's file system API
     * In a real implementation, this would use Foundry's FilePicker API
     */
    async deleteFile(path) {
        // In a real Foundry implementation, this would use:
        // const result = await FilePicker.delete("data", path);
        // return result !== null;
        // For now, return true to simulate success
        return true;
    }
    /**
     * Extract directory from a file path
     */
    getDirectory(path) {
        const lastSlash = path.lastIndexOf('/');
        return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
    }
    /**
     * Extract file name from a path
     */
    extractFileName(path) {
        const lastSlash = path.lastIndexOf('/');
        return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
    }
}

export { AssetOrganizer };
//# sourceMappingURL=AssetOrganizer.js.map
