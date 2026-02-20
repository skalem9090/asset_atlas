/**
 * Tests for AssetOrganizer
 */

import * as fc from 'fast-check';
import { AssetOrganizer } from '../AssetOrganizer';
import { AssetCache } from '../AssetCache';
import { UsageTracker } from '../UsageTracker';
import { CachedAsset, AssetMetadata } from '../types';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

describe('AssetOrganizer', () => {
  let cache: AssetCache;
  let usageTracker: UsageTracker;
  let organizer: AssetOrganizer;

  beforeEach(async () => {
    cache = new AssetCache();
    await cache.initialize();
    usageTracker = new UsageTracker(cache);
    organizer = new AssetOrganizer(cache, usageTracker);
  });

  afterEach(() => {
    cache.close();
  });

  describe('Delete operations', () => {
    test('should delete a single asset and remove from cache', async () => {
      // Create and add an asset
      const metadata: AssetMetadata = {
        path: '/assets/delete-me.png',
        name: 'delete-me.png',
        type: 'image',
        size: 2048,
        modifiedDate: Date.now()
      };

      await cache.upsertAsset(metadata);
      const asset = await cache.getAsset(metadata.path);
      expect(asset).not.toBeNull();

      // Delete the asset
      const result = await organizer.deleteAssets([asset!]);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);

      // Verify it's removed from cache
      const deletedAsset = await cache.getAsset(metadata.path);
      expect(deletedAsset).toBeNull();
    });

    // Feature: asset-atlas, Property 23: Deletion removes from cache
    test('Property 23: Deletion removes from cache', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              path: fc.string({ minLength: 5, maxLength: 50 }).map(s => `/assets/${s}.png`),
              name: fc.string({ minLength: 1, maxLength: 30 }).map(s => `${s}.png`),
              type: fc.constant('image' as const),
              size: fc.integer({ min: 1, max: 10000000 }),
              modifiedDate: fc.integer({ min: 1000000000000, max: Date.now() })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (metadataArray) => {
            // Add all assets to cache
            for (const metadata of metadataArray) {
              await cache.upsertAsset(metadata);
            }

            // Verify all assets are in cache
            const assetsBeforeDeletion = await Promise.all(
              metadataArray.map(m => cache.getAsset(m.path))
            );
            const allExistBefore = assetsBeforeDeletion.every(a => a !== null);
            expect(allExistBefore).toBe(true);

            // Get the cached assets for deletion
            const cachedAssets = assetsBeforeDeletion.filter(a => a !== null) as CachedAsset[];

            // Delete all assets
            const result = await organizer.deleteAssets(cachedAssets);

            // Verify deletion was successful
            expect(result.success).toBe(cachedAssets.length);

            // Property: All deleted assets should be removed from cache
            const assetsAfterDeletion = await Promise.all(
              metadataArray.map(m => cache.getAsset(m.path))
            );
            const allRemovedFromCache = assetsAfterDeletion.every(a => a === null);

            return allRemovedFromCache;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should handle bulk deletion correctly', async () => {
      // Create multiple assets
      const assets: AssetMetadata[] = [
        { path: '/assets/bulk1.png', name: 'bulk1.png', type: 'image', size: 1024, modifiedDate: Date.now() },
        { path: '/assets/bulk2.png', name: 'bulk2.png', type: 'image', size: 2048, modifiedDate: Date.now() },
        { path: '/assets/bulk3.png', name: 'bulk3.png', type: 'image', size: 3072, modifiedDate: Date.now() }
      ];

      for (const metadata of assets) {
        await cache.upsertAsset(metadata);
      }

      const cachedAssets = await Promise.all(
        assets.map(m => cache.getAsset(m.path))
      );

      // Delete all assets
      const result = await organizer.deleteAssets(cachedAssets.filter(a => a !== null) as CachedAsset[]);

      expect(result.success).toBe(3);
      expect(result.totalSize).toBe(1024 + 2048 + 3072);

      // Verify all are removed from cache
      for (const metadata of assets) {
        const asset = await cache.getAsset(metadata.path);
        expect(asset).toBeNull();
      }
    });
  });

  describe('Dry run operations', () => {
    // Feature: asset-atlas, Property 22: Dry run doesn't modify filesystem
    test('Property 22: Dry run doesn\'t modify filesystem', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              path: fc.string({ minLength: 5, maxLength: 50 }).map(s => `/assets/${s}.png`),
              name: fc.string({ minLength: 1, maxLength: 30 }).map(s => `${s}.png`),
              type: fc.constant('image' as const),
              size: fc.integer({ min: 1, max: 10000000 }),
              modifiedDate: fc.integer({ min: 1000000000000, max: Date.now() })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (metadataArray) => {
            // Add all assets to cache
            for (const metadata of metadataArray) {
              await cache.upsertAsset(metadata);
            }

            // Get cached assets before dry run
            const assetsBeforeDryRun = await Promise.all(
              metadataArray.map(m => cache.getAsset(m.path))
            );
            const cachedAssets = assetsBeforeDryRun.filter(a => a !== null) as CachedAsset[];

            // Perform dry run
            const dryRunResult = await organizer.dryRunDelete(cachedAssets);

            // Verify dry run returns correct information
            expect(dryRunResult.totalCount).toBe(cachedAssets.length);
            expect(dryRunResult.totalSize).toBe(
              cachedAssets.reduce((sum, a) => sum + a.size, 0)
            );

            // Property: Dry run should NOT modify the cache or filesystem
            const assetsAfterDryRun = await Promise.all(
              metadataArray.map(m => cache.getAsset(m.path))
            );

            // All assets should still exist in cache
            const allStillExist = assetsAfterDryRun.every(a => a !== null);

            // Verify asset data is unchanged
            const dataUnchanged = assetsAfterDryRun.every((afterAsset, index) => {
              const beforeAsset = assetsBeforeDryRun[index];
              if (!afterAsset || !beforeAsset) return false;
              return (
                afterAsset.path === beforeAsset.path &&
                afterAsset.size === beforeAsset.size &&
                afterAsset.name === beforeAsset.name
              );
            });

            return allStillExist && dataUnchanged;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should calculate correct totals in dry run', async () => {
      const assets: AssetMetadata[] = [
        { path: '/assets/dry1.png', name: 'dry1.png', type: 'image', size: 500, modifiedDate: Date.now() },
        { path: '/assets/dry2.png', name: 'dry2.png', type: 'image', size: 1500, modifiedDate: Date.now() },
        { path: '/assets/dry3.png', name: 'dry3.png', type: 'image', size: 2000, modifiedDate: Date.now() }
      ];

      for (const metadata of assets) {
        await cache.upsertAsset(metadata);
      }

      const cachedAssets = await Promise.all(
        assets.map(m => cache.getAsset(m.path))
      );

      const result = await organizer.dryRunDelete(cachedAssets.filter(a => a !== null) as CachedAsset[]);

      expect(result.totalCount).toBe(3);
      expect(result.totalSize).toBe(4000);
      expect(result.assets.length).toBe(3);

      // Verify assets still exist in cache
      for (const metadata of assets) {
        const asset = await cache.getAsset(metadata.path);
        expect(asset).not.toBeNull();
      }
    });
  });
});
