/**
 * FolderTree - Manages folder hierarchy for asset navigation
 */
class FolderTree {
    constructor() {
        this.selectedFolder = null;
        this.root = this.createNode('Root', '', 0, 0);
        this.root.isExpanded = true;
    }
    /**
     * Build folder tree from asset paths
     */
    buildFromAssets(assets) {
        // Reset tree
        this.root = this.createNode('Root', '', 0, 0);
        this.root.isExpanded = true;
        // Count assets per folder
        const folderCounts = new Map();
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
    getPathParts(path) {
        // Remove filename and split by /
        const parts = path.split('/');
        parts.pop(); // Remove filename
        return parts.filter(p => p.length > 0);
    }
    /**
     * Ensure a folder path exists in the tree
     */
    ensureFolderPath(folderPath, assetCount) {
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
            current = current.children.get(part);
            // Update asset count for the deepest folder
            if (i === parts.length - 1) {
                current.assetCount = assetCount;
            }
        }
    }
    /**
     * Create a new folder node
     */
    createNode(name, path, assetCount, level) {
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
    getRoot() {
        return this.root;
    }
    /**
     * Get all nodes as a flat array (for rendering)
     */
    getFlattenedNodes() {
        const nodes = [];
        this.flattenNode(this.root, nodes);
        return nodes;
    }
    /**
     * Recursively flatten tree nodes
     */
    flattenNode(node, result) {
        // Don't include root in the flattened list
        if (node !== this.root) {
            result.push(node);
        }
        // Only include children if node is expanded
        if (node.isExpanded) {
            const sortedChildren = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));
            for (const child of sortedChildren) {
                this.flattenNode(child, result);
            }
        }
    }
    /**
     * Toggle folder expansion state
     */
    toggleFolder(folderPath) {
        const node = this.findNode(folderPath);
        if (node) {
            node.isExpanded = !node.isExpanded;
        }
    }
    /**
     * Expand a folder
     */
    expandFolder(folderPath) {
        const node = this.findNode(folderPath);
        if (node) {
            node.isExpanded = true;
        }
    }
    /**
     * Collapse a folder
     */
    collapseFolder(folderPath) {
        const node = this.findNode(folderPath);
        if (node) {
            node.isExpanded = false;
        }
    }
    /**
     * Expand all folders
     */
    expandAll() {
        this.expandAllRecursive(this.root);
    }
    /**
     * Recursively expand all folders
     */
    expandAllRecursive(node) {
        node.isExpanded = true;
        for (const child of node.children.values()) {
            this.expandAllRecursive(child);
        }
    }
    /**
     * Collapse all folders
     */
    collapseAll() {
        this.collapseAllRecursive(this.root);
        // Keep root expanded
        this.root.isExpanded = true;
    }
    /**
     * Recursively collapse all folders
     */
    collapseAllRecursive(node) {
        node.isExpanded = false;
        for (const child of node.children.values()) {
            this.collapseAllRecursive(child);
        }
    }
    /**
     * Find a node by path
     */
    findNode(folderPath) {
        if (!folderPath)
            return this.root;
        const parts = folderPath.split('/').filter(p => p.length > 0);
        let current = this.root;
        for (const part of parts) {
            if (!current.children.has(part)) {
                return null;
            }
            current = current.children.get(part);
        }
        return current;
    }
    /**
     * Set selected folder
     */
    setSelectedFolder(folderPath) {
        this.selectedFolder = folderPath;
    }
    /**
     * Get selected folder
     */
    getSelectedFolder() {
        return this.selectedFolder;
    }
    /**
     * Get tree state for persistence
     */
    getState() {
        const expandedFolders = [];
        this.collectExpandedFolders(this.root, expandedFolders);
        return {
            expandedFolders,
            selectedFolder: this.selectedFolder
        };
    }
    /**
     * Collect expanded folder paths
     */
    collectExpandedFolders(node, result) {
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
    restoreState(state) {
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
    getFolderCount() {
        return this.countFolders(this.root);
    }
    /**
     * Recursively count folders
     */
    countFolders(node) {
        let count = node === this.root ? 0 : 1;
        for (const child of node.children.values()) {
            count += this.countFolders(child);
        }
        return count;
    }
}

export { FolderTree };
//# sourceMappingURL=FolderTree.js.map
