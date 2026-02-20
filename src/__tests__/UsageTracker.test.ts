/**
 * Tests for UsageTracker
 */

import * as fc from 'fast-check';
import { UsageTracker } from '../UsageTracker';
import { AssetCache } from '../AssetCache';
import 'fake-indexeddb/auto';

describe('UsageTracker', () => {
  let cache: AssetCache;
  let tracker: UsageTracker;

  beforeEach(async () => {
    indexedDB.deleteDatabase('AssetAtlasDB');
    cache = new AssetCache();
    await cache.initialize();
    tracker = new UsageTracker(cache);
  });

  afterEach(() => {
    cache.close();
  });

  describe('Asset reference finding', () => {
    test('should find asset references', async () => {
      const usage = await tracker.findAssetReferences('/assets/test.png');
      
      expect(usage).toBeDefined();
      expect(Array.isArray(usage.scenes)).toBe(true);
      expect(Array.isArray(usage.journals)).toBe(true);
      expect(Array.isArray(usage.actors)).toBe(true);
      expect(typeof usage.count).toBe('number');
    });

    test('should return empty usage for non-existent asset', async () => {
      const usage = await tracker.findAssetReferences('/assets/nonexistent.png');
      
      expect(usage.count).toBe(0);
      expect(usage.scenes.length).toBe(0);
      expect(usage.journals.length).toBe(0);
      expect(usage.actors.length).toBe(0);
    });
  });

  describe('Document scanning', () => {
    test('should scan all documents', async () => {
      const usageMap = await tracker.scanAllDocuments();
      
      expect(usageMap).toBeInstanceOf(Map);
    });
  });

  describe('Reference updates', () => {
    test('should update references when asset is moved', async () => {
      const result = await tracker.updateReferences(
        '/assets/old.png',
        '/assets/new.png'
      );
      
      expect(result).toBeDefined();
      expect(typeof result.scenesUpdated).toBe('number');
      expect(typeof result.journalsUpdated).toBe('number');
      expect(typeof result.actorsUpdated).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    test('should return zero updates for non-existent asset', async () => {
      const result = await tracker.updateReferences(
        '/assets/nonexistent.png',
        '/assets/new.png'
      );
      
      expect(result.scenesUpdated).toBe(0);
      expect(result.journalsUpdated).toBe(0);
      expect(result.actorsUpdated).toBe(0);
    });
  });

  describe('Property-based tests', () => {
    // Feature: asset-atlas, Property 11: Asset details show accurate usage
    test('usage info structure is consistent', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }).map(s => `/assets/${s}.png`),
          async (assetPath) => {
            const usage = await tracker.findAssetReferences(assetPath);
            
            // Verify structure
            const hasScenes = Array.isArray(usage.scenes);
            const hasJournals = Array.isArray(usage.journals);
            const hasActors = Array.isArray(usage.actors);
            const hasCount = typeof usage.count === 'number' && usage.count >= 0;
            
            // Count should match total references
            const expectedCount = usage.scenes.length + usage.journals.length + usage.actors.length;
            const countMatches = usage.count === expectedCount;
            
            return hasScenes && hasJournals && hasActors && hasCount && countMatches;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: asset-atlas, Property 13: Path changes update all references
    test('update result structure is consistent', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }).map(s => `/assets/${s}.png`),
          fc.string({ minLength: 1 }).map(s => `/assets/${s}.png`),
          async (oldPath, newPath) => {
            const result = await tracker.updateReferences(oldPath, newPath);
            
            // Verify structure
            const hasScenes = typeof result.scenesUpdated === 'number' && result.scenesUpdated >= 0;
            const hasJournals = typeof result.journalsUpdated === 'number' && result.journalsUpdated >= 0;
            const hasActors = typeof result.actorsUpdated === 'number' && result.actorsUpdated >= 0;
            const hasErrors = Array.isArray(result.errors);
            
            return hasScenes && hasJournals && hasActors && hasErrors;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Helper methods', () => {
    test('should identify asset paths', () => {
      // Access private method through any cast for testing
      const isAssetPath = (tracker as any).isAssetPath.bind(tracker);
      
      expect(isAssetPath('/assets/test.png')).toBe(true);
      expect(isAssetPath('/assets/test.jpg')).toBe(true);
      expect(isAssetPath('/assets/test.mp3')).toBe(true);
      expect(isAssetPath('/assets/test.mp4')).toBe(true);
      expect(isAssetPath('/assets/test.txt')).toBe(false);
      expect(isAssetPath('not-a-path')).toBe(false);
    });

    test('should extract asset paths from document data', () => {
      const extractAssetPaths = (tracker as any).extractAssetPaths.bind(tracker);
      
      const documentData = {
        img: '/assets/background.png',
        tiles: [
          { img: '/assets/tile1.png' },
          { img: '/assets/tile2.jpg' }
        ],
        sounds: [
          { path: '/assets/ambient.mp3' }
        ],
        other: 'not-an-asset'
      };
      
      const paths = extractAssetPaths(documentData);
      
      expect(paths.length).toBeGreaterThan(0);
      expect(paths).toContain('/assets/background.png');
      expect(paths).toContain('/assets/tile1.png');
      expect(paths).toContain('/assets/tile2.jpg');
      expect(paths).toContain('/assets/ambient.mp3');
    });

    test('should replace asset paths in document data', () => {
      const replaceAssetPaths = (tracker as any).replaceAssetPaths.bind(tracker);
      
      const documentData = {
        img: '/assets/old.png',
        tiles: [
          { img: '/assets/old.png' },
          { img: '/assets/other.png' }
        ]
      };
      
      const modified = replaceAssetPaths(documentData, '/assets/old.png', '/assets/new.png');
      
      expect(modified).toBe(true);
      expect(documentData.img).toBe('/assets/new.png');
      expect(documentData.tiles[0].img).toBe('/assets/new.png');
      expect(documentData.tiles[1].img).toBe('/assets/other.png');
    });
  });
});
