/**
 * Tests for AssetScanner
 */

import * as fc from 'fast-check';
import { AssetScanner } from '../AssetScanner';
import { AssetCache } from '../AssetCache';
import 'fake-indexeddb/auto';

describe('AssetScanner', () => {
  let cache: AssetCache;
  let scanner: AssetScanner;

  beforeEach(async () => {
    indexedDB.deleteDatabase('AssetAtlasCacheDB');
    cache = new AssetCache();
    await cache.initialize();
    scanner = new AssetScanner(cache);
  });

  afterEach(() => {
    cache.close();
  });

  describe('File type detection', () => {
    test('should recognize image files', () => {
      expect(scanner.isSupportedAsset('/assets/test.png')).toBe(true);
      expect(scanner.isSupportedAsset('/assets/test.jpg')).toBe(true);
      expect(scanner.isSupportedAsset('/assets/test.jpeg')).toBe(true);
      expect(scanner.isSupportedAsset('/assets/test.gif')).toBe(true);
      expect(scanner.isSupportedAsset('/assets/test.webp')).toBe(true);
      expect(scanner.isSupportedAsset('/assets/test.svg')).toBe(true);
    });

    test('should recognize audio files', () => {
      expect(scanner.isSupportedAsset('/assets/test.mp3')).toBe(true);
      expect(scanner.isSupportedAsset('/assets/test.ogg')).toBe(true);
      expect(scanner.isSupportedAsset('/assets/test.wav')).toBe(true);
      expect(scanner.isSupportedAsset('/assets/test.flac')).toBe(true);
    });

    test('should recognize video files', () => {
      expect(scanner.isSupportedAsset('/assets/test.mp4')).toBe(true);
      expect(scanner.isSupportedAsset('/assets/test.webm')).toBe(true);
    });

    test('should reject unsupported files', () => {
      expect(scanner.isSupportedAsset('/assets/test.txt')).toBe(false);
      expect(scanner.isSupportedAsset('/assets/test.pdf')).toBe(false);
      expect(scanner.isSupportedAsset('/assets/test.doc')).toBe(false);
      expect(scanner.isSupportedAsset('/assets/test.zip')).toBe(false);
    });

    test('should be case-insensitive', () => {
      expect(scanner.isSupportedAsset('/assets/test.PNG')).toBe(true);
      expect(scanner.isSupportedAsset('/assets/test.JPG')).toBe(true);
      expect(scanner.isSupportedAsset('/assets/test.MP3')).toBe(true);
    });

    test('should get correct asset type', () => {
      expect(scanner.getAssetType('/assets/test.png')).toBe('image');
      expect(scanner.getAssetType('/assets/test.mp3')).toBe('audio');
      expect(scanner.getAssetType('/assets/test.mp4')).toBe('video');
      expect(scanner.getAssetType('/assets/test.txt')).toBe(null);
    });
  });

  describe('Property-based tests', () => {
    // Feature: asset-atlas, Property 2: Supported file types are recognized
    test('all supported file extensions are recognized', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom(
            'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
            'mp3', 'ogg', 'wav', 'flac',
            'mp4', 'webm'
          ),
          fc.string({ minLength: 1, maxLength: 50 }),
          (extension, filename) => {
            const path = `/assets/${filename}.${extension}`;
            return scanner.isSupportedAsset(path) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('unsupported file extensions are rejected', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom('txt', 'pdf', 'doc', 'docx', 'xls', 'zip', 'rar', 'exe', 'dll'),
          fc.string({ minLength: 1, maxLength: 50 }),
          (extension, filename) => {
            const path = `/assets/${filename}.${extension}`;
            return scanner.isSupportedAsset(path) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('file type detection is case-insensitive', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom('png', 'jpg', 'mp3', 'mp4'),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (extension, upper1, upper2, upper3) => {
            // Randomly mix case
            let mixedCase = '';
            for (let i = 0; i < extension.length; i++) {
              const shouldUpper = i === 0 ? upper1 : i === 1 ? upper2 : upper3;
              mixedCase += shouldUpper ? extension[i].toUpperCase() : extension[i].toLowerCase();
            }
            
            const path = `/assets/test.${mixedCase}`;
            return scanner.isSupportedAsset(path) === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Metadata extraction', () => {
    test('should extract basic metadata for image', async () => {
      const metadata = await scanner.extractMetadata('/assets/test.png');
      
      expect(metadata.path).toBe('/assets/test.png');
      expect(metadata.name).toBe('test.png');
      expect(metadata.type).toBe('image');
      expect(metadata.size).toBeGreaterThanOrEqual(0);
      expect(metadata.modifiedDate).toBeGreaterThan(0);
    });

    test('should extract basic metadata for audio', async () => {
      const metadata = await scanner.extractMetadata('/assets/test.mp3');
      
      expect(metadata.path).toBe('/assets/test.mp3');
      expect(metadata.name).toBe('test.mp3');
      expect(metadata.type).toBe('audio');
    });

    test('should extract basic metadata for video', async () => {
      const metadata = await scanner.extractMetadata('/assets/test.mp4');
      
      expect(metadata.path).toBe('/assets/test.mp4');
      expect(metadata.name).toBe('test.mp4');
      expect(metadata.type).toBe('video');
    });

    test('should throw error for unsupported file', async () => {
      await expect(scanner.extractMetadata('/assets/test.txt')).rejects.toThrow();
    });
  });

  describe('Thumbnail generation', () => {
    test('should generate thumbnail for image', async () => {
      const thumbnail = await scanner.generateThumbnail('/assets/test.png');
      
      expect(thumbnail).toBeDefined();
      expect(typeof thumbnail).toBe('string');
      expect(thumbnail.length).toBeGreaterThan(0);
    });
  });

  describe('Scanning', () => {
    test('should return scan result', async () => {
      const result = await scanner.scan(['/assets']);
      
      expect(result).toBeDefined();
      expect(result.assetsFound).toBeGreaterThanOrEqual(0);
      expect(result.assetsAdded).toBeGreaterThanOrEqual(0);
      expect(result.assetsUpdated).toBeGreaterThanOrEqual(0);
      expect(result.assetsRemoved).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('Metadata completeness', () => {
    // Feature: asset-atlas, Property 3: Scanned assets have complete metadata
    test('extracted metadata contains all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('png', 'jpg', 'mp3', 'mp4'),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (extension, filename) => {
            const path = `/assets/${filename}.${extension}`;
            const metadata = await scanner.extractMetadata(path);

            // Verify all required fields are present
            const hasPath = typeof metadata.path === 'string' && metadata.path.length > 0;
            const hasName = typeof metadata.name === 'string' && metadata.name.length > 0;
            const hasType = ['image', 'audio', 'video'].includes(metadata.type);
            const hasSize = typeof metadata.size === 'number' && metadata.size >= 0;
            const hasModifiedDate = typeof metadata.modifiedDate === 'number' && metadata.modifiedDate > 0;

            return hasPath && hasName && hasType && hasSize && hasModifiedDate;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Directory exclusion', () => {
    test('should set and get excluded directories', () => {
      const excludedDirs = ['node_modules', '.git', 'dist'];
      scanner.setExcludedDirectories(excludedDirs);
      
      const retrieved = scanner.getExcludedDirectories();
      expect(retrieved).toEqual(excludedDirs);
    });

    test('should detect excluded paths', () => {
      scanner.setExcludedDirectories(['node_modules', '.git']);
      
      expect(scanner.isPathExcluded('node_modules/package.json')).toBe(true);
      expect(scanner.isPathExcluded('.git/config')).toBe(true);
      expect(scanner.isPathExcluded('assets/images/test.png')).toBe(false);
    });

    test('should handle paths with different separators', () => {
      scanner.setExcludedDirectories(['node_modules']);
      
      expect(scanner.isPathExcluded('node_modules/test.png')).toBe(true);
      expect(scanner.isPathExcluded('node_modules\\test.png')).toBe(true);
    });

    test('should handle nested excluded directories', () => {
      scanner.setExcludedDirectories(['assets/temp']);
      
      expect(scanner.isPathExcluded('assets/temp/test.png')).toBe(true);
      expect(scanner.isPathExcluded('assets/images/test.png')).toBe(false);
    });

    // Feature: asset-atlas, Property 24: Excluded directories are not scanned
    test('excluded directories are filtered from scan', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 }),
            { minLength: 1, maxLength: 3 }
          ),
          async (directories, excludedDirs) => {
            // Set excluded directories
            scanner.setExcludedDirectories(excludedDirs);

            // Check that excluded directories are properly identified
            for (const dir of directories) {
              const isExcluded = scanner.isPathExcluded(dir);
              const shouldBeExcluded = excludedDirs.some(excluded => {
                const normalizedDir = dir.replace(/\\/g, '/');
                const normalizedExcluded = excluded.replace(/\\/g, '/');
                return normalizedDir.startsWith(normalizedExcluded) ||
                       normalizedDir.includes(`/${normalizedExcluded}/`) ||
                       normalizedDir.includes(`/${normalizedExcluded}`);
              });

              if (isExcluded !== shouldBeExcluded) {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('paths within excluded directories are excluded', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom('node_modules', '.git', 'dist', 'build'),
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.constantFrom('png', 'jpg', 'mp3'),
          (excludedDir, subpath, extension) => {
            scanner.setExcludedDirectories([excludedDir]);
            
            const path = `${excludedDir}/${subpath}.${extension}`;
            return scanner.isPathExcluded(path) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('paths outside excluded directories are not excluded', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom('node_modules', '.git'),
          fc.constantFrom('assets', 'images', 'sounds'),
          fc.string({ minLength: 1, maxLength: 30 }),
          (excludedDir, allowedDir, filename) => {
            scanner.setExcludedDirectories([excludedDir]);
            
            // Ensure allowed dir doesn't contain excluded dir
            if (allowedDir.includes(excludedDir)) {
              return true; // Skip this case
            }
            
            const path = `${allowedDir}/${filename}.png`;
            return scanner.isPathExcluded(path) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
