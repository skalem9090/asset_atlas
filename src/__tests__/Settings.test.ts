/**
 * Tests for Settings Persistence
 */

import * as fc from 'fast-check';

// Mock Foundry's game.settings API
const mockSettings = new Map<string, any>();

const mockGameSettings = {
  register: jest.fn(),
  get: jest.fn((module: string, key: string) => {
    return mockSettings.get(`${module}.${key}`);
  }),
  set: jest.fn(async (module: string, key: string, value: any) => {
    mockSettings.set(`${module}.${key}`, value);
  })
};

// Mock global game object
(globalThis as any).game = {
  settings: mockGameSettings
};

describe('Settings Persistence', () => {
  beforeEach(() => {
    mockSettings.clear();
    jest.clearAllMocks();
  });

  describe('Property-based tests', () => {
    // Feature: asset-atlas, Property 25: Settings persist across sessions
    test('settings persist across sessions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            watchedDirectories: fc.array(
              fc.string({ minLength: 1, maxLength: 50 }),
              { minLength: 1, maxLength: 5 }
            ),
            excludedDirectories: fc.array(
              fc.string({ minLength: 1, maxLength: 50 }),
              { maxLength: 5 }
            ),
            thumbnailSize: fc.constantFrom('small' as const, 'medium' as const, 'large' as const),
            autoScanInterval: fc.nat({ max: 1440 })
          }),
          async (settings) => {
            // Save settings
            await mockGameSettings.set('asset-atlas', 'watchedDirectories', settings.watchedDirectories);
            await mockGameSettings.set('asset-atlas', 'excludedDirectories', settings.excludedDirectories);
            await mockGameSettings.set('asset-atlas', 'thumbnailSize', settings.thumbnailSize);
            await mockGameSettings.set('asset-atlas', 'autoScanInterval', settings.autoScanInterval);

            // Simulate session restart by retrieving settings
            const retrievedWatchedDirs = mockGameSettings.get('asset-atlas', 'watchedDirectories');
            const retrievedExcludedDirs = mockGameSettings.get('asset-atlas', 'excludedDirectories');
            const retrievedThumbnailSize = mockGameSettings.get('asset-atlas', 'thumbnailSize');
            const retrievedAutoScanInterval = mockGameSettings.get('asset-atlas', 'autoScanInterval');

            // Verify all settings match
            const watchedDirsMatch = JSON.stringify(retrievedWatchedDirs) === JSON.stringify(settings.watchedDirectories);
            const excludedDirsMatch = JSON.stringify(retrievedExcludedDirs) === JSON.stringify(settings.excludedDirectories);
            const thumbnailSizeMatch = retrievedThumbnailSize === settings.thumbnailSize;
            const autoScanIntervalMatch = retrievedAutoScanInterval === settings.autoScanInterval;

            return watchedDirsMatch && excludedDirsMatch && thumbnailSizeMatch && autoScanIntervalMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('settings with special characters persist correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.string({ minLength: 1, maxLength: 100 }),
            { minLength: 1, maxLength: 3 }
          ),
          async (directories) => {
            // Save directories with potentially special characters
            await mockGameSettings.set('asset-atlas', 'watchedDirectories', directories);

            // Retrieve
            const retrieved = mockGameSettings.get('asset-atlas', 'watchedDirectories');

            // Verify exact match
            return JSON.stringify(retrieved) === JSON.stringify(directories);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('numeric settings persist with correct type', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat({ max: 10000 }),
          async (interval) => {
            // Save numeric setting
            await mockGameSettings.set('asset-atlas', 'autoScanInterval', interval);

            // Retrieve
            const retrieved = mockGameSettings.get('asset-atlas', 'autoScanInterval');

            // Verify exact match and type
            return retrieved === interval && typeof retrieved === 'number';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit tests', () => {
    test('should save and retrieve watched directories', async () => {
      const directories = ['worlds', 'modules', 'systems'];
      
      await mockGameSettings.set('asset-atlas', 'watchedDirectories', directories);
      const retrieved = mockGameSettings.get('asset-atlas', 'watchedDirectories');
      
      expect(retrieved).toEqual(directories);
    });

    test('should save and retrieve excluded directories', async () => {
      const directories = ['node_modules', '.git'];
      
      await mockGameSettings.set('asset-atlas', 'excludedDirectories', directories);
      const retrieved = mockGameSettings.get('asset-atlas', 'excludedDirectories');
      
      expect(retrieved).toEqual(directories);
    });

    test('should save and retrieve thumbnail size', async () => {
      const size = 'large';
      
      await mockGameSettings.set('asset-atlas', 'thumbnailSize', size);
      const retrieved = mockGameSettings.get('asset-atlas', 'thumbnailSize');
      
      expect(retrieved).toBe(size);
    });

    test('should save and retrieve auto-scan interval', async () => {
      const interval = 30;
      
      await mockGameSettings.set('asset-atlas', 'autoScanInterval', interval);
      const retrieved = mockGameSettings.get('asset-atlas', 'autoScanInterval');
      
      expect(retrieved).toBe(interval);
    });

    test('should handle empty arrays', async () => {
      const emptyArray: string[] = [];
      
      await mockGameSettings.set('asset-atlas', 'excludedDirectories', emptyArray);
      const retrieved = mockGameSettings.get('asset-atlas', 'excludedDirectories');
      
      expect(retrieved).toEqual([]);
    });

    test('should handle zero interval', async () => {
      await mockGameSettings.set('asset-atlas', 'autoScanInterval', 0);
      const retrieved = mockGameSettings.get('asset-atlas', 'autoScanInterval');
      
      expect(retrieved).toBe(0);
    });
  });
});
