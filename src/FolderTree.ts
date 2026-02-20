/**
 * FolderTree - Manages folder hierarchy for asset navigation
 */

import { CachedAsset, FolderNode, FolderTreeState } from './types';

export class FolderTree {
  private root: FolderNode;
  private selectedFolder: string | null = null;

  constructor() {
    this.root = this.createNode('Root', '', 0, 0);
    this.root.isExpanded = true;
  }

  /**
   * Build folder tree from asset paths
   */
  buildFromAssets(assets: CachedAsset[]): void {
    // Reset tree
    this.root = this.createNode('Root', '', 0, 0);
    this.root.isExpanded = true;

    // Count assets per folder
    const folderCounts = new Map<string, number>();
    
    for (const asset of assets) {
      const parts = this.getPathParts(asset.path);
      
      // Count for each folder level
      for (let i = 0; i < parts.length; i++) {
        const folderPath = parts.slice(0, i + 1).join('/');
        folderCounts.set(folderPath, (folderCounts.get(folderPath) || 0) + 1);
      }
    }

    // Build tree structure
    for (const [folderPath, count] of folderCounts.entries()) {
      this.ensureFolderPath(folderPath, count);
    }
  }

  /**
   * Get path parts from a full path
   */
  private getPathParts(path: string): string[] {
    // Remove filename and split by /
    const parts = path.split('/');
    parts.pop(); // Remove filename
    return parts.filter(p => p.length > 0);
  }

  /**
   * Ensure a folder path exists in the tree
   */
  private ensureFolderPath(folderPath: string, assetCount: number): void {
    const parts = folderPath.split('/').filter(p => p.length > 0);
    let current = this.root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!current.children.has(part)) {
        const node = this.createNode(part, currentPath, 0, i + 1);
        current.children.set(part, node);
      }

      current = current.children.get(part)!;
      
      // Update asset count for the deepest folder
      if (i === parts.length - 1) {
        current.assetCount = assetCount;
      }
    }
  }

  /**
   * Create a new folder node
   */
  private createNode(name: string, path: string, assetCount: number, level: number): FolderNode {
    return {
      name,
      path,
      assetCount,
      children: new Map(),
      isExpanded: false,
      level
    };
  }

  /**
   * Get the root node
   */
  getRoot(): FolderNode {
    return this.root;
  }

  /**
   * Get all nodes as a flat array (for rendering)
   */
  getFlattenedNodes(): FolderNode[] {
    const nodes: FolderNode[] = [];
    this.flattenNode(this.root, nodes);
    return nodes;
  }

  /**
   * Recursively flatten tree nodes
   */
  private flattenNode(node: FolderNode, result: FolderNode[]): void {
    // Don't include root in the flattened list
    if (node !== this.root) {
      result.push(node);
    }

    // Only include children if node is expanded
    if (node.isExpanded) {
      const sortedChildren = Array.from(node.children.values()).sort((a, b) => 
        a.name.localeCompare(b.name)
      );
      
      for (const child of sortedChildren) {
        this.flattenNode(child, result);
      }
    }
  }

  /**
   * Toggle folder expansion state
   */
  toggleFolder(folderPath: string): void {
    const node = this.findNode(folderPath);
    if (node) {
      node.isExpanded = !node.isExpanded;
    }
  }

  /**
   * Expand a folder
   */
  expandFolder(folderPath: string): void {
    const node = this.findNode(folderPath);
    if (node) {
      node.isExpanded = true;
    }
  }

  /**
   * Collapse a folder
   */
  collapseFolder(folderPath: string): void {
    const node = this.findNode(folderPath);
    if (node) {
      node.isExpanded = false;
    }
  }

  /**
   * Expand all folders
   */
  expandAll(): void {
    this.expandAllRecursive(this.root);
  }

  /**
   * Recursively expand all folders
   */
  private expandAllRecursive(node: FolderNode): void {
    node.isExpanded = true;
    for (const child of node.children.values()) {
      this.expandAllRecursive(child);
    }
  }

  /**
   * Collapse all folders
   */
  collapseAll(): void {
    this.collapseAllRecursive(this.root);
    // Keep root expanded
    this.root.isExpanded = true;
  }

  /**
   * Recursively collapse all folders
   */
  private collapseAllRecursive(node: FolderNode): void {
    node.isExpanded = false;
    for (const child of node.children.values()) {
      this.collapseAllRecursive(child);
    }
  }

  /**
   * Find a node by path
   */
  private findNode(folderPath: string): FolderNode | null {
    if (!folderPath) return this.root;
    
    const parts = folderPath.split('/').filter(p => p.length > 0);
    let current = this.root;

    for (const part of parts) {
      if (!current.children.has(part)) {
        return null;
      }
      current = current.children.get(part)!;
    }

    return current;
  }

  /**
   * Set selected folder
   */
  setSelectedFolder(folderPath: string | null): void {
    this.selectedFolder = folderPath;
  }

  /**
   * Get selected folder
   */
  getSelectedFolder(): string | null {
    return this.selectedFolder;
  }

  /**
   * Get tree state for persistence
   */
  getState(): FolderTreeState {
    const expandedFolders: string[] = [];
    this.collectExpandedFolders(this.root, expandedFolders);
    
    return {
      expandedFolders,
      selectedFolder: this.selectedFolder
    };
  }

  /**
   * Collect expanded folder paths
   */
  private collectExpandedFolders(node: FolderNode, result: string[]): void {
    if (node.isExpanded && node.path) {
      result.push(node.path);
    }
    
    for (const child of node.children.values()) {
      this.collectExpandedFolders(child, result);
    }
  }

  /**
   * Restore tree state from persistence
   */
  restoreState(state: FolderTreeState): void {
    // Restore expanded folders
    for (const folderPath of state.expandedFolders) {
      this.expandFolder(folderPath);
    }
    
    // Restore selected folder
    this.selectedFolder = state.selectedFolder;
  }

  /**
   * Get total folder count
   */
  getFolderCount(): number {
    return this.countFolders(this.root);
  }

  /**
   * Recursively count folders
   */
  private countFolders(node: FolderNode): number {
    let count = node === this.root ? 0 : 1;
    for (const child of node.children.values()) {
      count += this.countFolders(child);
    }
    return count;
  }
}
