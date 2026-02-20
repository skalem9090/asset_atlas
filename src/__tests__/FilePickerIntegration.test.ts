/**
 * Tests for FilePicker Integration
 */

import * as fc from 'fast-check';
import { AssetCache } from '../AssetCache';
import { TagManager } from '../TagManager';
import { UsageTracker } from '../UsageTracker';
import { CachedAsset, AssetMetadata } from '../types';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

describe('FilePickerIntegration', () => {
  let cache: AssetCache;
  let tagManager: TagManager;
  let usageTracker: UsageTracker;

  beforeEach(async () => {
    cache = new AssetCache();
    await cache.initialize();

    tagManager = new TagManager();
    await tagManager.initialize();

    usageTracker = new UsageTracker(cache);
  });

  afterEach(() => {
    cache.close();
    tagManager.close();
  });

  describe('Property-based tests', () => {
    // Feature: asset-atlas, Property 17: Asset selection returns correct path
    test('asset selection returns the exact path from cache', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              path: fc.string({ minLength: 1, maxLength: 100 }).map(s => `/assets/${s}.png`),
              name: fc.string({ minLength: 1, maxLength: 50 }),
              type: fc.constantFrom('image' as const, 'audio' as const, 'video' as const),
              size: fc.nat({ max: 10000000 }),
              modifiedDate: fc.nat()
            }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.nat(),
          async (assetsData, selectionIndex) => {
            // Ensure unique paths
            const assets = assetsData.map((asset, idx) => ({
              ...asset,
              path: `/assets/test-${idx}-${asset.name}`
            }));

            if (assets.length === 0) return true;

            // Insert assets into cache
            for (const asset of assets) {
              await cache.upsertAsset(asset);
            }

            // Select a random asset
            const selectedAsset = assets[selectionIndex % assets.length];
            const cachedAsset = await cache.getAsset(selectedAsset.path);

            if (!cachedAsset) return false;

            // Simulate FilePicker callback behavior
            // The callback should return the exact path from the cached asset
            const returnedPath = cachedAsset.path;

            // Verify the returned path matches exactly
            return returnedPath === selectedAsset.path;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: asset-atlas, Property 18: All native FilePicker types are supported
    test('all Foundry asset types are supported in Asset Atlas', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('image' as const, 'audio' as const, 'video' as const),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (assetType, name) => {
            // Create asset of each type
            const extensions: Record<string, string[]> = {
              image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
              audio: ['mp3', 'ogg', 'wav', 'flac'],
              video: ['mp4', 'webm']
            };

            const ext = extensions[assetType][0];
            const path = `/assets/${name}.${ext}`;

            const metadata: AssetMetadata = {
              path,
              name: `${name}.${ext}`,
              type: assetType,
              size: 1024,
              modifiedDate: Date.now()
            };

            await cache.upsertAsset(metadata);

            // Search for the asset
            const results = await cache.searchAssets({ types: [assetType] });

            // Verify the asset is found and type matches
            const found = results.find(a => a.path === path);
            return found !== undefined && found.type === assetType;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Asset type support', () => {
    test('supports all image formats', async () => {
      const imageFormats = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

      for (const format of imageFormats) {
        const metadata: AssetMetadata = {
          path: `/assets/test.${format}`,
          name: `test.${format}`,
          type: 'image',
          size: 1024,
          modifiedDate: Date.now()
        };

        await cache.upsertAsset(metadata);
        const retrieved = await cache.getAsset(metadata.path);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.type).toBe('image');
      }
    });

    test('supports all audio formats', async () => {
      const audioFormats = ['mp3', 'ogg', 'wav', 'flac'];

      for (const format of audioFormats) {
        const metadata: AssetMetadata = {
          path: `/assets/test.${format}`,
          name: `test.${format}`,
          type: 'audio',
          size: 1024,
          modifiedDate: Date.now()
        };

        await cache.upsertAsset(metadata);
        const retrieved = await cache.getAsset(metadata.path);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.type).toBe('audio');
      }
    });

    test('supports all video formats', async () => {
      const videoFormats = ['mp4', 'webm'];

      for (const format of videoFormats) {
        const metadata: AssetMetadata = {
          path: `/assets/test.${format}`,
          name: `test.${format}`,
          type: 'video',
          size: 1024,
          modifiedDate: Date.now()
        };

        await cache.upsertAsset(metadata);
        const retrieved = await cache.getAsset(metadata.path);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.type).toBe('video');
      }
    });
  });
});
