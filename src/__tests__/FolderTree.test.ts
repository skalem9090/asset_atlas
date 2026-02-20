/**
 * Unit tests for FolderTree
 */

import { FolderTree } from '../FolderTree';
import { CachedAsset } from '../types';

describe('FolderTree', () => {
  let folderTree: FolderTree;

  beforeEach(() => {
    folderTree = new FolderTree();
  });

  describe('buildFromAssets', () => {
    it('should build folder hierarchy from asset paths', () => {
      const assets: CachedAsset[] = [
        {
          id: '1',
          path: 'worlds/my-world/images/tokens/goblin.png',
          name: 'goblin.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        },
        {
          id: '2',
          path: 'worlds/my-world/images/tokens/orc.png',
          name: 'orc.png',
          type: 'image',
          size: 2048,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        },
        {
          id: '3',
          path: 'worlds/my-world/images/maps/dungeon.jpg',
          name: 'dungeon.jpg',
          type: 'image',
          size: 4096,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        }
      ];

      folderTree.buildFromAssets(assets);

      const root = folderTree.getRoot();
      expect(root.children.size).toBeGreaterThan(0);
      
      // Check that folders were created
      const flatNodes = folderTree.getFlattenedNodes();
      expect(flatNodes.length).toBeGreaterThan(0);
    });

    it('should count assets per folder correctly', () => {
      const assets: CachedAsset[] = [
        {
          id: '1',
          path: 'images/tokens/goblin.png',
          name: 'goblin.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        },
        {
          id: '2',
          path: 'images/tokens/orc.png',
          name: 'orc.png',
          type: 'image',
          size: 2048,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        }
      ];

      folderTree.buildFromAssets(assets);
      folderTree.expandAll(); // Expand to see all folders

      const flatNodes = folderTree.getFlattenedNodes();
      const tokensFolder = flatNodes.find(node => node.name === 'tokens');
      
      expect(tokensFolder).toBeDefined();
      expect(tokensFolder?.assetCount).toBe(2);
    });

    it('should handle nested folder structures', () => {
      const assets: CachedAsset[] = [
        {
          id: '1',
          path: 'a/b/c/d/file.png',
          name: 'file.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        }
      ];

      folderTree.buildFromAssets(assets);

      const root = folderTree.getRoot();
      expect(root.children.has('a')).toBe(true);
      
      const nodeA = root.children.get('a')!;
      expect(nodeA.children.has('b')).toBe(true);
      
      const nodeB = nodeA.children.get('b')!;
      expect(nodeB.children.has('c')).toBe(true);
    });
  });

  describe('toggleFolder', () => {
    beforeEach(() => {
      const assets: CachedAsset[] = [
        {
          id: '1',
          path: 'images/tokens/goblin.png',
          name: 'goblin.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        }
      ];
      folderTree.buildFromAssets(assets);
    });

    it('should toggle folder expansion state', () => {
      folderTree.toggleFolder('images');
      
      const flatNodes = folderTree.getFlattenedNodes();
      const imagesFolder = flatNodes.find(node => node.name === 'images');
      
      expect(imagesFolder?.isExpanded).toBe(true);
      
      folderTree.toggleFolder('images');
      const flatNodes2 = folderTree.getFlattenedNodes();
      const imagesFolder2 = flatNodes2.find(node => node.name === 'images');
      
      expect(imagesFolder2?.isExpanded).toBe(false);
    });
  });

  describe('expandAll and collapseAll', () => {
    beforeEach(() => {
      const assets: CachedAsset[] = [
        {
          id: '1',
          path: 'a/b/c/file.png',
          name: 'file.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        }
      ];
      folderTree.buildFromAssets(assets);
    });

    it('should expand all folders', () => {
      folderTree.expandAll();
      
      const flatNodes = folderTree.getFlattenedNodes();
      const allExpanded = flatNodes.every(node => node.isExpanded);
      
      expect(allExpanded).toBe(true);
    });

    it('should collapse all folders except root', () => {
      folderTree.expandAll();
      folderTree.collapseAll();
      
      const root = folderTree.getRoot();
      expect(root.isExpanded).toBe(true);
      
      const flatNodes = folderTree.getFlattenedNodes();
      const allCollapsed = flatNodes.every(node => !node.isExpanded);
      
      expect(allCollapsed).toBe(true);
    });
  });

  describe('getFlattenedNodes', () => {
    it('should return only visible nodes based on expansion state', () => {
      const assets: CachedAsset[] = [
        {
          id: '1',
          path: 'images/tokens/goblin.png',
          name: 'goblin.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        }
      ];
      folderTree.buildFromAssets(assets);

      // Initially, folders are collapsed
      const flatNodes1 = folderTree.getFlattenedNodes();
      const initialCount = flatNodes1.length;

      // Expand all
      folderTree.expandAll();
      const flatNodes2 = folderTree.getFlattenedNodes();
      
      expect(flatNodes2.length).toBeGreaterThanOrEqual(initialCount);
    });

    it('should sort folders alphabetically', () => {
      const assets: CachedAsset[] = [
        {
          id: '1',
          path: 'zebra/file1.png',
          name: 'file1.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        },
        {
          id: '2',
          path: 'alpha/file2.png',
          name: 'file2.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        },
        {
          id: '3',
          path: 'beta/file3.png',
          name: 'file3.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        }
      ];
      folderTree.buildFromAssets(assets);

      const flatNodes = folderTree.getFlattenedNodes();
      const folderNames = flatNodes.map(node => node.name);
      
      expect(folderNames[0]).toBe('alpha');
      expect(folderNames[1]).toBe('beta');
      expect(folderNames[2]).toBe('zebra');
    });
  });

  describe('state persistence', () => {
    beforeEach(() => {
      const assets: CachedAsset[] = [
        {
          id: '1',
          path: 'images/tokens/goblin.png',
          name: 'goblin.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        }
      ];
      folderTree.buildFromAssets(assets);
    });

    it('should save and restore folder tree state', () => {
      folderTree.expandFolder('images');
      folderTree.setSelectedFolder('images/tokens');
      
      const state = folderTree.getState();
      
      expect(state.expandedFolders).toContain('images');
      expect(state.selectedFolder).toBe('images/tokens');
      
      // Create new tree and restore state
      const newTree = new FolderTree();
      const assets: CachedAsset[] = [
        {
          id: '1',
          path: 'images/tokens/goblin.png',
          name: 'goblin.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        }
      ];
      newTree.buildFromAssets(assets);
      newTree.restoreState(state);
      
      expect(newTree.getSelectedFolder()).toBe('images/tokens');
    });
  });

  describe('edge cases', () => {
    it('should handle empty asset list', () => {
      folderTree.buildFromAssets([]);
      
      const flatNodes = folderTree.getFlattenedNodes();
      expect(flatNodes.length).toBe(0);
    });

    it('should handle assets with no folder path', () => {
      const assets: CachedAsset[] = [
        {
          id: '1',
          path: 'file.png',
          name: 'file.png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        }
      ];
      
      folderTree.buildFromAssets(assets);
      
      const flatNodes = folderTree.getFlattenedNodes();
      expect(flatNodes.length).toBe(0);
    });

    it('should handle special characters in folder names', () => {
      const assets: CachedAsset[] = [
        {
          id: '1',
          path: 'my-folder/sub_folder/file (1).png',
          name: 'file (1).png',
          type: 'image',
          size: 1024,
          modifiedDate: Date.now(),
          tags: [],
          usage: { scenes: [], journals: [], actors: [], count: 0 },
          indexed: Date.now()
        }
      ];
      
      folderTree.buildFromAssets(assets);
      
      const flatNodes = folderTree.getFlattenedNodes();
      expect(flatNodes.length).toBeGreaterThan(0);
    });
  });
});
