/**
 * Tests for AssetAtlasFolder
 */

import { AssetAtlasFolder } from '../AssetAtlasFolder';

describe('AssetAtlasFolder', () => {
  let folderManager: AssetAtlasFolder;

  beforeEach(() => {
    folderManager = new AssetAtlasFolder();
  });

  describe('Path generation', () => {
    test('should generate correct base path', () => {
      expect(folderManager.getBasePath()).toBe('asset-atlas');
    });

    test('should generate correct library path', () => {
      expect(folderManager.getLibraryPath()).toBe('asset-atlas/library');
    });

    test('should generate correct library type paths', () => {
      expect(folderManager.getLibraryTypePath('image')).toBe('asset-atlas/library/images');
      expect(folderManager.getLibraryTypePath('audio')).toBe('asset-atlas/library/audios');
      expect(folderManager.getLibraryTypePath('video')).toBe('asset-atlas/library/videos');
    });

    test('should generate correct world path', () => {
      expect(folderManager.getWorldPath('my-campaign')).toBe('asset-atlas/worlds/my-campaign');
    });

    test('should generate correct world type paths', () => {
      expect(folderManager.getWorldTypePath('my-campaign', 'image'))
        .toBe('asset-atlas/worlds/my-campaign/images');
      expect(folderManager.getWorldTypePath('my-campaign', 'audio'))
        .toBe('asset-atlas/worlds/my-campaign/audios');
    });
  });

  describe('Path checking', () => {
    test('should identify Asset Atlas paths', () => {
      expect(folderManager.isAssetAtlasPath('asset-atlas/library/images/test.png')).toBe(true);
      expect(folderManager.isAssetAtlasPath('asset-atlas/worlds/campaign/images/test.png')).toBe(true);
      expect(folderManager.isAssetAtlasPath('modules/some-module/assets/test.png')).toBe(false);
    });

    test('should identify library paths', () => {
      expect(folderManager.isLibraryPath('asset-atlas/library/images/test.png')).toBe(true);
      expect(folderManager.isLibraryPath('asset-atlas/worlds/campaign/images/test.png')).toBe(false);
    });

    test('should identify world paths', () => {
      expect(folderManager.isWorldPath('asset-atlas/worlds/campaign/images/test.png')).toBe(true);
      expect(folderManager.isWorldPath('asset-atlas/library/images/test.png')).toBe(false);
    });

    test('should extract world name from path', () => {
      expect(folderManager.getWorldNameFromPath('asset-atlas/worlds/my-campaign/images/test.png'))
        .toBe('my-campaign');
      expect(folderManager.getWorldNameFromPath('asset-atlas/worlds/another-world/audios/music.mp3'))
        .toBe('another-world');
      expect(folderManager.getWorldNameFromPath('asset-atlas/library/images/test.png'))
        .toBeNull();
    });
  });

  describe('Standard paths', () => {
    test('should generate standard paths without world', () => {
      const paths = folderManager.getStandardPaths();
      
      expect(paths).toContain('asset-atlas');
      expect(paths).toContain('asset-atlas/library');
      expect(paths).toContain('asset-atlas/library/images');
      expect(paths).toContain('asset-atlas/library/audios');
      expect(paths).toContain('asset-atlas/library/videos');
      expect(paths.length).toBe(5);
    });

    test('should generate standard paths with world', () => {
      const paths = folderManager.getStandardPaths('test-world');
      
      expect(paths).toContain('asset-atlas/worlds/test-world');
      expect(paths).toContain('asset-atlas/worlds/test-world/images');
      expect(paths).toContain('asset-atlas/worlds/test-world/audios');
      expect(paths).toContain('asset-atlas/worlds/test-world/videos');
      expect(paths.length).toBe(9);
    });
  });
});
