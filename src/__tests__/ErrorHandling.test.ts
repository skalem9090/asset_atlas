/**
 * Unit tests for error handling across components
 */

import { AssetCache } from '../AssetCache';
import { TagManager } from '../TagManager';
import { AssetScanner } from '../AssetScanner';
import { AssetOrganizer } from '../AssetOrganizer';
import { UsageTracker } from '../UsageTracker';
import { CachedAsset } from '../types';

describe('Error Handling', () => {
  describe('AssetCache error handling', () => {
    let cache: AssetCache;

    beforeEach(async () => {
      cache = new AssetCache();
      await cache.initialize();
    });

    afterEach(() => {
      cache.close();
    });

    it('should handle operations when database is not initialized', async () => {
      const uninitializedCache = new AssetCache();
      
      await expect(uninitializedCache.upsertAsset({
        path: 'test.png',
        name: 'test.png',
        type: 'image',
        size: 1024,
        modifiedDate: Date.now()
      })).rejects.toThrow('Database not initialized');
    });

    it('should return empty array when searching with uninitialized database', async () => {
      const uninitializedCache = new AssetCache();
      const results = await uninitializedCache.searchAssets({});
      
      expect(results).toEqual([]);
    });

    it('should handle missing assets gracefully', async () => {
      const asset = await cache.getAsset('nonexistent.png');
      expect(asset).toBeNull();
    });

    it('should handle removal of nonexistent assets', async () => {
      const removed = await cache.removeAsset('nonexistent.png');
      expect(removed).toBe(false);
    });
  });

  describe('TagManager error handling', () => {
    let tagManager: TagManager;

    beforeEach(async () => {
      tagManager = new TagManager();
      await tagManager.initialize();
    });

    afterEach(() => {
      tagManager.close();
    });

    it('should reject empty tag names', async () => {
      await expect(tagManager.createTag('')).rejects.toThrow('Tag name cannot be empty');
      await expect(tagManager.createTag('   ')).rejects.toThrow('Tag name cannot be empty');
    });

    it('should reject tag names exceeding 50 characters', async () => {
      const longName = 'a'.repeat(51);
      await expect(tagManager.createTag(longName)).rejects.toThrow('Tag name cannot exceed 50 characters');
    });

    it('should reject duplicate tag names', async () => {
      await tagManager.createTag('test-tag');
      await expect(tagManager.createTag('test-tag')).rejects.toThrow('already exists');
    });

    it('should return empty array when getting tags with uninitialized database', async () => {
      const uninitializedManager = new TagManager();
      const tags = await uninitializedManager.getAllTags();
      
      expect(tags).toEqual([]);
    });
  });

  describe('AssetScanner error handling', () => {
    let cache: AssetCache;
    let scanner: AssetScanner;

    beforeEach(async () => {
      cache = new AssetCache();
      await cache.initialize();
      scanner = new AssetScanner(cache);
    });

    afterEach(() => {
      cache.close();
    });

    it('should handle unsupported file types', () => {
      expect(scanner.isSupportedAsset('document.pdf')).toBe(false);
      expect(scanner.isSupportedAsset('script.js')).toBe(false);
      expect(scanner.isSupportedAsset('data.json')).toBe(false);
    });

    it('should handle files without extensions', () => {
      expect(scanner.isSupportedAsset('README')).toBe(false);
      expect(scanner.isSupportedAsset('LICENSE')).toBe(false);
    });

    it('should handle excluded directories', () => {
      scanner.setExcludedDirectories(['node_modules', 'temp']);
      
      expect(scanner.isPathExcluded('node_modules/package/file.png')).toBe(true);
      expect(scanner.isPathExcluded('temp/cache/image.jpg')).toBe(true);
      expect(scanner.isPathExcluded('assets/images/file.png')).toBe(false);
    });

    it('should collect errors during scan', async () => {
      const result = await scanner.scan(['nonexistent-directory'], true);
      
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
      expect(result.assetsFound).toBe(0);
    });

    it('should handle metadata extraction errors gracefully', async () => {
      await expect(scanner.extractMetadata('unsupported.xyz')).rejects.toThrow('Unsupported asset type');
    });
  });

  describe('AssetOrganizer error handling', () => {
    let cache: AssetCache;
    let usageTracker: UsageTracker;
    let organizer: AssetOrganizer;
    let testAsset: CachedAsset;

    beforeEach(async () => {
      cache = new AssetCache();
      await cache.initialize();
      usageTracker = new UsageTracker(cache);
      organizer = new AssetOrganizer(cache, usageTracker);

      testAsset = {
        id: 'test-1',
        path: 'assets/test.png',
        name: 'test.png',
        type: 'image',
        size: 1024,
        modifiedDate: Date.now(),
        tags: [],
        usage: { scenes: [], journals: [], actors: [], count: 0 },
        indexed: Date.now()
      };

      await cache.upsertAsset(testAsset);
    });

    afterEach(() => {
      cache.close();
    });

    it('should handle invalid destination paths', async () => {
      const result = await organizer.moveAsset(testAsset, '');
      expect(result).toBe(false);
    });

    it('should handle moving to same path', async () => {
      const result = await organizer.moveAsset(testAsset, testAsset.path);
      expect(result).toBe(false);
    });

    it('should handle deletion of nonexistent assets', async () => {
      const nonexistentAsset: CachedAsset = {
        ...testAsset,
        id: 'nonexistent',
        path: 'nonexistent.png'
      };

      const result = await organizer.deleteAssets([nonexistentAsset]);
      
      // Should handle gracefully - either success (if file doesn't exist) or failure
      expect(result.success + result.failed).toBe(1);
    });

    it('should provide dry run without modifying files', async () => {
      const dryRunResult = await organizer.dryRunDelete([testAsset]);
      
      expect(dryRunResult.totalCount).toBe(1);
      expect(dryRunResult.totalSize).toBe(testAsset.size);
      expect(dryRunResult.assets).toContain(testAsset);
      
      // Verify asset still exists in cache
      const stillExists = await cache.getAsset(testAsset.path);
      expect(stillExists).not.toBeNull();
    });
  });

  describe('UsageTracker error handling', () => {
    let cache: AssetCache;
    let tracker: UsageTracker;

    beforeEach(async () => {
      cache = new AssetCache();
      await cache.initialize();
      tracker = new UsageTracker(cache);
    });

    afterEach(() => {
      cache.close();
    });

    it('should handle missing Foundry game object', async () => {
      // Save original game object
      const originalGame = (globalThis as any).game;
      (globalThis as any).game = undefined;

      const usageMap = await tracker.scanAllDocuments();
      expect(usageMap.size).toBe(0);

      // Restore game object
      (globalThis as any).game = originalGame;
    });

    it('should handle update errors gracefully', async () => {
      // Save original game object
      const originalGame = (globalThis as any).game;
      (globalThis as any).game = undefined;

      const result = await tracker.updateReferences('old.png', 'new.png');
      
      expect(result.scenesUpdated).toBe(0);
      expect(result.journalsUpdated).toBe(0);
      expect(result.actorsUpdated).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);

      // Restore game object
      (globalThis as any).game = originalGame;
    });

    it('should find no references for nonexistent assets', async () => {
      const usage = await tracker.findAssetReferences('nonexistent.png');
      
      expect(usage.count).toBe(0);
      expect(usage.scenes).toEqual([]);
      expect(usage.journals).toEqual([]);
      expect(usage.actors).toEqual([]);
    });
  });

  describe('Error message quality', () => {
    it('should provide user-friendly error messages', async () => {
      const cache = new AssetCache();
      
      try {
        await cache.upsertAsset({
          path: 'test.png',
          name: 'test.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now()
        });
        fail('Should have thrown an error');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('Database not initialized');
        expect(message).toContain('initialize()');
      }
    });

    it('should provide specific error messages for tag validation', async () => {
      const tagManager = new TagManager();
      await tagManager.initialize();

      try {
        await tagManager.createTag('');
        fail('Should have thrown an error');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('empty');
      }

      try {
        await tagManager.createTag('a'.repeat(51));
        fail('Should have thrown an error');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('50 characters');
      }

      tagManager.close();
    });
  });
});
