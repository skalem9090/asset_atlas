/**
 * Tests for AssetCache
 */

import * as fc from 'fast-check';
import { AssetCache } from '../AssetCache';
import { AssetMetadata, CachedAsset } from '../types';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

describe('AssetCache', () => {
  let cache: AssetCache;

  beforeEach(async () => {
    cache = new AssetCache();
    await cache.initialize();
  });

  afterEach(() => {
    cache.close();
  });

  describe('Basic CRUD operations', () => {
    test('should upsert and retrieve an asset', async () => {
      const metadata: AssetMetadata = {
        path: '/assets/test.png',
        name: 'test.png',
        type: 'image',
        size: 1024,
        modifiedDate: Date.now()
      };

      await cache.upsertAsset(metadata);
      const retrieved = await cache.getAsset(metadata.path);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.path).toBe(metadata.path);
      expect(retrieved!.name).toBe(metadata.name);
      expect(retrieved!.type).toBe(metadata.type);
    });

    test('should return null for non-existent asset', async () => {
      const result = await cache.getAsset('/non/existent/path.png');
      expect(result).toBeNull();
    });

    test('should remove an asset', async () => {
      const metadata: AssetMetadata = {
        path: '/assets/remove-me.png',
        name: 'remove-me.png',
        type: 'image',
        size: 512,
        modifiedDate: Date.now()
      };

      await cache.upsertAsset(metadata);
      const removed = await cache.removeAsset(metadata.path);
      expect(removed).toBe(true);

      const retrieved = await cache.getAsset(metadata.path);
      expect(retrieved).toBeNull();
    });

    test('should return false when removing non-existent asset', async () => {
      const removed = await cache.removeAsset('/non/existent.png');
      expect(removed).toBe(false);
    });
  });

  describe('Property-based tests', () => {
    // Feature: asset-atlas, Property 25: Settings persist across sessions
    test('cache persistence - assets remain after reinitialization', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              path: fc.string({ minLength: 1, maxLength: 100 }),
              name: fc.string({ minLength: 1, maxLength: 50 }).map(s => `${s}.png`),
              type: fc.constant('image' as const),
              size: fc.nat({ max: 10000000 }),
              modifiedDate: fc.nat()
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (assetsData) => {
            // Ensure unique paths by adding index
            const assets = assetsData.map((asset, idx) => ({
              ...asset,
              path: `/assets/${asset.path}-${idx}.png`
            }));

            // Insert assets
            for (const asset of assets) {
              await cache.upsertAsset(asset);
            }

            // Close and reinitialize
            cache.close();
            cache = new AssetCache();
            await cache.initialize();

            // Verify all assets are still present
            for (const asset of assets) {
              const retrieved = await cache.getAsset(asset.path);
              if (retrieved === null) {
                return false;
              }
              if (retrieved.path !== asset.path || retrieved.name !== asset.name) {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Search and filter property tests', () => {
    // Feature: asset-atlas, Property 4: Search filters by name correctly
    test('search filters assets by name case-insensitively', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              path: fc.string({ minLength: 1 }).map(s => `/assets/${s}.png`),
              name: fc.string({ minLength: 1, maxLength: 50 }),
              type: fc.constant('image' as const),
              size: fc.nat(),
              modifiedDate: fc.nat()
            }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.string({ minLength: 1, maxLength: 10 }),
          async (assets, query) => {
            // Insert assets
            for (const asset of assets) {
              await cache.upsertAsset(asset);
            }

            // Search with query
            const results = await cache.searchAssets({ query });

            // All results should contain the query (case-insensitive)
            return results.every(asset =>
              asset.name.toLowerCase().includes(query.toLowerCase())
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: asset-atlas, Property 5: Tag filter requires all selected tags
    test('tag filter returns only assets with all selected tags', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              path: fc.string({ minLength: 1 }).map(s => `/assets/${s}.png`),
              name: fc.string({ minLength: 1 }),
              type: fc.constant('image' as const),
              size: fc.nat(),
              modifiedDate: fc.nat(),
              tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
          async (assetsData, selectedTags) => {
            // Insert assets with tags
            for (const assetData of assetsData) {
              const metadata: AssetMetadata = {
                path: assetData.path,
                name: assetData.name,
                type: assetData.type,
                size: assetData.size,
                modifiedDate: assetData.modifiedDate
              };
              await cache.upsertAsset(metadata);
              const asset = await cache.getAsset(assetData.path);
              if (asset) {
                asset.tags = assetData.tags;
                // Directly update with tags
                const transaction = (cache as any).db.transaction(['assets'], 'readwrite');
                const store = transaction.objectStore('assets');
                store.put(asset);
                await new Promise(resolve => transaction.oncomplete = resolve);
              }
            }

            // Search with tag filter
            const results = await cache.searchAssets({ tags: selectedTags });

            // All results should have ALL selected tags
            return results.every(asset =>
              selectedTags.every(tag => asset.tags.includes(tag))
            );
          }
        ),
        { numRuns: 50 }
      );
    }, 10000);

    // Feature: asset-atlas, Property 6: Size filter respects boundaries
    test('size filter respects min and max boundaries', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              path: fc.string({ minLength: 1 }).map(s => `/assets/${s}.png`),
              name: fc.string({ minLength: 1 }),
              type: fc.constant('image' as const),
              size: fc.nat({ max: 10000000 }),
              modifiedDate: fc.nat()
            }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.nat({ max: 5000000 }),
          fc.nat({ max: 5000000 }),
          async (assets, min, max) => {
            const minSize = Math.min(min, max);
            const maxSize = Math.max(min, max);

            // Insert assets
            for (const asset of assets) {
              await cache.upsertAsset(asset);
            }

            // Search with size filter
            const results = await cache.searchAssets({ minSize, maxSize });

            // All results should be within size range
            return results.every(asset =>
              asset.size >= minSize && asset.size <= maxSize
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: asset-atlas, Property 12: Unused filter shows only zero-usage assets
    test('unused filter returns only assets with zero usage count', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              path: fc.string({ minLength: 1 }).map(s => `/assets/${s}.png`),
              name: fc.string({ minLength: 1 }),
              type: fc.constant('image' as const),
              size: fc.nat(),
              modifiedDate: fc.nat(),
              usageCount: fc.nat({ max: 10 })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (assetsData) => {
            // Insert assets with varying usage counts
            for (const assetData of assetsData) {
              const metadata: AssetMetadata = {
                path: assetData.path,
                name: assetData.name,
                type: assetData.type,
                size: assetData.size,
                modifiedDate: assetData.modifiedDate
              };
              await cache.upsertAsset(metadata);
              await cache.updateUsage(assetData.path, {
                scenes: [],
                journals: [],
                actors: [],
                count: assetData.usageCount
              });
            }

            // Search with unusedOnly filter
            const results = await cache.searchAssets({ unusedOnly: true });

            // All results should have usage count of 0
            return results.every(asset => asset.usage.count === 0);
          }
        ),
        { numRuns: 50 }
      );
    }, 10000);

    // Feature: asset-atlas, Property 10: Document references are tracked
    test('usage tracking records document references correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            path: fc.string({ minLength: 1 }).map(s => `/assets/${s}.png`),
            name: fc.string({ minLength: 1 }),
            type: fc.constant('image' as const),
            size: fc.nat(),
            modifiedDate: fc.nat()
          }),
          fc.array(fc.uuid(), { maxLength: 5 }),
          fc.array(fc.uuid(), { maxLength: 5 }),
          fc.array(fc.uuid(), { maxLength: 5 }),
          async (assetData, scenes, journals, actors) => {
            // Insert asset
            await cache.upsertAsset(assetData);

            // Update usage with document references
            const usage = {
              scenes,
              journals,
              actors,
              count: scenes.length + journals.length + actors.length
            };
            await cache.updateUsage(assetData.path, usage);

            // Retrieve and verify
            const retrieved = await cache.getAsset(assetData.path);
            if (!retrieved) return false;

            // Verify all document references are tracked
            const scenesMatch = scenes.every(s => retrieved.usage.scenes.includes(s));
            const journalsMatch = journals.every(j => retrieved.usage.journals.includes(j));
            const actorsMatch = actors.every(a => retrieved.usage.actors.includes(a));
            const countMatch = retrieved.usage.count === usage.count;

            return scenesMatch && journalsMatch && actorsMatch && countMatch;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Update operations', () => {
    test('should update existing asset on upsert', async () => {
      const metadata: AssetMetadata = {
        path: '/assets/update-me.png',
        name: 'update-me.png',
        type: 'image',
        size: 1024,
        modifiedDate: Date.now()
      };

      await cache.upsertAsset(metadata);

      // Update with new size
      const updated: AssetMetadata = {
        ...metadata,
        size: 2048,
        modifiedDate: Date.now()
      };

      await cache.upsertAsset(updated);

      const retrieved = await cache.getAsset(metadata.path);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.size).toBe(2048);
    });

    test('should update usage information', async () => {
      const metadata: AssetMetadata = {
        path: '/assets/used.png',
        name: 'used.png',
        type: 'image',
        size: 1024,
        modifiedDate: Date.now()
      };

      await cache.upsertAsset(metadata);

      const usage = {
        scenes: ['scene1', 'scene2'],
        journals: ['journal1'],
        actors: [],
        count: 3
      };

      await cache.updateUsage(metadata.path, usage);

      const retrieved = await cache.getAsset(metadata.path);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.usage.count).toBe(3);
      expect(retrieved!.usage.scenes).toEqual(['scene1', 'scene2']);
    });
  });
});
