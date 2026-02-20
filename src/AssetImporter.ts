/**
 * Asset Importer - Handles importing assets from library to world folders
 */

import { AssetCache } from './AssetCache';
import { AssetAtlasFolder } from './AssetAtlasFolder';
import { CachedAsset, AssetType } from './types';

export interface ImportOptions {
  copy?: boolean; // If true, copy the file. If false, create a reference
  overwrite?: boolean; // If true, overwrite existing files
  preserveStructure?: boolean; // If true, maintain subfolder structure
}

export interface ImportResult {
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
  importedPaths: string[];
}

export class AssetImporter {
  private cache: AssetCache;
  private folderManager: AssetAtlasFolder;

  constructor(cache: AssetCache, folderManager: AssetAtlasFolder) {
    this.cache = cache;
    this.folderManager = folderManager;
  }

  /**
   * Import assets from library to a world folder
   */
  async importToWorld(
    assets: CachedAsset[],
    worldName: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      importedPaths: []
    };

    const { copy = true, overwrite = false, preserveStructure = false } = options;

    for (const asset of assets) {
      try {
        // Check if asset is from library
        if (!this.folderManager.isLibraryPath(asset.path)) {
          result.skipped++;
          result.errors.push(`Asset ${asset.path} is not in library`);
          continue;
        }

        // Determine destination path
        const destPath = this.getDestinationPath(asset, worldName, preserveStructure);

        // Check if destination already exists
        const existing = await this.cache.getAsset(destPath);
        if (existing && !overwrite) {
          result.skipped++;
          continue;
        }

        // Copy or link the file
        if (copy) {
          await this.copyAsset(asset.path, destPath);
        } else {
          // For now, we'll copy anyway since linking is complex
          await this.copyAsset(asset.path, destPath);
        }

        // Add to cache
        await this.cache.upsertAsset({
          ...asset,
          path: destPath,
          modifiedDate: Date.now()
        });

        result.success++;
        result.importedPaths.push(destPath);
      } catch (error) {
        result.failed++;
        result.errors.push(`Failed to import ${asset.path}: ${(error as Error).message}`);
      }
    }

    return result;
  }

  /**
   * Import a single asset from library to world
   */
  async importSingleAsset(
    asset: CachedAsset,
    worldName: string,
    options: ImportOptions = {}
  ): Promise<string | null> {
    const result = await this.importToWorld([asset], worldName, options);
    return result.success > 0 ? result.importedPaths[0] : null;
  }

  /**
   * Get the destination path for an imported asset
   */
  private getDestinationPath(
    asset: CachedAsset,
    worldName: string,
    preserveStructure: boolean
  ): string {
    const worldTypePath = this.folderManager.getWorldTypePath(worldName, asset.type);

    if (preserveStructure) {
      // Extract subfolder structure from library path
      const libraryTypePath = this.folderManager.getLibraryTypePath(asset.type);
      const relativePath = asset.path.substring(libraryTypePath.length + 1);
      return `${worldTypePath}/${relativePath}`;
    } else {
      // Just use the filename
      return `${worldTypePath}/${asset.name}`;
    }
  }

  /**
   * Copy an asset file
   * In a real Foundry implementation, this would use FilePicker
   */
  private async copyAsset(sourcePath: string, destPath: string): Promise<void> {
    // In a real Foundry implementation:
    // const source = await fetch(sourcePath);
    // const blob = await source.blob();
    // const fileName = destPath.split('/').pop();
    // const directory = destPath.substring(0, destPath.lastIndexOf('/'));
    // await FilePicker.upload("data", directory, new File([blob], fileName));

    // For now, simulate success
    console.log(`Copied ${sourcePath} to ${destPath}`);
  }

  /**
   * Get all library assets
   */
  async getLibraryAssets(type?: AssetType): Promise<CachedAsset[]> {
    const allAssets = await this.cache.searchAssets({});
    
    return allAssets.filter(asset => {
      const isLibrary = this.folderManager.isLibraryPath(asset.path);
      const matchesType = !type || asset.type === type;
      return isLibrary && matchesType;
    });
  }

  /**
   * Get all world assets
   */
  async getWorldAssets(worldName: string, type?: AssetType): Promise<CachedAsset[]> {
    const allAssets = await this.cache.searchAssets({});
    const worldPath = this.folderManager.getWorldPath(worldName);
    
    return allAssets.filter(asset => {
      const isWorld = asset.path.startsWith(worldPath);
      const matchesType = !type || asset.type === type;
      return isWorld && matchesType;
    });
  }
}
