/**
 * Asset Cache - Persistent storage for asset metadata using IndexedDB
 */
class AssetCache {
    constructor() {
        this.db = null;
        this.dbName = 'AssetAtlasDB';
        this.dbVersion = 1;
    }
    /**
     * Initialize the database connection and schema
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                request.onerror = () => {
                    const error = request.error;
                    console.error('Asset Atlas | Database initialization failed:', error);
                    // Handle specific database errors
                    if (error?.name === 'QuotaExceededError') {
                        reject(new Error('Database quota exceeded. Please free up browser storage space.'));
                    }
                    else if (error?.name === 'VersionError') {
                        reject(new Error('Database version conflict. Try clearing browser data for this site.'));
                    }
                    else {
                        reject(new Error(`Failed to open database: ${error?.message || 'Unknown error'}`));
                    }
                };
                request.onsuccess = () => {
                    this.db = request.result;
                    // Handle database errors after opening
                    this.db.onerror = (event) => {
                        console.error('Asset Atlas | Database error:', event);
                    };
                    // Handle unexpected database close
                    this.db.onclose = () => {
                        console.warn('Asset Atlas | Database connection closed unexpectedly');
                        this.db = null;
                    };
                    resolve();
                };
                request.onupgradeneeded = (event) => {
                    try {
                        const db = event.target.result;
                        // Create assets object store
                        if (!db.objectStoreNames.contains('assets')) {
                            const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
                            assetStore.createIndex('path', 'path', { unique: true });
                            assetStore.createIndex('type', 'type', { unique: false });
                            assetStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                            assetStore.createIndex('usageCount', 'usage.count', { unique: false });
                        }
                    }
                    catch (error) {
                        console.error('Asset Atlas | Database schema creation failed:', error);
                        reject(new Error(`Failed to create database schema: ${error.message}`));
                    }
                };
                request.onblocked = () => {
                    console.warn('Asset Atlas | Database upgrade blocked by another connection');
                    reject(new Error('Database upgrade blocked. Please close other tabs with this site open.'));
                };
            }
            catch (error) {
                console.error('Asset Atlas | Failed to initiate database connection:', error);
                reject(new Error(`Database initialization error: ${error.message}`));
            }
        });
    }
    /**
     * Adds or updates an asset in the cache
     */
    async upsertAsset(metadata) {
        if (!this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['assets'], 'readwrite');
                const store = transaction.objectStore('assets');
                const pathIndex = store.index('path');
                // Handle transaction errors
                transaction.onerror = () => {
                    const error = transaction.error;
                    console.error('Asset Atlas | Transaction error during upsert:', error);
                    if (error?.name === 'QuotaExceededError') {
                        reject(new Error('Storage quota exceeded. Please free up space or clear old assets.'));
                    }
                    else if (error?.name === 'ConstraintError') {
                        reject(new Error('Database constraint violation. Asset may already exist.'));
                    }
                    else {
                        reject(new Error(`Transaction failed: ${error?.message || 'Unknown error'}`));
                    }
                };
                transaction.onabort = () => {
                    console.error('Asset Atlas | Transaction aborted during upsert');
                    reject(new Error('Database transaction was aborted'));
                };
                // Check if asset already exists
                const getRequest = pathIndex.get(metadata.path);
                getRequest.onsuccess = () => {
                    try {
                        const existingAsset = getRequest.result;
                        const cachedAsset = existingAsset
                            ? {
                                ...existingAsset,
                                ...metadata,
                                indexed: Date.now()
                            }
                            : {
                                id: this.generateId(),
                                ...metadata,
                                thumbnail: undefined,
                                tags: [],
                                usage: {
                                    scenes: [],
                                    journals: [],
                                    actors: [],
                                    count: 0
                                },
                                indexed: Date.now()
                            };
                        const putRequest = store.put(cachedAsset);
                        putRequest.onsuccess = () => resolve();
                        putRequest.onerror = () => {
                            const error = putRequest.error;
                            console.error('Asset Atlas | Put operation failed:', error);
                            reject(new Error(`Failed to save asset: ${error?.message || 'Unknown error'}`));
                        };
                    }
                    catch (error) {
                        console.error('Asset Atlas | Error preparing asset data:', error);
                        reject(new Error(`Failed to prepare asset data: ${error.message}`));
                    }
                };
                getRequest.onerror = () => {
                    const error = getRequest.error;
                    console.error('Asset Atlas | Failed to check existing asset:', error);
                    reject(new Error(`Failed to check existing asset: ${error?.message || 'Unknown error'}`));
                };
            }
            catch (error) {
                console.error('Asset Atlas | Unexpected error in upsertAsset:', error);
                reject(new Error(`Unexpected error: ${error.message}`));
            }
        });
    }
    /**
     * Retrieves an asset by path
     */
    async getAsset(path) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['assets'], 'readonly');
            const store = transaction.objectStore('assets');
            const index = store.index('path');
            const request = index.get(path);
            request.onsuccess = () => {
                resolve(request.result || null);
            };
            request.onerror = () => {
                reject(new Error(`Failed to get asset: ${request.error}`));
            };
        });
    }
    /**
     * Removes an asset from the cache
     */
    async removeAsset(path) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['assets'], 'readwrite');
            const store = transaction.objectStore('assets');
            const index = store.index('path');
            // First find the asset by path to get its ID
            const getRequest = index.get(path);
            getRequest.onsuccess = () => {
                const asset = getRequest.result;
                if (!asset) {
                    resolve(false);
                    return;
                }
                const deleteRequest = store.delete(asset.id);
                deleteRequest.onsuccess = () => resolve(true);
                deleteRequest.onerror = () => reject(new Error(`Failed to delete asset: ${deleteRequest.error}`));
            };
            getRequest.onerror = () => reject(new Error(`Failed to find asset: ${getRequest.error}`));
        });
    }
    /**
     * Searches assets by criteria
     */
    async searchAssets(criteria) {
        if (!this.db) {
            console.warn('Asset Atlas | Database not initialized, returning empty results');
            return [];
        }
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['assets'], 'readonly');
                const store = transaction.objectStore('assets');
                const request = store.getAll();
                // Handle transaction errors
                transaction.onerror = () => {
                    const error = transaction.error;
                    console.error('Asset Atlas | Transaction error during search:', error);
                    // Return empty array instead of rejecting to allow UI to continue
                    resolve([]);
                };
                transaction.onabort = () => {
                    console.error('Asset Atlas | Transaction aborted during search');
                    resolve([]);
                };
                request.onsuccess = () => {
                    try {
                        let results = request.result;
                        // Apply filters
                        results = this.applyFilters(results, criteria);
                        // Apply pagination
                        if (criteria.offset !== undefined) {
                            results = results.slice(criteria.offset);
                        }
                        if (criteria.limit !== undefined) {
                            results = results.slice(0, criteria.limit);
                        }
                        resolve(results);
                    }
                    catch (error) {
                        console.error('Asset Atlas | Error filtering results:', error);
                        // Return unfiltered results if filtering fails
                        resolve(request.result);
                    }
                };
                request.onerror = () => {
                    const error = request.error;
                    console.error('Asset Atlas | Failed to search assets:', error);
                    // Return empty array to allow UI to continue
                    resolve([]);
                };
            }
            catch (error) {
                console.error('Asset Atlas | Unexpected error in searchAssets:', error);
                resolve([]);
            }
        });
    }
    /**
     * Updates usage information for an asset
     */
    async updateUsage(path, usage) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['assets'], 'readwrite');
            const store = transaction.objectStore('assets');
            const index = store.index('path');
            const getRequest = index.get(path);
            getRequest.onsuccess = () => {
                const asset = getRequest.result;
                if (!asset) {
                    reject(new Error(`Asset not found: ${path}`));
                    return;
                }
                asset.usage = usage;
                const putRequest = store.put(asset);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(new Error(`Failed to update usage: ${putRequest.error}`));
            };
            getRequest.onerror = () => reject(new Error(`Failed to find asset: ${getRequest.error}`));
        });
    }
    /**
     * Apply filters to asset collection
     */
    applyFilters(assets, criteria) {
        let filtered = assets;
        // Filter by query (name search)
        if (criteria.query) {
            const query = criteria.query.toLowerCase();
            filtered = filtered.filter(asset => asset.name.toLowerCase().includes(query));
        }
        // Filter by types
        if (criteria.types && criteria.types.length > 0) {
            filtered = filtered.filter(asset => criteria.types.includes(asset.type));
        }
        // Filter by tags (must have ALL selected tags)
        if (criteria.tags && criteria.tags.length > 0) {
            filtered = filtered.filter(asset => criteria.tags.every(tag => asset.tags.includes(tag)));
        }
        // Filter by size range
        if (criteria.minSize !== undefined) {
            filtered = filtered.filter(asset => asset.size >= criteria.minSize);
        }
        if (criteria.maxSize !== undefined) {
            filtered = filtered.filter(asset => asset.size <= criteria.maxSize);
        }
        // Filter by unused only
        if (criteria.unusedOnly) {
            filtered = filtered.filter(asset => asset.usage.count === 0);
        }
        return filtered;
    }
    /**
     * Generate a unique ID for an asset
     */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

/**
 * Tag Manager - Handles tag creation, assignment, and persistence
 */
class TagManager {
    constructor() {
        this.db = null;
        this.dbName = 'AssetAtlasTagDB';
        this.dbVersion = 1;
    }
    /**
     * Initialize the tag database
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                request.onerror = () => {
                    const error = request.error;
                    console.error('Asset Atlas | Tag database initialization failed:', error);
                    if (error?.name === 'QuotaExceededError') {
                        reject(new Error('Database quota exceeded. Please free up browser storage space.'));
                    }
                    else if (error?.name === 'VersionError') {
                        reject(new Error('Database version conflict. Try clearing browser data for this site.'));
                    }
                    else {
                        reject(new Error(`Failed to open tag database: ${error?.message || 'Unknown error'}`));
                    }
                };
                request.onsuccess = () => {
                    this.db = request.result;
                    // Handle database errors after opening
                    this.db.onerror = (event) => {
                        console.error('Asset Atlas | Tag database error:', event);
                    };
                    // Handle unexpected database close
                    this.db.onclose = () => {
                        console.warn('Asset Atlas | Tag database connection closed unexpectedly');
                        this.db = null;
                    };
                    resolve();
                };
                request.onupgradeneeded = (event) => {
                    try {
                        const db = event.target.result;
                        // Create tags object store
                        if (!db.objectStoreNames.contains('tags')) {
                            db.createObjectStore('tags', { keyPath: 'name' });
                        }
                        // Create asset_tags junction table
                        if (!db.objectStoreNames.contains('asset_tags')) {
                            const assetTagsStore = db.createObjectStore('asset_tags', { keyPath: 'id' });
                            assetTagsStore.createIndex('assetPath', 'assetPath', { unique: false });
                            assetTagsStore.createIndex('tagName', 'tagName', { unique: false });
                            assetTagsStore.createIndex('assetPath_tagName', ['assetPath', 'tagName'], { unique: true });
                        }
                    }
                    catch (error) {
                        console.error('Asset Atlas | Tag database schema creation failed:', error);
                        reject(new Error(`Failed to create tag database schema: ${error.message}`));
                    }
                };
                request.onblocked = () => {
                    console.warn('Asset Atlas | Tag database upgrade blocked by another connection');
                    reject(new Error('Database upgrade blocked. Please close other tabs with this site open.'));
                };
            }
            catch (error) {
                console.error('Asset Atlas | Failed to initiate tag database connection:', error);
                reject(new Error(`Tag database initialization error: ${error.message}`));
            }
        });
    }
    /**
     * Creates a new tag
     */
    async createTag(name) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        // Validate tag name
        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            throw new Error('Tag name cannot be empty');
        }
        if (trimmedName.length > 50) {
            throw new Error('Tag name cannot exceed 50 characters');
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tags'], 'readwrite');
            const store = transaction.objectStore('tags');
            // Check if tag already exists
            const getRequest = store.get(trimmedName);
            getRequest.onsuccess = () => {
                if (getRequest.result) {
                    reject(new Error(`Tag "${trimmedName}" already exists`));
                    return;
                }
                const tag = {
                    name: trimmedName,
                    created: Date.now(),
                    usageCount: 0
                };
                const addRequest = store.add(tag);
                addRequest.onsuccess = () => resolve(tag);
                addRequest.onerror = () => reject(new Error(`Failed to create tag: ${addRequest.error}`));
            };
            getRequest.onerror = () => reject(new Error(`Failed to check existing tag: ${getRequest.error}`));
        });
    }
    /**
     * Gets all existing tags
     */
    async getAllTags() {
        if (!this.db) {
            console.warn('Asset Atlas | Tag database not initialized, returning empty array');
            return [];
        }
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['tags'], 'readonly');
                const store = transaction.objectStore('tags');
                const request = store.getAll();
                transaction.onerror = () => {
                    console.error('Asset Atlas | Transaction error getting tags:', transaction.error);
                    resolve([]); // Return empty array to allow UI to continue
                };
                request.onsuccess = () => {
                    resolve(request.result);
                };
                request.onerror = () => {
                    console.error('Asset Atlas | Failed to get tags:', request.error);
                    resolve([]); // Return empty array to allow UI to continue
                };
            }
            catch (error) {
                console.error('Asset Atlas | Unexpected error in getAllTags:', error);
                resolve([]);
            }
        });
    }
    /**
     * Gets tags for an asset
     */
    async getAssetTags(assetPath) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['asset_tags'], 'readonly');
            const store = transaction.objectStore('asset_tags');
            const index = store.index('assetPath');
            const request = index.getAll(assetPath);
            request.onsuccess = () => {
                const assetTags = request.result;
                resolve(assetTags.map(at => at.tagName));
            };
            request.onerror = () => {
                reject(new Error(`Failed to get asset tags: ${request.error}`));
            };
        });
    }
    /**
     * Adds tags to assets
     */
    async addTagsToAssets(assetPaths, tagNames) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        // Process all additions first, then update usage counts
        const addedTags = new Map(); // tagName -> count of new associations
        for (const assetPath of assetPaths) {
            for (const tagName of tagNames) {
                const transaction = this.db.transaction(['asset_tags'], 'readwrite');
                const assetTagsStore = transaction.objectStore('asset_tags');
                const index = assetTagsStore.index('assetPath_tagName');
                await new Promise((resolve, reject) => {
                    const getRequest = index.get([assetPath, tagName]);
                    getRequest.onsuccess = () => {
                        if (getRequest.result) {
                            // Association already exists, skip
                            resolve();
                            return;
                        }
                        // Create association
                        const assetTag = {
                            id: this.generateId(),
                            assetPath,
                            tagName,
                            added: Date.now()
                        };
                        const addRequest = assetTagsStore.add(assetTag);
                        addRequest.onsuccess = () => {
                            // Track that we added this tag
                            addedTags.set(tagName, (addedTags.get(tagName) || 0) + 1);
                            resolve();
                        };
                        addRequest.onerror = () => reject(new Error(`Failed to add tag: ${addRequest.error}`));
                    };
                    getRequest.onerror = () => reject(new Error(`Failed to check existing tag: ${getRequest.error}`));
                });
            }
        }
        // Now update usage counts for all affected tags
        for (const [tagName, count] of addedTags.entries()) {
            const transaction = this.db.transaction(['tags'], 'readwrite');
            const tagsStore = transaction.objectStore('tags');
            await new Promise((resolve, reject) => {
                const getRequest = tagsStore.get(tagName);
                getRequest.onsuccess = () => {
                    const tag = getRequest.result;
                    if (tag) {
                        tag.usageCount += count;
                        const putRequest = tagsStore.put(tag);
                        putRequest.onsuccess = () => resolve();
                        putRequest.onerror = () => reject(new Error(`Failed to update usage count: ${putRequest.error}`));
                    }
                    else {
                        resolve();
                    }
                };
                getRequest.onerror = () => reject(new Error(`Failed to get tag: ${getRequest.error}`));
            });
        }
    }
    /**
     * Removes tags from assets
     */
    async removeTagsFromAssets(assetPaths, tagNames) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        // Track removed tags for usage count updates
        const removedTags = new Map(); // tagName -> count of removed associations
        for (const assetPath of assetPaths) {
            for (const tagName of tagNames) {
                const transaction = this.db.transaction(['asset_tags'], 'readwrite');
                const assetTagsStore = transaction.objectStore('asset_tags');
                const index = assetTagsStore.index('assetPath_tagName');
                await new Promise((resolve, reject) => {
                    const getRequest = index.get([assetPath, tagName]);
                    getRequest.onsuccess = () => {
                        const assetTag = getRequest.result;
                        if (!assetTag) {
                            // Association doesn't exist, skip
                            resolve();
                            return;
                        }
                        // Delete association
                        const deleteRequest = assetTagsStore.delete(assetTag.id);
                        deleteRequest.onsuccess = () => {
                            // Track that we removed this tag
                            removedTags.set(tagName, (removedTags.get(tagName) || 0) + 1);
                            resolve();
                        };
                        deleteRequest.onerror = () => reject(new Error(`Failed to remove tag: ${deleteRequest.error}`));
                    };
                    getRequest.onerror = () => reject(new Error(`Failed to find tag association: ${getRequest.error}`));
                });
            }
        }
        // Now update usage counts for all affected tags
        for (const [tagName, count] of removedTags.entries()) {
            const transaction = this.db.transaction(['tags'], 'readwrite');
            const tagsStore = transaction.objectStore('tags');
            await new Promise((resolve, reject) => {
                const getRequest = tagsStore.get(tagName);
                getRequest.onsuccess = () => {
                    const tag = getRequest.result;
                    if (tag && tag.usageCount > 0) {
                        tag.usageCount = Math.max(0, tag.usageCount - count);
                        const putRequest = tagsStore.put(tag);
                        putRequest.onsuccess = () => resolve();
                        putRequest.onerror = () => reject(new Error(`Failed to update usage count: ${putRequest.error}`));
                    }
                    else {
                        resolve();
                    }
                };
                getRequest.onerror = () => reject(new Error(`Failed to get tag: ${getRequest.error}`));
            });
        }
    }
    /**
     * Generate a unique ID
     */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

/**
 * Asset Scanner - Discovers and indexes assets from the file system
 */
class AssetScanner {
    constructor(cache) {
        this.excludedDirectories = [];
        this.supportedExtensions = {
            image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
            audio: ['mp3', 'ogg', 'wav', 'flac'],
            video: ['mp4', 'webm']
        };
        this.cache = cache;
    }
    /**
     * Sets the excluded directories
     */
    setExcludedDirectories(directories) {
        this.excludedDirectories = directories;
    }
    /**
     * Gets the excluded directories
     */
    getExcludedDirectories() {
        return [...this.excludedDirectories];
    }
    /**
     * Checks if a path should be excluded from scanning
     */
    isPathExcluded(path) {
        // Normalize path separators
        const normalizedPath = path.replace(/\\/g, '/');
        for (const excludedDir of this.excludedDirectories) {
            const normalizedExcluded = excludedDir.replace(/\\/g, '/');
            // Check if path starts with excluded directory
            if (normalizedPath.startsWith(normalizedExcluded)) {
                return true;
            }
            // Check if path contains excluded directory as a segment
            if (normalizedPath.includes(`/${normalizedExcluded}/`) ||
                normalizedPath.includes(`/${normalizedExcluded}`)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Checks if a file is a supported asset type
     */
    isSupportedAsset(path) {
        const extension = this.getFileExtension(path);
        for (const type of Object.keys(this.supportedExtensions)) {
            const extensions = this.supportedExtensions[type];
            if (extensions.includes(extension)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Gets the asset type from a file path
     */
    getAssetType(path) {
        const extension = this.getFileExtension(path);
        for (const [type, extensions] of Object.entries(this.supportedExtensions)) {
            if (extensions.includes(extension)) {
                return type;
            }
        }
        return null;
    }
    /**
     * Extracts metadata from an asset file
     */
    async extractMetadata(path) {
        const type = this.getAssetType(path);
        if (!type) {
            throw new Error(`Unsupported asset type: ${path}`);
        }
        const name = this.getFileName(path);
        // Get file size using HTTP HEAD request
        let size = 0;
        try {
            const response = await fetch(path, { method: 'HEAD' });
            const contentLength = response.headers.get('content-length');
            if (contentLength) {
                size = parseInt(contentLength, 10);
            }
        }
        catch (error) {
            console.warn(`Asset Atlas | Could not get file size for ${path}:`, error);
        }
        const metadata = {
            path,
            name,
            type,
            size,
            modifiedDate: Date.now()
        };
        // For images, try to extract dimensions
        if (type === 'image') {
            try {
                metadata.dimensions = await this.extractImageDimensions(path);
            }
            catch (error) {
                console.warn(`Asset Atlas | Could not extract dimensions for ${path}`);
            }
        }
        return metadata;
    }
    /**
     * Generates a thumbnail for an image asset
     */
    async generateThumbnail(path) {
        // In a real implementation, this would:
        // 1. Load the image
        // 2. Create a canvas element
        // 3. Draw the image scaled down
        // 4. Return base64 encoded thumbnail
        // For now, return a placeholder
        return `data:image/png;base64,placeholder-for-${path}`;
    }
    /**
     * Scans directories for assets and updates the cache
     */
    async scan(directories, incremental = true) {
        const startTime = Date.now();
        const result = {
            assetsFound: 0,
            assetsAdded: 0,
            assetsUpdated: 0,
            assetsRemoved: 0,
            duration: 0,
            errors: []
        };
        try {
            // Filter out excluded directories
            const filteredDirectories = directories.filter(dir => !this.isPathExcluded(dir));
            if (filteredDirectories.length < directories.length) {
                console.log(`Asset Atlas | Excluded ${directories.length - filteredDirectories.length} directories from scan`);
            }
            console.log(`Asset Atlas | Scanning ${filteredDirectories.length} directories...`);
            // Scan each directory
            for (const directory of filteredDirectories) {
                try {
                    await this.scanDirectory(directory, incremental, result);
                }
                catch (error) {
                    console.error(`Asset Atlas | Error scanning directory ${directory}:`, error);
                    result.errors.push(`${directory}: ${error.message}`);
                }
            }
            result.duration = Date.now() - startTime;
            console.log(`Asset Atlas | Scan complete in ${result.duration}ms`);
        }
        catch (error) {
            result.errors.push(error.message);
        }
        return result;
    }
    /**
     * Recursively scans a directory for assets
     */
    async scanDirectory(path, incremental, result) {
        // Check if path is excluded
        if (this.isPathExcluded(path)) {
            console.log(`Asset Atlas | Skipping excluded path: ${path}`);
            return;
        }
        try {
            // Use Foundry's FilePicker to browse the directory
            if (typeof FilePicker === 'undefined') {
                console.warn('Asset Atlas | FilePicker not available, skipping scan');
                return;
            }
            console.log(`Asset Atlas | Browsing directory: ${path}`);
            const browseResult = await FilePicker.browse("data", path);
            console.log(`Asset Atlas | Browse result for ${path}:`, {
                files: browseResult.files?.length || 0,
                dirs: browseResult.dirs?.length || 0
            });
            // Process files in this directory
            if (browseResult.files && Array.isArray(browseResult.files)) {
                console.log(`Asset Atlas | Found ${browseResult.files.length} files in ${path}`);
                for (const filePath of browseResult.files) {
                    if (this.isSupportedAsset(filePath)) {
                        console.log(`Asset Atlas | Processing supported asset: ${filePath}`);
                        await this.processAsset(filePath, incremental, result);
                    }
                    else {
                        console.log(`Asset Atlas | Skipping unsupported file: ${filePath}`);
                    }
                }
            }
            // Recursively scan subdirectories
            if (browseResult.dirs && Array.isArray(browseResult.dirs)) {
                console.log(`Asset Atlas | Found ${browseResult.dirs.length} subdirectories in ${path}`);
                for (const subdir of browseResult.dirs) {
                    await this.scanDirectory(subdir, incremental, result);
                }
            }
        }
        catch (error) {
            // Directory might not exist or be inaccessible
            console.warn(`Asset Atlas | Error browsing ${path}:`, error);
            if (!error?.message?.includes('ENOENT') && !error?.message?.includes('does not exist')) {
                result.errors.push(`${path}: ${error?.message || 'Unknown error'}`);
            }
        }
    }
    /**
     * Processes a single asset file
     */
    async processAsset(path, incremental, result) {
        result.assetsFound++;
        try {
            // Check if asset already exists in cache
            const existing = await this.cache.getAsset(path);
            if (existing && incremental) {
                // For incremental scan, check if file has been modified
                // For now, we'll skip checking modification dates and just count as found
                return;
            }
            // Extract metadata
            const metadata = await this.extractMetadata(path);
            // Add to cache
            await this.cache.upsertAsset(metadata);
            if (existing) {
                result.assetsUpdated++;
            }
            else {
                result.assetsAdded++;
            }
            // Log progress every 10 assets
            if (result.assetsFound % 10 === 0) {
                console.log(`Asset Atlas | Processed ${result.assetsFound} assets...`);
            }
        }
        catch (error) {
            const errorMessage = error.message;
            console.error(`Asset Atlas | Error processing ${path}:`, error);
            // Handle specific error types
            if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
                // File was deleted between scan and processing - mark as missing
                console.warn(`Asset Atlas | File missing: ${path}`);
                result.errors.push(`${path}: File not found (may have been deleted)`);
            }
            else if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
                // Permission error - log and continue
                console.warn(`Asset Atlas | Permission denied: ${path}`);
                result.errors.push(`${path}: Permission denied`);
            }
            else if (errorMessage.includes('corrupted') || errorMessage.includes('invalid')) {
                // Corrupted file - log and continue
                console.warn(`Asset Atlas | Corrupted file: ${path}`);
                result.errors.push(`${path}: File appears to be corrupted`);
            }
            else {
                // Unknown error
                result.errors.push(`${path}: ${errorMessage}`);
            }
        }
    }
    /**
     * Gets the file extension from a path
     */
    getFileExtension(path) {
        const parts = path.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }
    /**
     * Gets the file name from a path
     */
    getFileName(path) {
        const parts = path.split('/');
        return parts[parts.length - 1];
    }
    /**
     * Extracts image dimensions
     */
    async extractImageDimensions(path) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.width, height: img.height });
            };
            img.onerror = () => {
                resolve(undefined);
            };
            // Set the image source to the asset path
            img.src = path;
            // Timeout after 5 seconds
            setTimeout(() => resolve(undefined), 5000);
        });
    }
    /**
     * Extracts media duration
     */
    async extractMediaDuration(path) {
        // In a real implementation, this would load the media and get its duration
        // For now, return undefined
        return undefined;
    }
}

/**
 * Usage Tracker - Tracks asset usage across Foundry documents
 */
class UsageTracker {
    constructor(cache) {
        this.cache = cache;
    }
    /**
     * Scans all documents to build usage information
     * In a real Foundry implementation, this would iterate through:
     * - game.scenes
     * - game.journal
     * - game.actors
     */
    async scanAllDocuments() {
        const usageMap = new Map();
        try {
            // Check if Foundry game object is available
            if (typeof game === 'undefined') {
                console.warn('Asset Atlas | Foundry game object not available');
                return usageMap;
            }
            // Scan scenes
            try {
                if (game.scenes) {
                    for (const scene of game.scenes) {
                        try {
                            const paths = this.extractAssetPaths(scene.data || scene);
                            for (const path of paths) {
                                const usage = usageMap.get(path) || {
                                    scenes: [],
                                    journals: [],
                                    actors: [],
                                    count: 0
                                };
                                usage.scenes.push(scene.id);
                                usage.count++;
                                usageMap.set(path, usage);
                            }
                        }
                        catch (error) {
                            console.warn(`Asset Atlas | Error scanning scene ${scene.id}:`, error);
                        }
                    }
                }
            }
            catch (error) {
                console.error('Asset Atlas | Error scanning scenes:', error);
            }
            // Scan journals
            try {
                if (game.journal) {
                    for (const journal of game.journal) {
                        try {
                            const paths = this.extractAssetPaths(journal.data || journal);
                            for (const path of paths) {
                                const usage = usageMap.get(path) || {
                                    scenes: [],
                                    journals: [],
                                    actors: [],
                                    count: 0
                                };
                                usage.journals.push(journal.id);
                                usage.count++;
                                usageMap.set(path, usage);
                            }
                        }
                        catch (error) {
                            console.warn(`Asset Atlas | Error scanning journal ${journal.id}:`, error);
                        }
                    }
                }
            }
            catch (error) {
                console.error('Asset Atlas | Error scanning journals:', error);
            }
            // Scan actors
            try {
                if (game.actors) {
                    for (const actor of game.actors) {
                        try {
                            const paths = this.extractAssetPaths(actor.data || actor);
                            for (const path of paths) {
                                const usage = usageMap.get(path) || {
                                    scenes: [],
                                    journals: [],
                                    actors: [],
                                    count: 0
                                };
                                usage.actors.push(actor.id);
                                usage.count++;
                                usageMap.set(path, usage);
                            }
                        }
                        catch (error) {
                            console.warn(`Asset Atlas | Error scanning actor ${actor.id}:`, error);
                        }
                    }
                }
            }
            catch (error) {
                console.error('Asset Atlas | Error scanning actors:', error);
            }
        }
        catch (error) {
            console.error('Asset Atlas | Error in scanAllDocuments:', error);
        }
        return usageMap;
    }
    /**
     * Finds all references to an asset
     */
    async findAssetReferences(assetPath) {
        const usage = {
            scenes: [],
            journals: [],
            actors: [],
            count: 0
        };
        // In a real implementation, this would:
        // 1. Search through all scenes for the asset path
        // 2. Search through all journals for the asset path
        // 3. Search through all actors for the asset path
        // 4. Collect document IDs and calculate total count
        return usage;
    }
    /**
     * Updates document references when an asset is moved
     */
    async updateReferences(oldPath, newPath) {
        const result = {
            scenesUpdated: 0,
            journalsUpdated: 0,
            actorsUpdated: 0,
            errors: []
        };
        try {
            // Check if Foundry game object is available
            if (typeof game === 'undefined') {
                console.warn('Asset Atlas | Foundry game object not available');
                result.errors.push('Foundry game object not available');
                return result;
            }
            // Track all updates for potential rollback
            const updatedDocuments = [];
            // Update scenes
            try {
                if (game.scenes) {
                    for (const scene of game.scenes) {
                        try {
                            const sceneData = scene.data || scene;
                            if (this.replaceAssetPaths(sceneData, oldPath, newPath)) {
                                // Store old data for rollback
                                updatedDocuments.push({
                                    type: 'scene',
                                    id: scene.id,
                                    oldData: JSON.parse(JSON.stringify(sceneData))
                                });
                                // Update the scene
                                await scene.update(sceneData);
                                result.scenesUpdated++;
                            }
                        }
                        catch (error) {
                            const errorMsg = `Scene ${scene.id}: ${error.message}`;
                            console.error(`Asset Atlas | ${errorMsg}`);
                            result.errors.push(errorMsg);
                        }
                    }
                }
            }
            catch (error) {
                const errorMsg = `Error updating scenes: ${error.message}`;
                console.error(`Asset Atlas | ${errorMsg}`);
                result.errors.push(errorMsg);
            }
            // Update journals
            try {
                if (game.journal) {
                    for (const journal of game.journal) {
                        try {
                            const journalData = journal.data || journal;
                            if (this.replaceAssetPaths(journalData, oldPath, newPath)) {
                                // Store old data for rollback
                                updatedDocuments.push({
                                    type: 'journal',
                                    id: journal.id,
                                    oldData: JSON.parse(JSON.stringify(journalData))
                                });
                                // Update the journal
                                await journal.update(journalData);
                                result.journalsUpdated++;
                            }
                        }
                        catch (error) {
                            const errorMsg = `Journal ${journal.id}: ${error.message}`;
                            console.error(`Asset Atlas | ${errorMsg}`);
                            result.errors.push(errorMsg);
                        }
                    }
                }
            }
            catch (error) {
                const errorMsg = `Error updating journals: ${error.message}`;
                console.error(`Asset Atlas | ${errorMsg}`);
                result.errors.push(errorMsg);
            }
            // Update actors
            try {
                if (game.actors) {
                    for (const actor of game.actors) {
                        try {
                            const actorData = actor.data || actor;
                            if (this.replaceAssetPaths(actorData, oldPath, newPath)) {
                                // Store old data for rollback
                                updatedDocuments.push({
                                    type: 'actor',
                                    id: actor.id,
                                    oldData: JSON.parse(JSON.stringify(actorData))
                                });
                                // Update the actor
                                await actor.update(actorData);
                                result.actorsUpdated++;
                            }
                        }
                        catch (error) {
                            const errorMsg = `Actor ${actor.id}: ${error.message}`;
                            console.error(`Asset Atlas | ${errorMsg}`);
                            result.errors.push(errorMsg);
                        }
                    }
                }
            }
            catch (error) {
                const errorMsg = `Error updating actors: ${error.message}`;
                console.error(`Asset Atlas | ${errorMsg}`);
                result.errors.push(errorMsg);
            }
            // If there were errors, attempt rollback
            if (result.errors.length > 0 && updatedDocuments.length > 0) {
                console.warn('Asset Atlas | Errors occurred, attempting rollback...');
                await this.rollbackUpdates(updatedDocuments);
            }
        }
        catch (error) {
            const errorMsg = `Critical error in updateReferences: ${error.message}`;
            console.error(`Asset Atlas | ${errorMsg}`);
            result.errors.push(errorMsg);
        }
        return result;
    }
    /**
     * Rollback document updates
     */
    async rollbackUpdates(updatedDocuments) {
        try {
            if (typeof game === 'undefined') {
                console.error('Asset Atlas | Cannot rollback: Foundry game object not available');
                return;
            }
            for (const doc of updatedDocuments) {
                try {
                    let collection;
                    switch (doc.type) {
                        case 'scene':
                            collection = game.scenes;
                            break;
                        case 'journal':
                            collection = game.journal;
                            break;
                        case 'actor':
                            collection = game.actors;
                            break;
                    }
                    if (collection) {
                        const document = collection.get(doc.id);
                        if (document) {
                            await document.update(doc.oldData);
                            console.log(`Asset Atlas | Rolled back ${doc.type} ${doc.id}`);
                        }
                    }
                }
                catch (error) {
                    console.error(`Asset Atlas | Failed to rollback ${doc.type} ${doc.id}:`, error);
                }
            }
        }
        catch (error) {
            console.error('Asset Atlas | Critical error during rollback:', error);
        }
    }
    /**
     * Extracts asset paths from a document's data
     * This is a helper method that would be used by scanAllDocuments
     */
    extractAssetPaths(documentData) {
        const paths = [];
        // Recursively search through document data for asset paths
        const searchObject = (obj) => {
            if (!obj || typeof obj !== 'object')
                return;
            for (const key in obj) {
                const value = obj[key];
                // Check if this looks like an asset path
                if (typeof value === 'string' && this.isAssetPath(value)) {
                    paths.push(value);
                }
                else if (typeof value === 'object') {
                    searchObject(value);
                }
            }
        };
        searchObject(documentData);
        return paths;
    }
    /**
     * Checks if a string looks like an asset path
     */
    isAssetPath(str) {
        // Check for common asset path patterns
        const assetExtensions = /\.(png|jpg|jpeg|gif|webp|svg|mp3|ogg|wav|flac|mp4|webm)$/i;
        return assetExtensions.test(str);
    }
    /**
     * Updates a document's asset references
     * This is a helper method that would be used by updateReferences
     */
    replaceAssetPaths(documentData, oldPath, newPath) {
        let modified = false;
        const replaceInObject = (obj) => {
            if (!obj || typeof obj !== 'object')
                return;
            for (const key in obj) {
                const value = obj[key];
                if (typeof value === 'string' && value === oldPath) {
                    obj[key] = newPath;
                    modified = true;
                }
                else if (typeof value === 'object') {
                    replaceInObject(value);
                }
            }
        };
        replaceInObject(documentData);
        return modified;
    }
}

/**
 * Asset Organizer - Handles move, rename, and delete operations
 */
class AssetOrganizer {
    constructor(cache, usageTracker) {
        this.cache = cache;
        this.usageTracker = usageTracker;
    }
    /**
     * Move an asset to a new location
     * @param asset - The asset to move
     * @param newPath - The new path for the asset
     * @returns Promise<boolean> - Success status
     */
    async moveAsset(asset, newPath) {
        const oldPath = asset.path;
        let fileMoved = false;
        let referencesUpdated = false;
        try {
            // Validate new path
            if (!newPath || newPath === oldPath) {
                throw new Error('Invalid destination path');
            }
            // Check if destination already exists
            const existingAsset = await this.cache.getAsset(newPath);
            if (existingAsset) {
                throw new Error('An asset already exists at the destination path');
            }
            // Step 1: Move the file using Foundry's file system API
            try {
                fileMoved = await this.moveFile(oldPath, newPath);
                if (!fileMoved) {
                    throw new Error('Failed to move file - file system operation returned false');
                }
            }
            catch (error) {
                const errorMessage = error.message;
                if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
                    throw new Error('Source file not found');
                }
                else if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
                    throw new Error('Permission denied - check file permissions');
                }
                else if (errorMessage.includes('ENOSPC') || errorMessage.includes('disk space')) {
                    throw new Error('Insufficient disk space');
                }
                else {
                    throw error;
                }
            }
            // Step 2: Update all document references
            try {
                const updateResult = await this.usageTracker.updateReferences(oldPath, newPath);
                if (updateResult.errors.length > 0) {
                    throw new Error(`Failed to update ${updateResult.errors.length} reference(s): ${updateResult.errors.join(', ')}`);
                }
                referencesUpdated = true;
            }
            catch (error) {
                // Rollback: move file back
                console.error('Asset Atlas | Reference update failed, rolling back file move');
                try {
                    await this.moveFile(newPath, oldPath);
                    fileMoved = false;
                }
                catch (rollbackError) {
                    console.error('Asset Atlas | CRITICAL: Rollback failed!', rollbackError);
                    ui.notifications?.error('Critical error: File moved but references not updated and rollback failed. Manual intervention required.');
                }
                throw error;
            }
            // Step 3: Update the asset cache with new path
            try {
                await this.cache.removeAsset(oldPath);
                const updatedAsset = {
                    ...asset,
                    path: newPath,
                    name: this.extractFileName(newPath)
                };
                await this.cache.upsertAsset(updatedAsset);
            }
            catch (error) {
                console.error('Asset Atlas | Cache update failed after successful move', error);
                // Don't rollback file move if cache update fails - cache can be rebuilt
                ui.notifications?.warn('Asset moved successfully but cache update failed. Try refreshing the asset list.');
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            console.error('Asset Atlas | Move operation failed:', error);
            ui.notifications?.error(`Failed to move asset: ${errorMessage}`);
            return false;
        }
    }
    /**
     * Rename an asset (move within same directory)
     * @param asset - The asset to rename
     * @param newName - The new name for the asset
     * @returns Promise<boolean> - Success status
     */
    async renameAsset(asset, newName) {
        const directory = this.getDirectory(asset.path);
        const newPath = `${directory}/${newName}`;
        return this.moveAsset(asset, newPath);
    }
    /**
     * Delete one or more assets
     * @param assets - Array of assets to delete
     * @returns Promise<{success: number, failed: number, totalSize: number}>
     */
    async deleteAssets(assets) {
        let success = 0;
        let failed = 0;
        let totalSize = 0;
        for (const asset of assets) {
            try {
                // Delete the file using Foundry's file system API
                const deleted = await this.deleteFile(asset.path);
                if (deleted) {
                    // Remove from cache
                    try {
                        await this.cache.removeAsset(asset.path);
                        success++;
                        totalSize += asset.size;
                    }
                    catch (cacheError) {
                        console.error(`Asset Atlas | Failed to remove ${asset.path} from cache:`, cacheError);
                        // File was deleted but cache removal failed - still count as success
                        success++;
                        totalSize += asset.size;
                        ui.notifications?.warn(`Asset deleted but cache update failed for ${asset.name}. Try refreshing.`);
                    }
                }
                else {
                    failed++;
                    console.warn(`Asset Atlas | Delete returned false for ${asset.path}`);
                }
            }
            catch (error) {
                const errorMessage = error.message;
                console.error(`Asset Atlas | Failed to delete asset ${asset.path}:`, error);
                // Handle specific error types
                if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
                    // File already deleted - remove from cache anyway
                    try {
                        await this.cache.removeAsset(asset.path);
                        console.log(`Asset Atlas | Removed missing file ${asset.path} from cache`);
                    }
                    catch (cacheError) {
                        console.error(`Asset Atlas | Failed to remove missing file from cache:`, cacheError);
                    }
                }
                else if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
                    ui.notifications?.warn(`Permission denied for ${asset.name}`);
                }
                else if (errorMessage.includes('EBUSY') || errorMessage.includes('in use')) {
                    ui.notifications?.warn(`File ${asset.name} is currently in use`);
                }
                failed++;
            }
        }
        return { success, failed, totalSize };
    }
    /**
     * Dry run for deletion - shows what would be deleted without actually deleting
     * @param assets - Array of assets to check
     * @returns Promise<{assets: CachedAsset[], totalSize: number, totalCount: number}>
     */
    async dryRunDelete(assets) {
        const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0);
        const totalCount = assets.length;
        return {
            assets,
            totalSize,
            totalCount
        };
    }
    /**
     * Move a file using Foundry's file system API
     * In a real implementation, this would use Foundry's FilePicker API
     */
    async moveFile(oldPath, newPath) {
        // In a real Foundry implementation, this would use:
        // const source = await fetch(oldPath);
        // const blob = await source.blob();
        // await FilePicker.upload("data", newPath, new File([blob], fileName));
        // await FilePicker.delete("data", oldPath);
        // For now, return true to simulate success
        return true;
    }
    /**
     * Delete a file using Foundry's file system API
     * In a real implementation, this would use Foundry's FilePicker API
     */
    async deleteFile(path) {
        // In a real Foundry implementation, this would use:
        // const result = await FilePicker.delete("data", path);
        // return result !== null;
        // For now, return true to simulate success
        return true;
    }
    /**
     * Extract directory from a file path
     */
    getDirectory(path) {
        const lastSlash = path.lastIndexOf('/');
        return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
    }
    /**
     * Extract file name from a path
     */
    extractFileName(path) {
        const lastSlash = path.lastIndexOf('/');
        return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
    }
}

/**
 * Asset Atlas Folder Manager
 * Manages the dedicated folder structure for Asset Atlas
 */
class AssetAtlasFolder {
    constructor() {
        this.baseFolder = 'asset-atlas';
        this.libraryFolder = 'library';
        this.worldsFolder = 'worlds';
    }
    /**
     * Get the base Asset Atlas folder path
     */
    getBasePath() {
        return this.baseFolder;
    }
    /**
     * Get the global library path
     */
    getLibraryPath() {
        return `${this.baseFolder}/${this.libraryFolder}`;
    }
    /**
     * Get the library path for a specific asset type
     */
    getLibraryTypePath(type) {
        return `${this.getLibraryPath()}/${type}s`;
    }
    /**
     * Get the world folder path
     */
    getWorldPath(worldName) {
        return `${this.baseFolder}/${this.worldsFolder}/${worldName}`;
    }
    /**
     * Get the world path for a specific asset type
     */
    getWorldTypePath(worldName, type) {
        return `${this.getWorldPath(worldName)}/${type}s`;
    }
    /**
     * Get all standard paths that should be created
     */
    getStandardPaths(worldName) {
        const paths = [
            this.getBasePath(),
            this.getLibraryPath(),
            this.getLibraryTypePath('image'),
            this.getLibraryTypePath('audio'),
            this.getLibraryTypePath('video')
        ];
        if (worldName) {
            // Add the worlds folder first, then the specific world folder
            paths.push(`${this.baseFolder}/${this.worldsFolder}`, this.getWorldPath(worldName), this.getWorldTypePath(worldName, 'image'), this.getWorldTypePath(worldName, 'audio'), this.getWorldTypePath(worldName, 'video'));
        }
        return paths;
    }
    /**
     * Initialize the folder structure
     * Creates all necessary directories using Foundry's FilePicker API
     */
    async initializeFolders(worldName) {
        const paths = this.getStandardPaths(worldName);
        const result = {
            created: [],
            existing: [],
            errors: []
        };
        // Sort paths by depth to ensure parent directories are created first
        const sortedPaths = paths.sort((a, b) => {
            const depthA = a.split('/').length;
            const depthB = b.split('/').length;
            return depthA - depthB;
        });
        for (const path of sortedPaths) {
            try {
                // Use Foundry's FilePicker to create directory
                if (typeof FilePicker !== 'undefined') {
                    await FilePicker.createDirectory("data", path, {});
                    result.created.push(path);
                    console.log(`Asset Atlas | Created directory: ${path}`);
                }
                else {
                    // Fallback for testing environment
                    console.log(`Asset Atlas | Would create directory: ${path}`);
                    result.created.push(path);
                }
            }
            catch (error) {
                // Directory might already exist, which is fine
                if (error?.message?.includes('EEXIST') || error?.message?.includes('exists')) {
                    result.existing.push(path);
                    console.log(`Asset Atlas | Directory already exists: ${path}`);
                }
                else {
                    result.errors.push(`${path}: ${error?.message || 'Unknown error'}`);
                    console.warn(`Asset Atlas | Error creating directory ${path}:`, error);
                }
            }
        }
        return result;
    }
    /**
     * Check if a path is in the Asset Atlas folder structure
     */
    isAssetAtlasPath(path) {
        return path.startsWith(this.baseFolder);
    }
    /**
     * Check if a path is in the global library
     */
    isLibraryPath(path) {
        return path.startsWith(this.getLibraryPath());
    }
    /**
     * Check if a path is in a world folder
     */
    isWorldPath(path) {
        return path.startsWith(`${this.baseFolder}/${this.worldsFolder}`);
    }
    /**
     * Extract world name from a world path
     */
    getWorldNameFromPath(path) {
        if (!this.isWorldPath(path))
            return null;
        const prefix = `${this.baseFolder}/${this.worldsFolder}/`;
        const remainder = path.substring(prefix.length);
        const firstSlash = remainder.indexOf('/');
        return firstSlash >= 0 ? remainder.substring(0, firstSlash) : remainder;
    }
    /**
     * Get the asset type from a path
     */
    getAssetTypeFromPath(path) {
        if (path.includes('/images/'))
            return 'image';
        if (path.includes('/audios/'))
            return 'audio';
        if (path.includes('/videos/'))
            return 'video';
        return null;
    }
}

/**
 * Asset Importer - Handles importing assets from library to world folders
 */
class AssetImporter {
    constructor(cache, folderManager) {
        this.cache = cache;
        this.folderManager = folderManager;
    }
    /**
     * Import assets from library to a world folder
     */
    async importToWorld(assets, worldName, options = {}) {
        const result = {
            success: 0,
            failed: 0,
            skipped: 0,
            errors: [],
            importedPaths: []
        };
        const { copy = true, overwrite = false, preserveStructure = false } = options;
        for (const asset of assets) {
            try {
                // Check if asset is from library
                if (!this.folderManager.isLibraryPath(asset.path)) {
                    result.skipped++;
                    result.errors.push(`Asset ${asset.path} is not in library`);
                    continue;
                }
                // Determine destination path
                const destPath = this.getDestinationPath(asset, worldName, preserveStructure);
                // Check if destination already exists
                const existing = await this.cache.getAsset(destPath);
                if (existing && !overwrite) {
                    result.skipped++;
                    continue;
                }
                // Copy or link the file
                if (copy) {
                    await this.copyAsset(asset.path, destPath);
                }
                else {
                    // For now, we'll copy anyway since linking is complex
                    await this.copyAsset(asset.path, destPath);
                }
                // Add to cache
                await this.cache.upsertAsset({
                    ...asset,
                    path: destPath,
                    modifiedDate: Date.now()
                });
                result.success++;
                result.importedPaths.push(destPath);
            }
            catch (error) {
                result.failed++;
                result.errors.push(`Failed to import ${asset.path}: ${error.message}`);
            }
        }
        return result;
    }
    /**
     * Import a single asset from library to world
     */
    async importSingleAsset(asset, worldName, options = {}) {
        const result = await this.importToWorld([asset], worldName, options);
        return result.success > 0 ? result.importedPaths[0] : null;
    }
    /**
     * Get the destination path for an imported asset
     */
    getDestinationPath(asset, worldName, preserveStructure) {
        const worldTypePath = this.folderManager.getWorldTypePath(worldName, asset.type);
        if (preserveStructure) {
            // Extract subfolder structure from library path
            const libraryTypePath = this.folderManager.getLibraryTypePath(asset.type);
            const relativePath = asset.path.substring(libraryTypePath.length + 1);
            return `${worldTypePath}/${relativePath}`;
        }
        else {
            // Just use the filename
            return `${worldTypePath}/${asset.name}`;
        }
    }
    /**
     * Copy an asset file
     * In a real Foundry implementation, this would use FilePicker
     */
    async copyAsset(sourcePath, destPath) {
        // In a real Foundry implementation:
        // const source = await fetch(sourcePath);
        // const blob = await source.blob();
        // const fileName = destPath.split('/').pop();
        // const directory = destPath.substring(0, destPath.lastIndexOf('/'));
        // await FilePicker.upload("data", directory, new File([blob], fileName));
        // For now, simulate success
        console.log(`Copied ${sourcePath} to ${destPath}`);
    }
    /**
     * Get all library assets
     */
    async getLibraryAssets(type) {
        const allAssets = await this.cache.searchAssets({});
        return allAssets.filter(asset => {
            const isLibrary = this.folderManager.isLibraryPath(asset.path);
            const matchesType = !type || asset.type === type;
            return isLibrary && matchesType;
        });
    }
    /**
     * Get all world assets
     */
    async getWorldAssets(worldName, type) {
        const allAssets = await this.cache.searchAssets({});
        const worldPath = this.folderManager.getWorldPath(worldName);
        return allAssets.filter(asset => {
            const isWorld = asset.path.startsWith(worldPath);
            const matchesType = !type || asset.type === type;
            return isWorld && matchesType;
        });
    }
}

/**
 * Move/Rename Dialog - Shows confirmation with affected references
 */
class MoveRenameDialog extends Dialog {
    constructor(options, dialogOptions = {}) {
        const title = options.operation === 'move' ? 'Move Asset' : 'Rename Asset';
        super({
            title,
            content: '',
            buttons: {},
            ...dialogOptions
        });
        this.asset = options.asset;
        this.operation = options.operation;
        this.usageTracker = options.usageTracker;
        this.usage = options.asset.usage;
    }
    /**
     * Get default options
     */
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            template: 'modules/asset-atlas/templates/move-rename-dialog.hbs',
            width: 500,
            classes: ['asset-atlas', 'move-rename-dialog'],
            resizable: true
        };
    }
    /**
     * Prepare data for rendering
     */
    async getData() {
        const data = await super.getData();
        const totalReferences = this.usage.count;
        const hasReferences = totalReferences > 0;
        // Generate suggested path based on operation
        const suggestedPath = this.operation === 'rename'
            ? this.asset.path
            : this.asset.path;
        return {
            ...data,
            currentPath: this.asset.path,
            suggestedPath,
            usage: this.usage,
            totalReferences,
            hasReferences
        };
    }
    /**
     * Activate event listeners
     */
    activateListeners(html) {
        super.activateListeners(html);
        html.find('.cancel-button').on('click', () => this.close());
        html.find('form').on('submit', this._onSubmit.bind(this));
    }
    /**
     * Handle form submission
     */
    async _onSubmit(event) {
        event.preventDefault();
        const form = $(event.currentTarget);
        const newPath = form.find('#new-path').val();
        if (!newPath || newPath === this.asset.path) {
            ui.notifications?.warn('Please enter a valid new path');
            return;
        }
        // Close dialog and return the new path
        this.close();
        // Trigger callback if provided
        if (this.data.callback) {
            this.data.callback(newPath);
        }
    }
    /**
     * Show the dialog and return a promise with the new path
     */
    static async show(options) {
        return new Promise((resolve) => {
            const dialog = new MoveRenameDialog(options, {
                callback: (newPath) => resolve(newPath)
            });
            dialog.render(true);
        });
    }
}

/**
 * Delete Confirmation Dialog - Shows warning and summary before deletion
 */
class DeleteConfirmationDialog extends Dialog {
    constructor(options, dialogOptions = {}) {
        super({
            title: 'Confirm Asset Deletion',
            content: '',
            buttons: {},
            ...dialogOptions
        });
        this.assets = options.assets;
    }
    /**
     * Get default options
     */
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            template: 'modules/asset-atlas/templates/delete-confirmation-dialog.hbs',
            width: 600,
            classes: ['asset-atlas', 'delete-confirmation-dialog'],
            resizable: true
        };
    }
    /**
     * Prepare data for rendering
     */
    async getData() {
        const data = await super.getData();
        const assetCount = this.assets.length;
        const totalSize = this.assets.reduce((sum, asset) => sum + asset.size, 0);
        // Identify assets that are in use
        const usedAssets = this.assets.filter(asset => asset.usage.count > 0);
        const hasUsedAssets = usedAssets.length > 0;
        const usedAssetCount = usedAssets.length;
        return {
            ...data,
            assets: this.assets,
            assetCount,
            totalSize,
            usedAssets,
            hasUsedAssets,
            usedAssetCount
        };
    }
    /**
     * Activate event listeners
     */
    activateListeners(html) {
        super.activateListeners(html);
        const deleteButton = html.find('.delete-button');
        const confirmCheckbox = html.find('#confirm-delete');
        // Enable delete button only when checkbox is checked
        confirmCheckbox.on('change', () => {
            deleteButton.prop('disabled', !confirmCheckbox.is(':checked'));
        });
        html.find('.cancel-button').on('click', () => {
            this.close();
        });
        html.find('.delete-button').on('click', () => {
            if (confirmCheckbox.is(':checked')) {
                this.close();
                if (this.data.callback) {
                    this.data.callback(true);
                }
            }
        });
    }
    /**
     * Show the dialog and return a promise with confirmation result
     */
    static async show(options) {
        return new Promise((resolve) => {
            const dialog = new DeleteConfirmationDialog(options, {
                callback: (confirmed) => resolve(confirmed)
            });
            dialog.render(true);
        });
    }
}

/**
 * Dry Run Dialog - Shows what would be deleted without actually deleting
 */
class DryRunDialog extends Dialog {
    constructor(options, dialogOptions = {}) {
        super({
            title: 'Dry Run - Deletion Preview',
            content: '',
            buttons: {},
            ...dialogOptions
        });
        this.assets = options.assets;
        this.totalSize = options.totalSize;
        this.totalCount = options.totalCount;
    }
    /**
     * Get default options
     */
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            template: 'modules/asset-atlas/templates/dry-run-dialog.hbs',
            width: 700,
            classes: ['asset-atlas', 'dry-run-dialog'],
            resizable: true
        };
    }
    /**
     * Prepare data for rendering
     */
    async getData() {
        const data = await super.getData();
        return {
            ...data,
            assets: this.assets,
            totalSize: this.totalSize,
            totalCount: this.totalCount
        };
    }
    /**
     * Activate event listeners
     */
    activateListeners(html) {
        super.activateListeners(html);
        html.find('.close-button').on('click', () => {
            this.close();
        });
        html.find('.proceed-button').on('click', () => {
            this.close();
            if (this.data.callback) {
                this.data.callback(true);
            }
        });
    }
    /**
     * Show the dialog and return a promise with whether to proceed
     */
    static async show(options) {
        return new Promise((resolve) => {
            const dialog = new DryRunDialog(options, {
                callback: (proceed) => resolve(proceed)
            });
            dialog.render(true);
        });
    }
}

/**
 * Import Dialog - UI for importing assets from library to world
 */
class ImportDialog extends Dialog {
    constructor(options, dialogOptions = {}) {
        super({
            title: 'Import Assets to World',
            content: '',
            buttons: {},
            ...dialogOptions
        });
        this.assets = options.assets;
        this.worldName = options.worldName;
        this.folderManager = options.folderManager;
    }
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            template: 'modules/asset-atlas/templates/import-dialog.hbs',
            width: 600,
            classes: ['asset-atlas', 'import-dialog'],
            resizable: true
        };
    }
    async getData() {
        const data = await super.getData();
        const assetCount = this.assets.length;
        const destinationPath = this.folderManager.getWorldPath(this.worldName);
        return {
            ...data,
            assets: this.assets,
            assetCount,
            worldName: this.worldName,
            destinationPath
        };
    }
    activateListeners(html) {
        super.activateListeners(html);
        html.find('.cancel-button').on('click', () => {
            this.close();
        });
        html.find('.import-button').on('click', () => {
            const result = {
                copy: html.find('#copy-files').is(':checked'),
                overwrite: html.find('#overwrite-existing').is(':checked'),
                preserveStructure: html.find('#preserve-structure').is(':checked')
            };
            this.close();
            if (this.data.callback) {
                this.data.callback(result);
            }
        });
    }
    static async show(options) {
        return new Promise((resolve) => {
            const dialog = new ImportDialog(options, {
                callback: (result) => resolve(result)
            });
            dialog.render(true);
        });
    }
}

/**
 * Custom Import Dialog - Allows users to import assets with a custom interface
 */
class CustomImportDialog extends Application {
    constructor(options) {
        super({});
        this.selectedFiles = [];
        this.targetDirectory = '';
        this.destination = options.destination;
        this.onComplete = options.onComplete;
        // Get the actual world name from Foundry
        this.worldName = (game.world?.id || game.world?.name || options.worldName || 'default');
        console.log('Asset Atlas | Current world name:', this.worldName);
        // Set default target directory - use Asset Atlas folder structure
        if (this.destination === 'world') {
            // For world imports, use asset-atlas/worlds/[worldname]/images path
            this.targetDirectory = `asset-atlas/worlds/${this.worldName}/images`;
        }
        else {
            // For global library, use asset-atlas/library/images path
            this.targetDirectory = 'asset-atlas/library/images';
        }
        console.log('Asset Atlas | Target directory set to:', this.targetDirectory);
    }
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            id: 'custom-import-dialog',
            template: 'modules/asset-atlas/templates/custom-import-dialog.hbs',
            width: 600,
            height: 500,
            title: 'Import Assets to Atlas',
            resizable: true,
            classes: ['asset-atlas', 'custom-import-dialog']
        };
    }
    async getData() {
        const data = await super.getData();
        return {
            ...data,
            destination: this.destination,
            destinationLabel: this.destination === 'world' ? 'World' : 'Global Library',
            targetDirectory: this.targetDirectory,
            selectedFiles: this.selectedFiles.map(f => ({
                name: f.name,
                size: this.formatBytes(f.size),
                type: this.getAssetType(f.name)
            })),
            hasFiles: this.selectedFiles.length > 0,
            fileCount: this.selectedFiles.length
        };
    }
    activateListeners(html) {
        super.activateListeners(html);
        // File input change
        html.find('#file-input').on('change', this._onFileSelect.bind(this));
        // Browse button
        html.find('.browse-files').on('click', this._onBrowseClick.bind(this));
        // Clear files button
        html.find('.clear-files').on('click', this._onClearFiles.bind(this));
        // Directory input
        html.find('.target-directory').on('input', this._onDirectoryChange.bind(this));
        // Import button
        html.find('.import-button').on('click', this._onImport.bind(this));
        // Cancel button
        html.find('.cancel-button').on('click', () => this.close());
        // Drag and drop
        const dropZone = html.find('.drop-zone').get(0);
        if (dropZone) {
            dropZone.addEventListener('dragover', this._onDragOver.bind(this));
            dropZone.addEventListener('dragleave', this._onDragLeave.bind(this));
            dropZone.addEventListener('drop', this._onDrop.bind(this));
        }
    }
    _onBrowseClick(event) {
        event.preventDefault();
        const fileInput = this.element.find('#file-input').get(0);
        fileInput?.click();
    }
    _onFileSelect(event) {
        const input = event.currentTarget;
        if (input.files && input.files.length > 0) {
            this.selectedFiles = Array.from(input.files);
            this.render(false);
        }
    }
    _onClearFiles(event) {
        event.preventDefault();
        this.selectedFiles = [];
        const fileInput = this.element.find('#file-input').get(0);
        if (fileInput) {
            fileInput.value = '';
        }
        this.render(false);
    }
    _onDirectoryChange(event) {
        this.targetDirectory = $(event.currentTarget).val();
    }
    _onDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        const dropZone = this.element.find('.drop-zone');
        dropZone.addClass('drag-over');
    }
    _onDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        const dropZone = this.element.find('.drop-zone');
        dropZone.removeClass('drag-over');
    }
    _onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        const dropZone = this.element.find('.drop-zone');
        dropZone.removeClass('drag-over');
        if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
            this.selectedFiles = Array.from(event.dataTransfer.files);
            this.render(false);
        }
    }
    async _onImport(event) {
        event.preventDefault();
        if (this.selectedFiles.length === 0) {
            ui.notifications?.warn('No files selected');
            return;
        }
        // Show loading state
        const button = $(event.currentTarget);
        button.prop('disabled', true);
        button.html('<i class="fas fa-spinner fa-spin"></i> Importing...');
        try {
            let successCount = 0;
            let failCount = 0;
            for (const file of this.selectedFiles) {
                try {
                    await this.importFile(file);
                    successCount++;
                }
                catch (error) {
                    console.error('Asset Atlas | Failed to import file:', file.name, error);
                    failCount++;
                }
            }
            // Show results
            if (successCount > 0) {
                ui.notifications?.info(`Successfully imported ${successCount} file(s)${failCount > 0 ? `. Failed: ${failCount}` : ''}. Refreshing...`);
            }
            else {
                ui.notifications?.error('Failed to import files');
            }
            // Close dialog first
            await this.close();
            // Call completion callback to trigger refresh
            if (this.onComplete) {
                this.onComplete();
            }
        }
        catch (error) {
            console.error('Asset Atlas | Import error:', error);
            ui.notifications?.error('Import failed. Check console for details.');
            // Reset button
            button.prop('disabled', false);
            button.html('<i class="fas fa-file-import"></i> Import');
        }
    }
    async importFile(file) {
        console.log('Asset Atlas | Importing file:', file.name);
        console.log('Asset Atlas | Target directory:', this.targetDirectory);
        // Upload file using Foundry's FilePicker API and get the actual path
        const uploadedPath = await this.uploadFile(file, this.targetDirectory);
        console.log('Asset Atlas | Final uploaded path:', uploadedPath);
        console.log('Asset Atlas | File uploaded successfully, will be picked up by next scan');
        // Don't add to cache manually - let the scanner handle it
        // This prevents duplicates and ensures proper metadata
    }
    async uploadFile(file, targetDirectory) {
        // In a real Foundry implementation, use FilePicker.upload
        if (typeof FilePicker !== 'undefined' && FilePicker.upload) {
            try {
                // First, try to create the directory if it doesn't exist
                try {
                    await FilePicker.createDirectory('data', targetDirectory, {});
                    console.log('Asset Atlas | Directory created or already exists:', targetDirectory);
                }
                catch (dirError) {
                    // Directory might already exist, that's okay
                    console.log('Asset Atlas | Directory creation skipped:', dirError);
                }
                // Upload using Foundry's FilePicker
                const result = await FilePicker.upload('data', targetDirectory, file, {}, { notify: false });
                console.log('Asset Atlas | File upload result:', result);
                // The result should contain the path property
                if (result && result.path) {
                    // Decode the URL-encoded path
                    const decodedPath = decodeURIComponent(result.path);
                    console.log('Asset Atlas | Using result.path (decoded):', decodedPath);
                    return decodedPath;
                }
                else if (typeof result === 'string') {
                    // Sometimes FilePicker.upload returns the path directly as a string
                    const decodedPath = decodeURIComponent(result);
                    console.log('Asset Atlas | Using result as string (decoded):', decodedPath);
                    return decodedPath;
                }
                else {
                    // Fallback: construct the path manually with proper prefix
                    const cleanDir = targetDirectory.replace(/\/$/, '');
                    const constructedPath = `${cleanDir}/${file.name}`;
                    console.log('Asset Atlas | Constructed path:', constructedPath);
                    return constructedPath;
                }
            }
            catch (error) {
                console.error('Asset Atlas | Upload failed:', error);
                throw error;
            }
        }
        else {
            // Fallback: construct the path manually
            const cleanDir = targetDirectory.replace(/\/$/, '');
            const path = `${cleanDir}/${file.name}`;
            console.log(`Asset Atlas | Would upload ${file.name} to ${path}`);
            return path;
        }
    }
    getAssetType(fileName) {
        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(extension)) {
            return 'audio';
        }
        else if (['mp4', 'webm', 'ogv', 'mov', 'avi'].includes(extension)) {
            return 'video';
        }
        else {
            return 'image';
        }
    }
    formatBytes(bytes) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    static async show(options) {
        const dialog = new CustomImportDialog(options);
        dialog.render(true);
    }
}

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

/**
 * Asset Browser UI - Visual interface for browsing and managing assets
 * Extends Foundry VTT's Application class
 */
class AssetBrowserUI extends Application {
    constructor(cache, tagManager, usageTracker, options = {}) {
        super(options);
        this.currentAssets = [];
        this.selectedAssets = new Set();
        this.currentFilters = {};
        this.currentWorld = 'default';
        this.filePickerMode = false;
        this.currentPage = 1;
        this.assetsPerPage = 100; // Default, will be overridden by settings
        this.totalAssets = 0;
        this.selectedFolderPath = null;
        this.sidebarCollapsed = false;
        this.viewMode = 'grid';
        this.lastSelectedAssetId = null;
        this.cache = cache;
        this.tagManager = tagManager;
        this.usageTracker = usageTracker;
        this.organizer = new AssetOrganizer(cache, usageTracker);
        this.folderManager = new AssetAtlasFolder();
        this.importer = new AssetImporter(cache, this.folderManager);
        this.folderTree = new FolderTree();
    }
    /**
     * Define default options for the Application
     */
    static get defaultOptions() {
        // Get theme from settings
        let theme = 'arcane';
        try {
            if (typeof game !== 'undefined' && game.settings) {
                theme = game.settings.get('asset-atlas', 'theme') || 'arcane';
            }
        }
        catch (error) {
            console.warn('Asset Atlas | Could not load theme setting:', error);
        }
        return {
            ...super.defaultOptions,
            id: 'asset-atlas-browser',
            template: 'modules/asset-atlas/templates/asset-browser.hbs',
            width: 900,
            height: 700,
            title: 'Sublymes Asset Atlas',
            resizable: true,
            classes: ['asset-atlas', 'asset-browser', `theme-${theme}`],
            tabs: [{ navSelector: '.tabs', contentSelector: '.content', initial: 'assets' }]
        };
    }
    /**
     * Prepare data for rendering
     */
    async getData() {
        const data = await super.getData();
        // Load settings
        await this.loadSettings();
        // Load initial assets if not loaded yet
        if (this.currentAssets.length === 0) {
            // Get total count first
            const allAssets = await this.cache.searchAssets(this.currentFilters);
            this.totalAssets = allAssets.length;
            // Build folder tree from all assets
            this.folderTree.buildFromAssets(allAssets);
            // Restore folder tree state from settings
            await this.restoreFolderTreeState();
            // Get paginated assets
            const startIndex = (this.currentPage - 1) * this.assetsPerPage;
            this.currentAssets = allAssets.slice(startIndex, startIndex + this.assetsPerPage);
        }
        // Get all tags for filter dropdown
        const allTags = await this.tagManager.getAllTags();
        const totalPages = Math.ceil(this.totalAssets / this.assetsPerPage);
        // Get flattened folder tree for rendering
        const folderNodes = this.folderTree.getFlattenedNodes();
        // Generate breadcrumbs from selected folder path
        const breadcrumbs = this.generateBreadcrumbs(this.selectedFolderPath);
        // Get thumbnail size setting
        const thumbnailSize = await this.getThumbnailSize();
        return {
            ...data,
            assets: this.currentAssets,
            tags: allTags,
            selectedCount: this.selectedAssets.size,
            filters: this.currentFilters,
            hasAssets: this.totalAssets > 0,
            currentPage: this.currentPage,
            totalPages,
            totalAssets: this.totalAssets,
            showingStart: (this.currentPage - 1) * this.assetsPerPage + 1,
            showingEnd: Math.min(this.currentPage * this.assetsPerPage, this.totalAssets),
            folderNodes,
            selectedFolderPath: this.selectedFolderPath,
            breadcrumbs,
            thumbnailSize
        };
    }
    /**
     * Handle toggle sidebar
     */
    _onToggleSidebar(event) {
        event.preventDefault();
        this.sidebarCollapsed = !this.sidebarCollapsed;
        const sidebar = this.element.find('.folder-tree-sidebar');
        sidebar.toggleClass('collapsed', this.sidebarCollapsed);
    }
    /**
     * Handle toggle view mode (grid/list)
     */
    _onToggleView(event) {
        event.preventDefault();
        this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
        const container = this.element.find('.asset-grid-container');
        const button = this.element.find('.toggle-view i');
        if (this.viewMode === 'list') {
            container.addClass('view-list');
            button.removeClass('fa-th').addClass('fa-list');
        }
        else {
            container.removeClass('view-list');
            button.removeClass('fa-list').addClass('fa-th');
        }
    }
    /**
     * Activate event listeners
     */
    activateListeners(html) {
        super.activateListeners(html);
        // Initialize lazy loading for images
        this.initializeLazyLoading(html);
        // Search input
        html.find('#asset-search').on('input', this._onSearchInput.bind(this));
        // Filter controls
        html.find('.filter-type').on('change', this._onFilterChange.bind(this));
        html.find('.filter-type-compact').on('change', this._onFilterChange.bind(this));
        html.find('.filter-tags').on('change', this._onFilterChange.bind(this));
        html.find('.filter-tags-compact').on('change', this._onFilterChange.bind(this));
        html.find('.filter-size-min').on('input', this._onFilterChange.bind(this));
        html.find('.filter-size-max').on('input', this._onFilterChange.bind(this));
        html.find('.filter-unused').on('change', this._onFilterChange.bind(this));
        // Folder tree interactions
        html.find('.folder-node').on('click', this._onFolderClick.bind(this));
        html.find('.folder-toggle').on('click', this._onFolderToggle.bind(this));
        html.find('.folder-node').on('contextmenu', this._onFolderContextMenu.bind(this));
        html.find('.clear-folder-filter').on('click', this._onClearFolderFilter.bind(this));
        html.find('.breadcrumb-segment').on('click', this._onBreadcrumbClick.bind(this));
        html.find('.toggle-sidebar').on('click', this._onToggleSidebar.bind(this));
        // Asset selection
        html.find('.asset-thumbnail').on('click', this._onAssetClick.bind(this));
        html.find('.asset-thumbnail').on('dblclick', this._onAssetDoubleClick.bind(this));
        html.find('.asset-thumbnail').on('contextmenu', this._onAssetContextMenu.bind(this));
        // Enable drag-and-drop for assets
        this._enableDragDrop(html);
        // Bulk operations
        html.find('.bulk-add-tags').on('click', this._onBulkAddTags.bind(this));
        html.find('.bulk-remove-tags').on('click', this._onBulkRemoveTags.bind(this));
        html.find('.clear-selection').on('click', this._onClearSelection.bind(this));
        // Asset organization
        html.find('.move-asset').on('click', this._onMoveAsset.bind(this));
        html.find('.rename-asset').on('click', this._onRenameAsset.bind(this));
        html.find('.delete-asset').on('click', this._onDeleteAsset.bind(this));
        html.find('.dry-run-delete').on('click', this._onDryRunDelete.bind(this));
        // Import functionality
        html.find('.import-to-world').on('click', this._onImportToWorld.bind(this));
        html.find('.view-library').on('click', this._onViewLibrary.bind(this));
        html.find('.view-world').on('click', this._onViewWorld.bind(this));
        // Refresh button
        html.find('.refresh-assets').on('click', this._onRefresh.bind(this));
        // Import to Atlas button
        html.find('.import-to-atlas').on('click', this._onImportToAtlas.bind(this));
        // View toggle button
        html.find('.toggle-view').on('click', this._onToggleView.bind(this));
        // Pagination
        html.find('.page-first').on('click', () => this.goToPage(1));
        html.find('.page-prev').on('click', () => this.goToPage(this.currentPage - 1));
        html.find('.page-next').on('click', () => this.goToPage(this.currentPage + 1));
        html.find('.page-last').on('click', async () => {
            const data = await this.getData();
            this.goToPage(data.totalPages);
        });
    }
    /**
     * Handle search input with debouncing
     */
    _onSearchInput(event) {
        const query = $(event.currentTarget).val();
        // Debounce search
        if (this._searchTimeout) {
            clearTimeout(this._searchTimeout);
        }
        this._searchTimeout = setTimeout(() => {
            this.currentFilters.query = query;
            this.updateAssetDisplay();
        }, 300);
    }
    /**
     * Handle filter changes
     */
    async _onFilterChange(event) {
        const html = this.element;
        // Collect type filters from both old checkboxes and new compact select
        const typeCheckboxes = html.find('.filter-type:checked').map((i, el) => $(el).val()).get();
        const typeCompact = html.find('.filter-type-compact').val() || [];
        const typeFilters = [...typeCheckboxes, ...typeCompact].filter((v, i, a) => a.indexOf(v) === i);
        // Collect tag filters from both old and new selects
        const tagFiltersOld = html.find('.filter-tags').val() || [];
        const tagFiltersNew = html.find('.filter-tags-compact').val() || [];
        const tagFilters = [...tagFiltersOld, ...tagFiltersNew].filter((v, i, a) => a.indexOf(v) === i);
        const minSize = parseInt(html.find('.filter-size-min').val()) || undefined;
        const maxSize = parseInt(html.find('.filter-size-max').val()) || undefined;
        const unusedOnly = html.find('.filter-unused').is(':checked');
        this.currentFilters = {
            types: typeFilters.length > 0 ? typeFilters : undefined,
            tags: tagFilters,
            minSize,
            maxSize,
            unusedOnly
        };
        await this.updateAssetDisplay();
    }
    /**
     * Handle asset click (selection)
     */
    _onAssetClick(event) {
        event.preventDefault();
        const assetId = $(event.currentTarget).data('asset-id');
        // In FilePicker mode, select the asset and call callback
        if (this.filePickerMode && this.onAssetSelectCallback) {
            const asset = this.currentAssets.find(a => a.id === assetId);
            if (asset) {
                this.onAssetSelectCallback(asset);
                return;
            }
        }
        // Normal mode: File Explorer-style selection
        // Get the original mouse event for modifier keys
        const originalEvent = event.originalEvent;
        const ctrlKey = originalEvent.ctrlKey || originalEvent.metaKey; // Ctrl on Windows/Linux, Cmd on Mac
        const shiftKey = originalEvent.shiftKey;
        if (shiftKey && this.lastSelectedAssetId) {
            // Shift-click: Select range from last selected to current
            this.selectRange(this.lastSelectedAssetId, assetId);
        }
        else if (ctrlKey) {
            // Ctrl-click: Toggle individual selection
            this.toggleAssetSelection(assetId);
        }
        else {
            // Normal click: Select only this asset (deselect others)
            this.selectSingleAsset(assetId);
        }
        this.lastSelectedAssetId = assetId;
        this.updateSelectionUI();
    }
    /**
     * Select a single asset (deselect all others)
     */
    selectSingleAsset(assetId) {
        this.selectedAssets.clear();
        this.selectedAssets.add(assetId);
    }
    /**
     * Toggle selection of a single asset
     */
    toggleAssetSelection(assetId) {
        if (this.selectedAssets.has(assetId)) {
            this.selectedAssets.delete(assetId);
        }
        else {
            this.selectedAssets.add(assetId);
        }
    }
    /**
     * Select a range of assets from startId to endId
     */
    selectRange(startId, endId) {
        const startIndex = this.currentAssets.findIndex(a => a.id === startId);
        const endIndex = this.currentAssets.findIndex(a => a.id === endId);
        if (startIndex === -1 || endIndex === -1)
            return;
        const minIndex = Math.min(startIndex, endIndex);
        const maxIndex = Math.max(startIndex, endIndex);
        // Clear current selection and select the range
        this.selectedAssets.clear();
        for (let i = minIndex; i <= maxIndex; i++) {
            this.selectedAssets.add(this.currentAssets[i].id);
        }
    }
    /**
     * Update the UI to reflect current selection
     */
    updateSelectionUI() {
        const html = this.element;
        // Update all thumbnails
        html.find('.asset-thumbnail').each((_index, element) => {
            const $element = $(element);
            const assetId = $element.data('asset-id');
            $element.toggleClass('selected', this.selectedAssets.has(assetId));
        });
        // Update selection count
        html.find('.selected-count').text(this.selectedAssets.size.toString());
        // Show/hide selection info bar
        if (this.selectedAssets.size > 0) {
            html.find('.selection-info').show();
        }
        else {
            html.find('.selection-info').hide();
        }
    }
    /**
     * Handle asset double-click (show details)
     */
    _onAssetDoubleClick(event) {
        event.preventDefault();
        const assetId = $(event.currentTarget).data('asset-id');
        this.showAssetDetails(assetId);
    }
    /**
     * Handle asset context menu (right-click)
     */
    _onAssetContextMenu(event) {
        event.preventDefault();
        event.stopPropagation();
        const assetId = $(event.currentTarget).data('asset-id');
        const asset = this.currentAssets.find(a => a.id === assetId);
        if (!asset)
            return;
        // Get the original mouse event
        const originalEvent = event.originalEvent;
        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'asset-context-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${originalEvent.clientX}px`;
        menu.style.top = `${originalEvent.clientY}px`;
        menu.style.zIndex = '10000';
        // Copy Path option
        const copyPathOption = document.createElement('div');
        copyPathOption.className = 'context-menu-item';
        copyPathOption.innerHTML = '<i class="fas fa-copy"></i> Copy Path';
        copyPathOption.onclick = () => {
            navigator.clipboard.writeText(asset.path);
            ui.notifications?.info(`Copied path: ${asset.path}`);
            document.body.removeChild(menu);
        };
        // View Details option
        const viewDetailsOption = document.createElement('div');
        viewDetailsOption.className = 'context-menu-item';
        viewDetailsOption.innerHTML = '<i class="fas fa-info-circle"></i> View Details';
        viewDetailsOption.onclick = () => {
            this.showAssetDetails(assetId);
            document.body.removeChild(menu);
        };
        // Add to Scene option (for images)
        // Check if we have multiple selected assets or just this one
        const hasMultipleSelected = this.selectedAssets.size > 1 && this.selectedAssets.has(assetId);
        const assetsToAdd = hasMultipleSelected
            ? this.currentAssets.filter(a => this.selectedAssets.has(a.id) && a.type === 'image')
            : (asset.type === 'image' ? [asset] : []);
        if (assetsToAdd.length > 0) {
            const addToSceneOption = document.createElement('div');
            addToSceneOption.className = 'context-menu-item';
            addToSceneOption.innerHTML = `<i class="fas fa-plus-square"></i> Add to Scene Center${hasMultipleSelected ? ` (${assetsToAdd.length})` : ''}`;
            addToSceneOption.onclick = async () => {
                document.body.removeChild(menu);
                await this._addAssetsToSceneCenter(assetsToAdd);
            };
            menu.appendChild(addToSceneOption);
        }
        // Separator
        const separator1 = document.createElement('div');
        separator1.className = 'context-menu-separator';
        // Rename option
        const renameOption = document.createElement('div');
        renameOption.className = 'context-menu-item';
        renameOption.innerHTML = '<i class="fas fa-edit"></i> Rename';
        renameOption.onclick = async () => {
            document.body.removeChild(menu);
            this.selectedAssets.clear();
            this.selectedAssets.add(assetId);
            await this._onRenameAsset(event);
        };
        // Move option
        const moveOption = document.createElement('div');
        moveOption.className = 'context-menu-item';
        moveOption.innerHTML = '<i class="fas fa-folder-open"></i> Move';
        moveOption.onclick = async () => {
            document.body.removeChild(menu);
            this.selectedAssets.clear();
            this.selectedAssets.add(assetId);
            await this._onMoveAsset(event);
        };
        // Separator
        const separator2 = document.createElement('div');
        separator2.className = 'context-menu-separator';
        // Delete option - support multiple selections
        const deleteOption = document.createElement('div');
        deleteOption.className = 'context-menu-item context-menu-item-danger';
        // Check if we have multiple selected assets or just this one
        const hasMultipleSelectedForDelete = this.selectedAssets.size > 1 && this.selectedAssets.has(assetId);
        const assetsToDelete = hasMultipleSelectedForDelete
            ? this.currentAssets.filter(a => this.selectedAssets.has(a.id))
            : [asset];
        deleteOption.innerHTML = `<i class="fas fa-trash"></i> Delete${hasMultipleSelectedForDelete ? ` (${assetsToDelete.length})` : ''}`;
        deleteOption.onclick = async () => {
            document.body.removeChild(menu);
            if (!hasMultipleSelectedForDelete) {
                // Single asset - clear selection and select only this one
                this.selectedAssets.clear();
                this.selectedAssets.add(assetId);
            }
            // If multiple selected, keep the current selection
            await this._onDeleteAsset(event);
        };
        // Build menu
        menu.appendChild(copyPathOption);
        menu.appendChild(viewDetailsOption);
        menu.appendChild(separator1);
        menu.appendChild(renameOption);
        menu.appendChild(moveOption);
        menu.appendChild(separator2);
        menu.appendChild(deleteOption);
        document.body.appendChild(menu);
        // Remove menu when clicking elsewhere
        const removeMenu = (e) => {
            if (!menu.contains(e.target)) {
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
                document.removeEventListener('click', removeMenu);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', removeMenu);
        }, 10);
    }
    /**
     * Add assets to scene center with diagonal staggering
     */
    async _addAssetsToSceneCenter(assets) {
        const gameCanvas = canvas;
        if (!gameCanvas || !gameCanvas.scene) {
            ui.notifications?.warn('No active scene');
            return;
        }
        // Get exact center of the scene
        const sceneWidth = gameCanvas.scene.dimensions.width;
        const sceneHeight = gameCanvas.scene.dimensions.height;
        const centerX = sceneWidth / 2;
        const centerY = sceneHeight / 2;
        const gridSize = gameCanvas.scene.grid.size || 100;
        const diagonalOffset = gridSize * 0.5; // Offset for diagonal staggering
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            try {
                // Load image to get dimensions
                const img = new Image();
                img.src = asset.path;
                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });
                const tileWidth = img.width || gridSize * 2;
                const tileHeight = img.height || gridSize * 2;
                // Calculate diagonal stagger position
                // Each asset is offset diagonally from the center
                const offsetX = i * diagonalOffset;
                const offsetY = i * diagonalOffset;
                const tileData = {
                    texture: { src: asset.path },
                    width: tileWidth,
                    height: tileHeight,
                    x: centerX - (tileWidth / 2) + offsetX,
                    y: centerY - (tileHeight / 2) + offsetY,
                    z: 100 + i, // Stack them slightly
                    rotation: 0,
                    alpha: 1,
                    hidden: false,
                    locked: false,
                    overhead: false,
                    roof: false,
                    occlusion: {
                        mode: 0,
                        alpha: 0
                    }
                };
                await gameCanvas.scene.createEmbeddedDocuments('Tile', [tileData]);
                successCount++;
            }
            catch (error) {
                console.error('Asset Atlas | Failed to add asset to scene:', error);
                failCount++;
            }
        }
        if (successCount > 0) {
            ui.notifications?.info(`Added ${successCount} asset(s) to scene center${failCount > 0 ? ` (${failCount} failed)` : ''}`);
        }
        else {
            ui.notifications?.error('Failed to add assets to scene');
        }
    }
    /**
     * Handle bulk add tags
     */
    async _onBulkAddTags(event) {
        event.preventDefault();
        if (this.selectedAssets.size === 0) {
            ui.notifications?.warn('No assets selected');
            return;
        }
        // Show tag selection dialog
        const tagName = await this._promptForTag('Add tags to selected assets');
        if (!tagName)
            return;
        const assetPaths = Array.from(this.selectedAssets);
        await this.tagManager.addTagsToAssets(assetPaths, [tagName]);
        ui.notifications?.info(`Added tag "${tagName}" to ${assetPaths.length} assets`);
        await this.render(false);
    }
    /**
     * Handle bulk remove tags
     */
    async _onBulkRemoveTags(event) {
        event.preventDefault();
        if (this.selectedAssets.size === 0) {
            ui.notifications?.warn('No assets selected');
            return;
        }
        const tagName = await this._promptForTag('Remove tags from selected assets');
        if (!tagName)
            return;
        const assetPaths = Array.from(this.selectedAssets);
        await this.tagManager.removeTagsFromAssets(assetPaths, [tagName]);
        ui.notifications?.info(`Removed tag "${tagName}" from ${assetPaths.length} assets`);
        await this.render(false);
    }
    /**
     * Handle clear selection
     */
    _onClearSelection(event) {
        event.preventDefault();
        this.selectedAssets.clear();
        this.lastSelectedAssetId = null;
        this.updateSelectionUI();
    }
    /**
     * Handle import to atlas
     */
    async _onImportToAtlas(event) {
        event.preventDefault();
        // Create a custom dialog with clickable options
        new Dialog({
            title: "Import Assets to Atlas",
            content: `
        <div style="text-align: center; padding: 1rem;">
          <p style="margin-bottom: 1.5rem;">Where would you like to import assets from?</p>
          <div style="display: flex; gap: 1rem;">
            <button class="import-world-btn" style="flex: 1; padding: 1.5rem; background: var(--aa-accent-arcane); border: 1px solid var(--aa-border-gold); color: white; cursor: pointer; border-radius: 6px; font-size: 1rem; transition: all 0.2s;">
              <i class="fas fa-globe" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;"></i>
              <strong>Import to World</strong>
            </button>
            <button class="import-global-btn" style="flex: 1; padding: 1.5rem; background: var(--aa-accent-metal); border: 1px solid var(--aa-border-gold); color: var(--aa-bg-primary); cursor: pointer; border-radius: 6px; font-size: 1rem; transition: all 0.2s;">
              <i class="fas fa-atlas" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;"></i>
              <strong>Import to Global Library</strong>
            </button>
          </div>
        </div>
      `,
            buttons: {},
            render: (html) => {
                // Add click handlers to the buttons
                html.find('.import-world-btn').on('click', async () => {
                    // Close the dialog
                    html.closest('.dialog').find('.close').click();
                    // Open custom import dialog for world
                    await CustomImportDialog.show({
                        destination: 'world',
                        worldName: this.currentWorld,
                        cache: this.cache,
                        folderManager: this.folderManager,
                        onComplete: async () => {
                            // Trigger a scan after import
                            if (this.scanner) {
                                ui.notifications?.info('Scanning for new assets...');
                                try {
                                    const watchedDirsStr = game.settings.get('asset-atlas', 'watchedDirectories');
                                    const watchedDirs = watchedDirsStr ? watchedDirsStr.split(',').map((d) => d.trim()).filter((d) => d) : [];
                                    await this.scanner.scan(watchedDirs, true);
                                }
                                catch (error) {
                                    console.error('Asset Atlas | Scan error:', error);
                                }
                            }
                            // Refresh the display
                            await this.updateAssetDisplay();
                        }
                    });
                });
                html.find('.import-global-btn').on('click', async () => {
                    // Close the dialog
                    html.closest('.dialog').find('.close').click();
                    // Open custom import dialog for global library
                    await CustomImportDialog.show({
                        destination: 'global',
                        worldName: this.currentWorld,
                        cache: this.cache,
                        folderManager: this.folderManager,
                        onComplete: async () => {
                            // Trigger a scan after import
                            if (this.scanner) {
                                ui.notifications?.info('Scanning for new assets...');
                                try {
                                    const watchedDirsStr = game.settings.get('asset-atlas', 'watchedDirectories');
                                    const watchedDirs = watchedDirsStr ? watchedDirsStr.split(',').map((d) => d.trim()).filter((d) => d) : [];
                                    await this.scanner.scan(watchedDirs, true);
                                }
                                catch (error) {
                                    console.error('Asset Atlas | Scan error:', error);
                                }
                            }
                            // Refresh the display
                            await this.updateAssetDisplay();
                        }
                    });
                });
                // Add hover effects
                html.find('.import-world-btn, .import-global-btn').on('mouseenter', function () {
                    $(this).css('transform', 'scale(1.05)');
                }).on('mouseleave', function () {
                    $(this).css('transform', 'scale(1)');
                });
            }
        }).render(true);
    }
    /**
     * Handle refresh
     */
    async _onRefresh(event) {
        event.preventDefault();
        // If scanner is available, trigger a real scan
        if (this.scanner) {
            this.showLoading('Scanning for assets...');
            try {
                const watchedDirsStr = game.settings.get('asset-atlas', 'watchedDirectories');
                const watchedDirs = watchedDirsStr ? watchedDirsStr.split(',').map((d) => d.trim()).filter((d) => d) : [];
                console.log('Asset Atlas | Scanning directories:', watchedDirs);
                const result = await this.scanner.scan(watchedDirs, true);
                ui.notifications?.info(`Scan complete: ${result.assetsFound} found, ${result.assetsAdded} new, ${result.assetsUpdated} updated`);
            }
            catch (error) {
                console.error('Asset Atlas | Scan error:', error);
                ui.notifications?.error('Failed to scan assets. Check console for details.');
            }
            finally {
                this.hideLoading();
            }
        }
        // Update display from cache
        this.showLoading('Loading assets...');
        try {
            await this.updateAssetDisplay();
        }
        finally {
            this.hideLoading();
        }
    }
    /**
     * Update the displayed assets based on current filters
     */
    async updateAssetDisplay() {
        // Apply folder filter if selected
        let searchCriteria = { ...this.currentFilters };
        // Get all assets matching current filters
        const allAssets = await this.cache.searchAssets(searchCriteria);
        // Apply folder filter if a folder is selected
        let filteredAssets = allAssets;
        if (this.selectedFolderPath) {
            filteredAssets = this.filterAssetsByFolder(allAssets, this.selectedFolderPath);
        }
        this.totalAssets = filteredAssets.length;
        // Rebuild folder tree from filtered assets
        this.folderTree.buildFromAssets(filteredAssets);
        // Restore folder tree state
        await this.restoreFolderTreeState();
        // Reset to page 1 when filters change
        this.currentPage = 1;
        // Get paginated assets
        const startIndex = (this.currentPage - 1) * this.assetsPerPage;
        this.currentAssets = filteredAssets.slice(startIndex, startIndex + this.assetsPerPage);
        await this.render(false);
    }
    /**
     * Filter assets by folder path
     */
    filterAssetsByFolder(assets, folderPath, recursive = true) {
        if (!folderPath)
            return assets;
        return assets.filter(asset => {
            if (recursive) {
                // Include assets in this folder and all subfolders
                return asset.path.startsWith(folderPath + '/');
            }
            else {
                // Include only assets directly in this folder
                const assetFolder = asset.path.substring(0, asset.path.lastIndexOf('/'));
                return assetFolder === folderPath;
            }
        });
    }
    /**
     * Go to a specific page
     */
    async goToPage(page) {
        const allAssets = await this.cache.searchAssets(this.currentFilters);
        // Apply folder filter if selected
        let filteredAssets = allAssets;
        if (this.selectedFolderPath) {
            filteredAssets = this.filterAssetsByFolder(allAssets, this.selectedFolderPath);
        }
        this.totalAssets = filteredAssets.length;
        const totalPages = Math.ceil(this.totalAssets / this.assetsPerPage);
        this.currentPage = Math.max(1, Math.min(page, totalPages));
        // Get paginated assets
        const startIndex = (this.currentPage - 1) * this.assetsPerPage;
        this.currentAssets = filteredAssets.slice(startIndex, startIndex + this.assetsPerPage);
        await this.render(false);
    }
    /**
     * Show asset details panel
     */
    showAssetDetails(assetId) {
        const asset = this.currentAssets.find(a => a.id === assetId);
        if (!asset)
            return;
        // In a real implementation, this would open a details dialog
        // For now, log to console
        console.log('Asset Details:', asset);
    }
    /**
     * Apply search and filter criteria
     */
    applyFilters(criteria) {
        this.currentFilters = criteria;
        this.updateAssetDisplay();
    }
    /**
     * Prompt user for tag name
     */
    async _promptForTag(title) {
        // In a real implementation, this would show a dialog
        // For now, use browser prompt
        return prompt(title);
    }
    /**
     * Handle move asset
     */
    async _onMoveAsset(event) {
        event.preventDefault();
        if (this.selectedAssets.size !== 1) {
            ui.notifications?.warn('Please select exactly one asset to move');
            return;
        }
        const assetId = Array.from(this.selectedAssets)[0];
        const asset = this.currentAssets.find(a => a.id === assetId);
        if (!asset)
            return;
        // Show move dialog
        const newPath = await MoveRenameDialog.show({
            asset,
            operation: 'move',
            usageTracker: this.usageTracker
        });
        if (!newPath)
            return;
        // Perform move operation
        const success = await this.organizer.moveAsset(asset, newPath);
        if (success) {
            ui.notifications?.info(`Asset moved to ${newPath}`);
            await this.updateAssetDisplay();
        }
    }
    /**
     * Handle rename asset
     */
    async _onRenameAsset(event) {
        event.preventDefault();
        if (this.selectedAssets.size !== 1) {
            ui.notifications?.warn('Please select exactly one asset to rename');
            return;
        }
        const assetId = Array.from(this.selectedAssets)[0];
        const asset = this.currentAssets.find(a => a.id === assetId);
        if (!asset)
            return;
        // Show rename dialog
        const newPath = await MoveRenameDialog.show({
            asset,
            operation: 'rename',
            usageTracker: this.usageTracker
        });
        if (!newPath)
            return;
        // Extract just the filename for rename
        const newName = newPath.split('/').pop() || newPath;
        // Perform rename operation
        const success = await this.organizer.renameAsset(asset, newName);
        if (success) {
            ui.notifications?.info(`Asset renamed to ${newName}`);
            await this.updateAssetDisplay();
        }
    }
    /**
     * Handle delete asset
     */
    async _onDeleteAsset(event) {
        event.preventDefault();
        if (this.selectedAssets.size === 0) {
            ui.notifications?.warn('No assets selected');
            return;
        }
        const assets = this.currentAssets.filter(a => this.selectedAssets.has(a.id));
        // Show delete confirmation dialog
        const confirmed = await DeleteConfirmationDialog.show({ assets });
        if (!confirmed)
            return;
        // Perform delete operation
        const result = await this.organizer.deleteAssets(assets);
        // Show summary
        if (result.success > 0) {
            const sizeStr = this.formatBytes(result.totalSize);
            ui.notifications?.info(`Deleted ${result.success} asset(s) (${sizeStr})${result.failed > 0 ? `. Failed to delete ${result.failed} asset(s).` : ''}`);
        }
        else {
            ui.notifications?.error(`Failed to delete assets`);
        }
        // Clear selection and refresh
        this.selectedAssets.clear();
        await this.updateAssetDisplay();
    }
    /**
     * Handle dry run delete
     */
    async _onDryRunDelete(event) {
        event.preventDefault();
        if (this.selectedAssets.size === 0) {
            ui.notifications?.warn('No assets selected');
            return;
        }
        const assets = this.currentAssets.filter(a => this.selectedAssets.has(a.id));
        // Perform dry run
        const dryRunResult = await this.organizer.dryRunDelete(assets);
        // Show dry run dialog
        const proceed = await DryRunDialog.show(dryRunResult);
        if (proceed) {
            // User wants to proceed with actual deletion
            const confirmed = await DeleteConfirmationDialog.show({ assets });
            if (!confirmed)
                return;
            // Perform delete operation
            const result = await this.organizer.deleteAssets(assets);
            // Show summary
            if (result.success > 0) {
                const sizeStr = this.formatBytes(result.totalSize);
                ui.notifications?.info(`Deleted ${result.success} asset(s) (${sizeStr})${result.failed > 0 ? `. Failed to delete ${result.failed} asset(s).` : ''}`);
            }
            else {
                ui.notifications?.error(`Failed to delete assets`);
            }
            // Clear selection and refresh
            this.selectedAssets.clear();
            await this.updateAssetDisplay();
        }
    }
    /**
     * Format bytes to human-readable string
     */
    formatBytes(bytes) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    /**
     * Handle import to world
     */
    async _onImportToWorld(event) {
        event.preventDefault();
        if (this.selectedAssets.size === 0) {
            ui.notifications?.warn('No assets selected');
            return;
        }
        const assets = this.currentAssets.filter(a => this.selectedAssets.has(a.id));
        // Check if assets are from library
        const libraryAssets = assets.filter(a => this.folderManager.isLibraryPath(a.path));
        if (libraryAssets.length === 0) {
            ui.notifications?.warn('Selected assets are not from the library');
            return;
        }
        // Show import dialog
        const result = await ImportDialog.show({
            assets: libraryAssets,
            worldName: this.currentWorld,
            folderManager: this.folderManager
        });
        if (!result)
            return;
        // Perform import
        const importResult = await this.importer.importToWorld(libraryAssets, this.currentWorld, {
            copy: result.copy,
            overwrite: result.overwrite,
            preserveStructure: result.preserveStructure
        });
        // Show results
        if (importResult.success > 0) {
            ui.notifications?.info(`Imported ${importResult.success} asset(s) to ${this.currentWorld}${importResult.failed > 0 ? `. Failed: ${importResult.failed}` : ''}${importResult.skipped > 0 ? `. Skipped: ${importResult.skipped}` : ''}`);
        }
        else {
            ui.notifications?.error('Failed to import assets');
        }
        await this.updateAssetDisplay();
    }
    /**
     * Handle view library
     */
    async _onViewLibrary(event) {
        event.preventDefault();
        const libraryAssets = await this.importer.getLibraryAssets();
        this.currentAssets = libraryAssets;
        await this.render(false);
        ui.notifications?.info(`Viewing library: ${libraryAssets.length} assets`);
    }
    /**
     * Handle view world
     */
    async _onViewWorld(event) {
        event.preventDefault();
        const worldAssets = await this.importer.getWorldAssets(this.currentWorld);
        this.currentAssets = worldAssets;
        await this.render(false);
        ui.notifications?.info(`Viewing ${this.currentWorld}: ${worldAssets.length} assets`);
    }
    /**
     * Set the current world
     */
    setCurrentWorld(worldName) {
        this.currentWorld = worldName;
    }
    /**
     * Set the scanner instance for refresh functionality
     */
    setScanner(scanner) {
        this.scanner = scanner;
    }
    /**
     * Enable FilePicker mode
     */
    enableFilePickerMode(callback) {
        this.filePickerMode = true;
        this.onAssetSelectCallback = callback;
    }
    /**
     * Disable FilePicker mode
     */
    disableFilePickerMode() {
        this.filePickerMode = false;
        this.onAssetSelectCallback = undefined;
    }
    /**
     * Check if in FilePicker mode
     */
    isFilePickerMode() {
        return this.filePickerMode;
    }
    /**
     * Show loading overlay
     */
    showLoading(message = 'Loading...') {
        const overlay = this.element.find('.loading-overlay');
        const messageEl = overlay.find('.loading-message');
        messageEl.text(message);
        overlay.show();
    }
    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = this.element.find('.loading-overlay');
        overlay.hide();
    }
    /**
     * Handle folder click (selection)
     */
    async _onFolderClick(event) {
        event.preventDefault();
        event.stopPropagation();
        const folderPath = $(event.currentTarget).data('folder-path');
        this.selectedFolderPath = folderPath;
        this.folderTree.setSelectedFolder(folderPath);
        // Save state
        await this.saveFolderTreeState();
        // Apply folder filter
        await this.updateAssetDisplay();
    }
    /**
     * Handle folder toggle (expand/collapse)
     */
    async _onFolderToggle(event) {
        event.preventDefault();
        event.stopPropagation();
        const folderPath = $(event.currentTarget).data('folder-path');
        this.folderTree.toggleFolder(folderPath);
        // Save state
        await this.saveFolderTreeState();
        // Re-render to show/hide children
        await this.render(false);
    }
    /**
     * Handle folder context menu
     */
    _onFolderContextMenu(event) {
        event.preventDefault();
        event.stopPropagation();
        $(event.currentTarget).data('folder-path');
        // Get the original mouse event
        const originalEvent = event.originalEvent;
        // Create a simple context menu using native browser context
        // In a real Foundry implementation, this would use Foundry's ContextMenu class
        const menu = document.createElement('div');
        menu.className = 'folder-context-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${originalEvent.clientX}px`;
        menu.style.top = `${originalEvent.clientY}px`;
        menu.style.zIndex = '10000';
        const expandAllOption = document.createElement('div');
        expandAllOption.className = 'context-menu-item';
        expandAllOption.innerHTML = '<i class="fas fa-folder-open"></i> Expand All';
        expandAllOption.onclick = async () => {
            this.folderTree.expandAll();
            await this.saveFolderTreeState();
            await this.render(false);
            document.body.removeChild(menu);
        };
        const collapseAllOption = document.createElement('div');
        collapseAllOption.className = 'context-menu-item';
        collapseAllOption.innerHTML = '<i class="fas fa-folder"></i> Collapse All';
        collapseAllOption.onclick = async () => {
            this.folderTree.collapseAll();
            await this.saveFolderTreeState();
            await this.render(false);
            document.body.removeChild(menu);
        };
        menu.appendChild(expandAllOption);
        menu.appendChild(collapseAllOption);
        document.body.appendChild(menu);
        // Remove menu when clicking elsewhere
        const removeMenu = (e) => {
            if (!menu.contains(e.target)) {
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
                document.removeEventListener('click', removeMenu);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', removeMenu);
        }, 10);
    }
    /**
     * Handle clear folder filter
     */
    async _onClearFolderFilter(event) {
        event.preventDefault();
        this.selectedFolderPath = null;
        this.folderTree.setSelectedFolder(null);
        // Save state
        await this.saveFolderTreeState();
        // Update display
        await this.updateAssetDisplay();
    }
    /**
     * Save folder tree state to settings
     */
    async saveFolderTreeState() {
        const state = this.folderTree.getState();
        try {
            if (typeof game !== 'undefined' && game.settings) {
                await game.settings.set('asset-atlas', 'folderTreeState', JSON.stringify(state));
            }
        }
        catch (error) {
            console.warn('Asset Atlas | Failed to save folder tree state:', error);
        }
    }
    /**
     * Restore folder tree state from settings
     */
    async restoreFolderTreeState() {
        try {
            if (typeof game !== 'undefined' && game.settings) {
                const stateJson = await game.settings.get('asset-atlas', 'folderTreeState');
                if (stateJson) {
                    const state = JSON.parse(stateJson);
                    this.folderTree.restoreState(state);
                    this.selectedFolderPath = state.selectedFolder;
                }
            }
        }
        catch (error) {
            console.warn('Asset Atlas | Failed to restore folder tree state:', error);
        }
    }
    /**
     * Generate breadcrumbs from folder path
     */
    generateBreadcrumbs(folderPath) {
        if (!folderPath) {
            return [{ name: 'All Assets', path: null }];
        }
        const parts = folderPath.split('/').filter(p => p.length > 0);
        const breadcrumbs = [
            { name: 'All Assets', path: null }
        ];
        let currentPath = '';
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            breadcrumbs.push({ name: part, path: currentPath });
        }
        return breadcrumbs;
    }
    /**
     * Handle breadcrumb click
     */
    async _onBreadcrumbClick(event) {
        event.preventDefault();
        const folderPath = $(event.currentTarget).data('folder-path');
        this.selectedFolderPath = folderPath || null;
        this.folderTree.setSelectedFolder(this.selectedFolderPath);
        // Save state
        await this.saveFolderTreeState();
        // Update display
        await this.updateAssetDisplay();
    }
    /**
     * Load settings from Foundry
     */
    async loadSettings() {
        try {
            if (typeof game !== 'undefined' && game.settings) {
                this.assetsPerPage = await game.settings.get('asset-atlas', 'assetsPerPage') || 100;
            }
        }
        catch (error) {
            console.warn('Asset Atlas | Failed to load settings:', error);
            this.assetsPerPage = 100; // Fallback
        }
    }
    /**
     * Get thumbnail size setting
     */
    async getThumbnailSize() {
        try {
            if (typeof game !== 'undefined' && game.settings) {
                return await game.settings.get('asset-atlas', 'thumbnailSize') || 'medium';
            }
        }
        catch (error) {
            console.warn('Asset Atlas | Failed to get thumbnail size:', error);
        }
        return 'medium';
    }
    /**
     * Initialize lazy loading for images using Intersection Observer
     */
    initializeLazyLoading(html) {
        // Check if Intersection Observer is supported
        if (!('IntersectionObserver' in window)) {
            console.warn('Asset Atlas | Intersection Observer not supported, falling back to native lazy loading');
            return;
        }
        const gridElements = html.find('.asset-grid');
        if (gridElements.length === 0)
            return;
        const gridElement = gridElements[0];
        // Create observer for lazy loading images
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    // Only load if not already loaded
                    if (!img.dataset.loaded) {
                        const src = img.getAttribute('src');
                        if (src) {
                            // Create a new image to preload
                            const tempImg = new Image();
                            tempImg.onload = () => {
                                img.src = src;
                                img.dataset.loaded = 'true';
                                img.style.opacity = '1';
                            };
                            tempImg.onerror = () => {
                                console.warn(`Asset Atlas | Failed to load image: ${src}`);
                                img.style.opacity = '0.5';
                            };
                            tempImg.src = src;
                        }
                        // Stop observing this image
                        observer.unobserve(img);
                    }
                }
            });
        }, {
            root: gridElement,
            rootMargin: '50px', // Start loading 50px before image enters viewport
            threshold: 0.01
        });
        // Observe all images in the asset grid
        const lazyImages = html.find('.asset-thumbnail img[loading="lazy"]');
        lazyImages.each((_index, img) => {
            imageObserver.observe(img);
        });
        // Store observer for cleanup
        this._imageObserver = imageObserver;
    }
    /**
     * Enable drag-and-drop functionality for assets
     */
    _enableDragDrop(html) {
        const assetThumbnails = html.find('.asset-thumbnail');
        assetThumbnails.each((_index, element) => {
            const $element = $(element);
            const assetId = $element.data('asset-id');
            $element.data('asset-path');
            // Make element draggable
            element.setAttribute('draggable', 'true');
            // Add drag start handler
            element.addEventListener('dragstart', (event) => {
                const dragEvent = event;
                if (!dragEvent.dataTransfer)
                    return;
                const asset = this.currentAssets.find(a => a.id === assetId);
                if (!asset)
                    return;
                // Check if this asset is part of a selection
                let assetsToTransfer = [];
                if (this.selectedAssets.has(assetId) && this.selectedAssets.size > 1) {
                    // Dragging a selected asset with multiple selections - transfer all selected assets
                    assetsToTransfer = this.currentAssets.filter(a => this.selectedAssets.has(a.id));
                    console.log(`Asset Atlas | Dragging ${assetsToTransfer.length} selected assets`);
                    // Add selection count to element for CSS display
                    element.setAttribute('data-selection-count', assetsToTransfer.length.toString());
                }
                else {
                    // Dragging a single asset (or unselected asset)
                    assetsToTransfer = [asset];
                }
                // Set drag data for Foundry VTT
                const dragData = this._createDragData(assetsToTransfer);
                // Store the drag data globally so the drop handler can access it
                window._assetAtlasDragData = dragData;
                dragEvent.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                // Set visual feedback
                $element.addClass('dragging');
                dragEvent.dataTransfer.effectAllowed = 'copy';
                // Create a smaller drag image for better performance
                const img = $element.find('img')[0];
                if (img) {
                    // Use the thumbnail image for drag preview (it's already small)
                    dragEvent.dataTransfer.setDragImage(img, 75, 75);
                }
                console.log('Asset Atlas | Drag started:', assetsToTransfer.length === 1 ? asset.name : `${assetsToTransfer.length} assets`);
                console.log('Asset Atlas | Drag data:', dragData);
            });
            // Add drag end handler
            element.addEventListener('dragend', () => {
                $element.removeClass('dragging');
                element.removeAttribute('data-selection-count');
            });
        });
    }
    /**
     * Create drag data for Foundry VTT based on asset type
     */
    _createDragData(assets) {
        // Handle array of assets
        if (Array.isArray(assets)) {
            if (assets.length === 1) {
                // Single asset in array - use single asset logic
                return this._createSingleAssetDragData(assets[0]);
            }
            else {
                // Multiple assets - create a special multi-asset drag data
                return {
                    type: 'MultiAsset',
                    assets: assets.map(asset => this._createSingleAssetDragData(asset))
                };
            }
        }
        // Single asset
        return this._createSingleAssetDragData(assets);
    }
    /**
     * Create drag data for a single asset
     */
    _createSingleAssetDragData(asset) {
        // Determine what type of Foundry entity to create based on asset type
        if (asset.type === 'image') {
            // For images, create a Tile using Foundry's expected format
            return {
                type: 'Tile',
                texture: {
                    src: asset.path
                }
            };
        }
        else if (asset.type === 'audio') {
            // For audio, create an AmbientSound
            return {
                type: 'AmbientSound',
                path: asset.path,
                radius: 10,
                volume: 0.5
            };
        }
        else if (asset.type === 'video') {
            // For video, create a Tile with video texture
            return {
                type: 'Tile',
                texture: {
                    src: asset.path
                },
                video: {
                    loop: true,
                    autoplay: true,
                    volume: 0.5
                }
            };
        }
        // Default fallback - just the path
        return {
            type: 'Tile',
            texture: {
                src: asset.path
            }
        };
    }
    /**
     * Clean up observers when closing
     */
    async close(options) {
        // Disconnect image observer if it exists
        if (this._imageObserver) {
            this._imageObserver.disconnect();
            delete this._imageObserver;
        }
        return super.close(options);
    }
}

/**
 * Settings Dialog - UI for configuring Asset Atlas settings
 */
/// <reference path="./foundry-types.d.ts" />
class SettingsDialog extends Application {
    constructor(settings) {
        super();
        this.settings = settings;
    }
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            id: 'asset-atlas-settings',
            title: 'Asset Atlas Settings',
            template: 'modules/asset-atlas/templates/settings-dialog.hbs',
            width: 600,
            height: 'auto',
            classes: ['asset-atlas', 'settings-dialog'],
            resizable: true,
            closeOnSubmit: false,
            submitOnClose: false,
            submitOnChange: false
        };
    }
    async getData() {
        return {
            settings: this.settings,
            watchedDirList: this.settings.watchedDirectories.join('\n'),
            excludedDirList: this.settings.excludedDirectories.join('\n'),
            thumbnailSizes: [
                { value: 'small', label: 'Small', selected: this.settings.thumbnailSize === 'small' },
                { value: 'medium', label: 'Medium', selected: this.settings.thumbnailSize === 'medium' },
                { value: 'large', label: 'Large', selected: this.settings.thumbnailSize === 'large' }
            ],
            assetsPerPage: this.settings.assetsPerPage,
            showSidebarButton: this.settings.showSidebarButton,
            enableFilePickerIntegration: this.settings.enableFilePickerIntegration
        };
    }
    activateListeners(html) {
        super.activateListeners(html);
        // Save button
        html.find('button[name="save"]').on('click', async (event) => {
            event.preventDefault();
            await this.saveSettings(html);
        });
        // Cancel button
        html.find('button[name="cancel"]').on('click', (event) => {
            event.preventDefault();
            this.close();
        });
        // Reset button
        html.find('button[name="reset"]').on('click', async (event) => {
            event.preventDefault();
            await this.resetSettings(html);
        });
    }
    async saveSettings(html) {
        try {
            // Parse watched directories
            const watchedDirText = html.find('textarea[name="watchedDirectories"]').val();
            const watchedDirectories = watchedDirText
                .split('\n')
                .map(dir => dir.trim())
                .filter(dir => dir.length > 0);
            // Parse excluded directories
            const excludedDirText = html.find('textarea[name="excludedDirectories"]').val();
            const excludedDirectories = excludedDirText
                .split('\n')
                .map(dir => dir.trim())
                .filter(dir => dir.length > 0);
            // Get thumbnail size
            const thumbnailSize = html.find('select[name="thumbnailSize"]').val();
            // Get auto-scan interval
            const autoScanInterval = parseInt(html.find('input[name="autoScanInterval"]').val()) || 0;
            // Get assets per page
            const assetsPerPage = parseInt(html.find('input[name="assetsPerPage"]').val()) || 100;
            // Get sidebar button setting
            const showSidebarButton = html.find('input[name="showSidebarButton"]').is(':checked');
            // Get FilePicker integration setting
            const enableFilePickerIntegration = html.find('input[name="enableFilePickerIntegration"]').is(':checked');
            // Validate
            if (watchedDirectories.length === 0) {
                ui.notifications?.warn('At least one watched directory is required');
                return;
            }
            if (autoScanInterval < 0) {
                ui.notifications?.warn('Auto-scan interval must be 0 or greater');
                return;
            }
            if (assetsPerPage < 20 || assetsPerPage > 500) {
                ui.notifications?.warn('Assets per page must be between 20 and 500');
                return;
            }
            // Save to Foundry settings
            await game.settings.set('asset-atlas', 'watchedDirectories', watchedDirectories);
            await game.settings.set('asset-atlas', 'excludedDirectories', excludedDirectories);
            await game.settings.set('asset-atlas', 'thumbnailSize', thumbnailSize);
            await game.settings.set('asset-atlas', 'autoScanInterval', autoScanInterval);
            await game.settings.set('asset-atlas', 'assetsPerPage', assetsPerPage);
            await game.settings.set('asset-atlas', 'showSidebarButton', showSidebarButton);
            await game.settings.set('asset-atlas', 'enableFilePickerIntegration', enableFilePickerIntegration);
            // Apply excluded directories to scanner if available
            const assetAtlas = window.AssetAtlas;
            if (assetAtlas && assetAtlas.scanner) {
                const scanner = assetAtlas.scanner();
                if (scanner && scanner.setExcludedDirectories) {
                    scanner.setExcludedDirectories(excludedDirectories);
                }
            }
            ui.notifications?.info('Settings saved successfully. Some changes may require a refresh.');
            this.close();
        }
        catch (error) {
            console.error('Asset Atlas | Error saving settings:', error);
            ui.notifications?.error('Failed to save settings');
        }
    }
    async resetSettings(html) {
        // Simple confirmation using browser confirm for now
        // In a real Foundry implementation, this would use Dialog.confirm
        const confirmed = confirm('Are you sure you want to reset all settings to defaults?');
        if (confirmed) {
            // Reset to defaults
            html.find('textarea[name="watchedDirectories"]').val('worlds\nmodules\nsystems');
            html.find('textarea[name="excludedDirectories"]').val('');
            html.find('select[name="thumbnailSize"]').val('medium');
            html.find('input[name="autoScanInterval"]').val('0');
            html.find('input[name="assetsPerPage"]').val('100');
            html.find('input[name="showSidebarButton"]').prop('checked', true);
            html.find('input[name="enableFilePickerIntegration"]').prop('checked', true);
            ui.notifications?.info('Settings reset to defaults');
        }
    }
}

/**
 * FilePicker Integration - Embeds Asset Atlas into Foundry's FilePicker
 */
class FilePickerIntegration {
    constructor(cache, tagManager, usageTracker) {
        this.browserInstances = new Map();
        this.filePickerCallbacks = new Map();
        this.originalDirectories = new Map();
        this.cache = cache;
        this.tagManager = tagManager;
        this.usageTracker = usageTracker;
    }
    /**
     * Register FilePicker hooks
     */
    registerHooks() {
        Hooks.on('renderFilePicker', this._onRenderFilePicker.bind(this));
    }
    /**
     * Handle FilePicker render
     */
    async _onRenderFilePicker(app, html, data) {
        const filePickerId = app.appId.toString();
        // Store the original directory context
        if (app.activeSource && app.target) {
            this.originalDirectories.set(filePickerId, app.target);
        }
        // Add Asset Atlas toggle button to FilePicker header
        this._addToggleButton(app, html, filePickerId);
    }
    /**
     * Add Asset Atlas toggle button to FilePicker
     */
    _addToggleButton(app, html, filePickerId) {
        const header = html.find('.window-header');
        if (header.length === 0)
            return;
        // Check if button already exists
        if (html.find('.asset-atlas-toggle').length > 0)
            return;
        const toggleButton = $(`
      <a class="asset-atlas-toggle" title="Toggle Asset Atlas View">
        <i class="fas fa-atlas"></i>
      </a>
    `);
        toggleButton.on('click', (event) => {
            event.preventDefault();
            this._toggleAssetAtlasView(app, html, filePickerId);
        });
        // Add button to header controls
        const headerButtons = header.find('.header-button');
        if (headerButtons.length > 0) {
            headerButtons.first().before(toggleButton);
        }
        else {
            header.append(toggleButton);
        }
    }
    /**
     * Toggle between native FilePicker and Asset Atlas view
     */
    async _toggleAssetAtlasView(app, html, filePickerId) {
        const atlasContainer = html.find('.asset-atlas-container');
        const nativeContent = html.find('.filepicker-body');
        if (atlasContainer.length > 0) {
            // Switch back to native view
            atlasContainer.hide();
            nativeContent.show();
            // Restore directory context
            const originalDir = this.originalDirectories.get(filePickerId);
            if (originalDir && app.browse) {
                await app.browse(originalDir);
            }
        }
        else {
            // Switch to Asset Atlas view
            nativeContent.hide();
            await this._embedAssetAtlas(app, html, filePickerId);
        }
    }
    /**
     * Embed Asset Atlas into FilePicker
     */
    async _embedAssetAtlas(app, html, filePickerId) {
        // Create container for Asset Atlas
        const container = $(`
      <div class="asset-atlas-container" style="height: 100%; overflow: auto;">
        <div class="asset-atlas-filepicker-content"></div>
      </div>
    `);
        html.find('.window-content').append(container);
        // Create or reuse Asset Browser instance
        let browser = this.browserInstances.get(filePickerId);
        if (!browser) {
            browser = new AssetBrowserUI(this.cache, this.tagManager, this.usageTracker, {
                popOut: false,
                minimizable: false,
                resizable: false
            });
            // Enable FilePicker mode with callback
            browser.enableFilePickerMode((asset) => {
                this._onAssetSelected(app, asset.path, filePickerId);
            });
            this.browserInstances.set(filePickerId, browser);
        }
        // Render Asset Browser in container
        const content = container.find('.asset-atlas-filepicker-content');
        await this._renderBrowserInContainer(browser, content, filePickerId);
    }
    /**
     * Render Asset Browser in FilePicker container
     */
    async _renderBrowserInContainer(browser, container, filePickerId) {
        // Get browser HTML
        const data = await browser.getData();
        // For testing, we'll use a simple HTML structure
        // In production, this would use Foundry's renderTemplate
        const template = `
      <div class="asset-browser-content">
        <input type="text" id="asset-search" placeholder="Search assets..." />
        <div class="asset-grid">
          ${data.assets.map((asset) => `
            <div class="asset-thumbnail" data-asset-id="${asset.id}">
              <span>${asset.name}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
        container.html(template);
        // Activate listeners with custom selection handler
        this._activateFilePickerListeners(container, browser, filePickerId);
    }
    /**
     * Activate listeners for Asset Browser in FilePicker mode
     */
    _activateFilePickerListeners(html, browser, filePickerId) {
        // The asset click is handled by the browser's FilePicker mode
        // Just need to set up search and filter listeners
        html.find('#asset-search').on('input', (event) => {
            const query = $(event.currentTarget).val();
            browser.applyFilters({ query });
        });
        html.find('.filter-type, .filter-tags, .filter-unused').on('change', () => {
            this._updateFilters(html, browser);
        });
    }
    /**
     * Update filters from FilePicker UI
     */
    _updateFilters(html, browser) {
        const typeFilters = html.find('.filter-type:checked')
            .map((i, el) => $(el).val())
            .get();
        const tagFilters = html.find('.filter-tags').val();
        const unusedOnly = html.find('.filter-unused').is(':checked');
        browser.applyFilters({
            types: typeFilters.length > 0 ? typeFilters : undefined,
            tags: tagFilters,
            unusedOnly
        });
    }
    /**
     * Handle asset selection in FilePicker mode
     */
    _onAssetSelected(app, path, filePickerId) {
        // Set the selected path in FilePicker
        if (app.field) {
            app.field.value = path;
            $(app.field).trigger('change');
        }
        // Call FilePicker's callback if it exists
        if (app.callback) {
            app.callback(path);
        }
        // Close Asset Atlas view and return to native view
        const html = $(app.element);
        const atlasContainer = html.find('.asset-atlas-container');
        const nativeContent = html.find('.filepicker-body');
        // Hide Atlas container
        atlasContainer.hide();
        nativeContent.show();
        // Disable FilePicker mode on the browser
        const browser = this.browserInstances.get(filePickerId);
        if (browser) {
            browser.disableFilePickerMode();
        }
        // Clean up
        this.browserInstances.delete(filePickerId);
        this.filePickerCallbacks.delete(filePickerId);
    }
    /**
     * Clean up when FilePicker is closed
     */
    cleanup(filePickerId) {
        this.browserInstances.delete(filePickerId);
        this.filePickerCallbacks.delete(filePickerId);
        this.originalDirectories.delete(filePickerId);
    }
}

/**
 * Asset Atlas - Main module entry point
 * A visual, searchable, taggable browser for all Foundry assets
 */
// Module state
let assetCache;
let tagManager;
let assetScanner;
let usageTracker;
let browserUI;
let filePickerIntegration;
/**
 * Initialize the module
 */
Hooks.once('init', async () => {
    console.log('Asset Atlas | Initializing module...');
    // Register Handlebars helpers
    Handlebars.registerHelper('formatBytes', function (bytes) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    });
    Handlebars.registerHelper('eq', function (a, b) {
        return a === b;
    });
    Handlebars.registerHelper('gt', function (a, b) {
        return a > b;
    });
    Handlebars.registerHelper('multiply', function (a, b) {
        return a * b;
    });
    Handlebars.registerHelper('decodeURI', function (str) {
        if (!str)
            return '';
        try {
            return decodeURIComponent(str);
        }
        catch (e) {
            return str;
        }
    });
    // Register module settings
    game.settings.register('asset-atlas', 'watchedDirectories', {
        name: 'Watched Directories',
        hint: 'Directories to scan for assets (comma-separated)',
        scope: 'world',
        config: true,
        type: String,
        default: 'asset-atlas/library,asset-atlas/worlds,worlds,modules,systems',
        onChange: (value) => {
            console.log('Asset Atlas | Watched directories changed:', value);
        }
    });
    game.settings.register('asset-atlas', 'excludedDirectories', {
        name: 'Excluded Directories',
        hint: 'Directories to exclude from scanning (comma-separated)',
        scope: 'world',
        config: true,
        type: String,
        default: '',
        onChange: (value) => {
            console.log('Asset Atlas | Excluded directories changed:', value);
        }
    });
    game.settings.register('asset-atlas', 'thumbnailSize', {
        name: 'Thumbnail Size',
        hint: 'Size of asset thumbnails',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            small: 'Small',
            medium: 'Medium',
            large: 'Large'
        },
        default: 'medium'
    });
    game.settings.register('asset-atlas', 'theme', {
        name: 'Theme',
        hint: 'Visual theme for the Asset Atlas interface (requires reload)',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            arcane: 'Arcane (D&D Style)',
            infernal: 'Infernal Red',
            druidic: 'Druidic Green',
            astral: 'Astral Blue',
            dark: 'Dark',
            light: 'Light',
            foundry: 'Foundry Default'
        },
        default: 'arcane',
        onChange: (value) => {
            console.log('Asset Atlas | Theme changed:', value);
            // Reload the world to apply the new theme
            window.location.reload();
        }
    });
    game.settings.register('asset-atlas', 'autoScanInterval', {
        name: 'Auto-Scan Interval',
        hint: 'Minutes between automatic scans (0 = disabled)',
        scope: 'world',
        config: true,
        type: Number,
        default: 0
    });
    game.settings.register('asset-atlas', 'folderTreeState', {
        name: 'Folder Tree State',
        hint: 'Persisted state of folder tree (expanded folders, selected folder)',
        scope: 'client',
        config: false,
        type: String,
        default: '{}'
    });
    game.settings.register('asset-atlas', 'assetsPerPage', {
        name: 'Assets Per Page',
        hint: 'Number of assets to display per page',
        scope: 'client',
        config: true,
        type: Number,
        default: 100,
        range: {
            min: 20,
            max: 500,
            step: 20
        }
    });
    game.settings.register('asset-atlas', 'showSidebarButton', {
        name: 'Show Sidebar Button',
        hint: 'Display Asset Atlas button in Token controls',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });
    game.settings.register('asset-atlas', 'enableFilePickerIntegration', {
        name: 'Enable FilePicker Integration',
        hint: 'Integrate Asset Atlas into Foundry\'s file picker dialogs',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });
    // Register keybinding
    game.keybindings.register('asset-atlas', 'toggleBrowser', {
        name: 'Toggle Asset Browser',
        hint: 'Open or close the Asset Atlas browser',
        editable: [
            {
                key: 'Backquote'
            }
        ],
        onDown: () => {
            console.log('Asset Atlas | Keybind triggered');
            try {
                if (!browserUI && assetCache && tagManager && usageTracker) {
                    console.log('Asset Atlas | Creating new AssetBrowserUI');
                    browserUI = new AssetBrowserUI(assetCache, tagManager, usageTracker);
                    if (assetScanner) {
                        browserUI.setScanner(assetScanner);
                    }
                }
                if (browserUI) {
                    // Toggle: if already rendered, close it; otherwise open it
                    if (browserUI.rendered) {
                        console.log('Asset Atlas | Closing browser');
                        browserUI.close();
                    }
                    else {
                        console.log('Asset Atlas | Opening browser');
                        browserUI.render(true);
                    }
                }
                else {
                    console.error('Asset Atlas | Browser UI not initialized');
                    ui.notifications?.error('Asset Atlas not ready. Please wait for initialization.');
                }
            }
            catch (error) {
                console.error('Asset Atlas | Error:', error);
                ui.notifications?.error('Failed to toggle Asset Atlas. Check console.');
            }
            return true; // Prevent default browser behavior
        },
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
    });
    console.log('Asset Atlas | Settings and keybindings registered');
});
/**
 * Setup the module after Foundry is ready
 */
Hooks.once('ready', async () => {
    console.log('Asset Atlas | Setting up module...');
    try {
        // Initialize components with error handling
        try {
            assetCache = new AssetCache();
            await assetCache.initialize();
            console.log('Asset Atlas | Asset cache initialized');
        }
        catch (error) {
            console.error('Asset Atlas | Failed to initialize asset cache:', error);
            ui.notifications?.error('Asset Atlas: Failed to initialize asset cache. Some features may not work.');
            // Continue with degraded functionality
        }
        try {
            tagManager = new TagManager();
            await tagManager.initialize();
            console.log('Asset Atlas | Tag manager initialized');
        }
        catch (error) {
            console.error('Asset Atlas | Failed to initialize tag manager:', error);
            ui.notifications?.error('Asset Atlas: Failed to initialize tag manager. Tagging features will not work.');
            // Continue with degraded functionality
        }
        // Only initialize scanner and tracker if cache is available
        if (assetCache) {
            assetScanner = new AssetScanner(assetCache);
            usageTracker = new UsageTracker(assetCache);
        }
        else {
            console.error('Asset Atlas | Cannot initialize scanner/tracker without cache');
            ui.notifications?.error('Asset Atlas: Core features unavailable due to initialization failure.');
            return;
        }
        // Initialize FilePicker integration with error handling
        try {
            const enableFilePicker = game.settings.get('asset-atlas', 'enableFilePickerIntegration');
            if (enableFilePicker && tagManager && usageTracker) {
                filePickerIntegration = new FilePickerIntegration(assetCache, tagManager, usageTracker);
                filePickerIntegration.registerHooks();
                console.log('Asset Atlas | FilePicker integration initialized');
            }
            else if (!enableFilePicker) {
                console.log('Asset Atlas | FilePicker integration disabled by user setting');
            }
        }
        catch (error) {
            console.error('Asset Atlas | Failed to initialize FilePicker integration:', error);
            ui.notifications?.warn('Asset Atlas: FilePicker integration unavailable.');
            // Continue without FilePicker integration
        }
        // Initialize Asset Atlas folder structure
        const folderManager = new AssetAtlasFolder();
        const currentWorldName = game.world?.id || game.world?.name || 'default';
        console.log('Asset Atlas | Initializing folder structure...');
        const folderResult = await folderManager.initializeFolders(currentWorldName);
        if (folderResult.created.length > 0) {
            console.log(`Asset Atlas | Created ${folderResult.created.length} new directories`);
            ui.notifications?.info(`Asset Atlas: Created ${folderResult.created.length} new directories`);
        }
        if (folderResult.existing.length > 0) {
            console.log(`Asset Atlas | Found ${folderResult.existing.length} existing directories`);
        }
        if (folderResult.errors.length > 0) {
            console.warn(`Asset Atlas | ${folderResult.errors.length} errors during folder creation:`, folderResult.errors);
            ui.notifications?.warn(`Asset Atlas: ${folderResult.errors.length} errors creating directories. Check console for details.`);
        }
        // Apply excluded directories setting to scanner
        const excludedDirs = game.settings.get('asset-atlas', 'excludedDirectories');
        const excludedDirsArray = excludedDirs ? excludedDirs.split(',').map(d => d.trim()).filter(d => d) : [];
        assetScanner.setExcludedDirectories(excludedDirsArray);
        console.log('Asset Atlas | Components initialized');
        // Check if we need to perform initial scan
        const cachedAssets = await assetCache.searchAssets({ limit: 1 });
        const needsInitialScan = cachedAssets.length === 0;
        if (needsInitialScan) {
            // Perform initial scan only if cache is empty
            const watchedDirsStr = game.settings.get('asset-atlas', 'watchedDirectories');
            const watchedDirs = watchedDirsStr ? watchedDirsStr.split(',').map(d => d.trim()).filter(d => d) : [];
            if (watchedDirs.length > 0) {
                console.log('Asset Atlas | Cache is empty, starting initial scan of:', watchedDirs);
                ui.notifications?.info('Asset Atlas: Scanning for assets (this may take a moment)...');
                const result = await assetScanner.scan(watchedDirs, true);
                console.log('Asset Atlas | Initial scan complete:', result);
                if (result.assetsAdded > 0) {
                    ui.notifications?.info(`Asset Atlas: Found ${result.assetsAdded} new assets`);
                }
            }
        }
        else {
            console.log('Asset Atlas | Using cached assets, skipping initial scan');
            ui.notifications?.info('Asset Atlas: Loaded from cache');
        }
        // Set up auto-scan interval
        const autoScanInterval = game.settings.get('asset-atlas', 'autoScanInterval');
        if (autoScanInterval > 0) {
            setInterval(async () => {
                console.log('Asset Atlas | Running automatic scan...');
                const watchedDirsStr = game.settings.get('asset-atlas', 'watchedDirectories');
                const watchedDirs = watchedDirsStr ? watchedDirsStr.split(',').map(d => d.trim()).filter(d => d) : [];
                const result = await assetScanner.scan(watchedDirs, true);
                console.log('Asset Atlas | Automatic scan complete:', result);
            }, autoScanInterval * 60 * 1000);
        }
        // Add settings button to module settings
        Hooks.on('renderSettings', (app, html) => {
            const moduleSettings = html.find('#settings-game');
            if (moduleSettings.length > 0) {
                const settingsButton = $(`
          <button class="asset-atlas-settings-button">
            <i class="fas fa-atlas"></i> Asset Atlas Settings
          </button>
        `);
                settingsButton.on('click', (event) => {
                    event.preventDefault();
                    const currentSettings = {
                        watchedDirectories: game.settings.get('asset-atlas', 'watchedDirectories'),
                        excludedDirectories: game.settings.get('asset-atlas', 'excludedDirectories'),
                        thumbnailSize: game.settings.get('asset-atlas', 'thumbnailSize'),
                        autoScanInterval: game.settings.get('asset-atlas', 'autoScanInterval'),
                        assetsPerPage: game.settings.get('asset-atlas', 'assetsPerPage'),
                        showSidebarButton: game.settings.get('asset-atlas', 'showSidebarButton'),
                        enableFilePickerIntegration: game.settings.get('asset-atlas', 'enableFilePickerIntegration')
                    };
                    const dialog = new SettingsDialog(currentSettings);
                    dialog.render(true);
                });
                moduleSettings.append(settingsButton);
            }
        });
        console.log('Asset Atlas | Module ready');
        // Send welcome message to chat
        const welcomeMessage = `
      <div style="
        background: linear-gradient(135deg, #2A1F3D 0%, #3A2A55 100%);
        border: 2px solid #C0A97A;
        border-radius: 8px;
        padding: 1rem;
        margin: 0.5rem 0;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        font-family: 'Crimson Pro', Georgia, serif;
        color: #E6E1D5;
      ">
        <h3 style="
          margin: 0 0 0.75rem 0;
          font-family: 'Cinzel Decorative', serif;
          color: #C0A97A;
          text-shadow: 0 0 8px rgba(192, 169, 122, 0.3);
          font-size: 1.3rem;
          text-align: center;
        ">
          <i class="fas fa-atlas" style="margin-right: 0.5rem;"></i>
          Sublymes Asset Atlas
        </h3>
        <p style="margin: 0.5rem 0; line-height: 1.6;">
          <strong style="color: #A67CFF;">Welcome!</strong> Asset Atlas is now ready to help you manage your Foundry VTT assets.
        </p>
        <div style="
          background: rgba(15, 14, 14, 0.5);
          border-left: 3px solid #A67CFF;
          padding: 0.75rem;
          margin: 0.75rem 0;
          border-radius: 4px;
        ">
          <p style="margin: 0.25rem 0; font-size: 0.95rem;"><strong style="color: #C0A97A;">Quick Start:</strong></p>
          <ul style="margin: 0.5rem 0; padding-left: 1.5rem; font-size: 0.9rem;">
            <li>Press <code style="background: rgba(166, 124, 255, 0.2); padding: 0.2rem 0.4rem; border-radius: 3px; font-family: monospace;">~</code> (tilde/backtick) to open the browser</li>
            <li>Or click the <i class="fas fa-atlas"></i> button in the Tiles controls</li>
            <li>Browse folders in the sidebar, search by name, or filter by type/tags</li>
            <li>Drag assets directly onto your canvas to place them</li>
            <li>Right-click assets for more options (rename, move, delete, etc.)</li>
            <li>Use the <i class="fas fa-file-import"></i> Import button to add new assets</li>
          </ul>
        </div>
        <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; text-align: center; color: #AFA89A;">
          <em>Tip: Select multiple assets with Ctrl+Click or Shift+Click, then drag them all at once!</em>
        </p>
      </div>
    `;
        ChatMessage.create({
            content: welcomeMessage,
            whisper: [game.user.id]
        });
        ui.notifications?.info('Asset Atlas is ready!');
    }
    catch (error) {
        console.error('Asset Atlas | Initialization error:', error);
        ui.notifications?.error('Asset Atlas failed to initialize. Check console for details.');
    }
});
/**
 * Add Asset Atlas button to scene controls
 * This hook is called whenever the scene controls are rendered
 */
Hooks.on('getSceneControlButtons', (controls) => {
    // Check if sidebar button is enabled
    const showButton = game.settings.get('asset-atlas', 'showSidebarButton');
    if (!showButton) {
        return;
    }
    console.log('Asset Atlas | getSceneControlButtons hook fired');
    // Add Asset Atlas as a standalone button-type tool in the tiles controls
    // Button tools are always visible, not hidden in submenus
    const tilesControls = controls.find((c) => c.name === 'tiles');
    if (tilesControls) {
        // Insert at the beginning of tools array so it's first
        tilesControls.tools.unshift({
            name: 'asset-atlas',
            title: 'Asset Atlas',
            icon: 'fas fa-atlas',
            button: true, // This makes it always visible, not a toggle tool
            onClick: () => {
                console.log('Asset Atlas | Button clicked!');
                try {
                    if (!browserUI && assetCache && tagManager && usageTracker) {
                        console.log('Asset Atlas | Creating new AssetBrowserUI');
                        browserUI = new AssetBrowserUI(assetCache, tagManager, usageTracker);
                        if (assetScanner) {
                            browserUI.setScanner(assetScanner);
                        }
                    }
                    if (browserUI) {
                        console.log('Asset Atlas | Rendering browser');
                        browserUI.render(true);
                    }
                    else {
                        console.error('Asset Atlas | Browser UI not initialized');
                        ui.notifications?.error('Asset Atlas not ready. Please wait for initialization.');
                    }
                }
                catch (error) {
                    console.error('Asset Atlas | Error:', error);
                    ui.notifications?.error('Failed to open Asset Atlas. Check console.');
                }
            }
        });
        console.log('Asset Atlas | Button added to tiles controls as always-visible button');
    }
    else {
        console.warn('Asset Atlas | Tiles controls not found');
    }
});
/**
 * Track document updates for usage tracking
 */
Hooks.on('updateScene', async (scene, changes, options, userId) => {
    if (usageTracker && assetCache) {
        // Scan updated scene for asset references
        const usageMap = await usageTracker.scanAllDocuments();
        // Update cache with new usage information
        for (const [path, usage] of usageMap.entries()) {
            await assetCache.updateUsage(path, usage);
        }
    }
});
Hooks.on('updateJournalEntry', async (journal, changes, options, userId) => {
    if (usageTracker && assetCache) {
        const usageMap = await usageTracker.scanAllDocuments();
        for (const [path, usage] of usageMap.entries()) {
            await assetCache.updateUsage(path, usage);
        }
    }
});
Hooks.on('updateActor', async (actor, changes, options, userId) => {
    if (usageTracker && assetCache) {
        const usageMap = await usageTracker.scanAllDocuments();
        for (const [path, usage] of usageMap.entries()) {
            await assetCache.updateUsage(path, usage);
        }
    }
});
/**
 * Handle canvas drop events for Asset Atlas assets
 */
Hooks.on('dropCanvasData', async (canvas, data) => {
    console.log('Asset Atlas | Canvas drop detected:', data);
    console.log('Asset Atlas | Drop data type:', data.type);
    // Check if this is a multi-asset drop
    if (data.type === 'MultiAsset' && Array.isArray(data.assets)) {
        console.log(`Asset Atlas | Dropping ${data.assets.length} assets`);
        // Get the drop position - use canvas center as fallback
        let dropPosition = { x: 0, y: 0 };
        try {
            // Try to get the current mouse position from canvas
            if (canvas.mousePosition) {
                dropPosition = canvas.mousePosition;
            }
            else if (canvas.app?.renderer?.plugins?.interaction?.mouse?.global) {
                const globalPos = canvas.app.renderer.plugins.interaction.mouse.global;
                dropPosition = canvas.canvasCoordinatesFromClient({ x: globalPos.x, y: globalPos.y });
            }
            else {
                // Fallback to center of viewport
                const viewBounds = canvas.scene.dimensions;
                dropPosition = {
                    x: viewBounds.width / 2,
                    y: viewBounds.height / 2
                };
            }
        }
        catch (error) {
            console.warn('Asset Atlas | Could not determine drop position, using scene center:', error);
            const viewBounds = canvas.scene.dimensions;
            dropPosition = {
                x: viewBounds.width / 2,
                y: viewBounds.height / 2
            };
        }
        console.log('Asset Atlas | Drop position:', dropPosition);
        const gridSize = canvas.scene.grid.size || 100;
        const diagonalOffset = gridSize * 0.5; // Offset for diagonal staggering
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < data.assets.length; i++) {
            const assetData = data.assets[i];
            try {
                if (assetData.type === 'Tile' && assetData.texture?.src) {
                    // Load image to get dimensions
                    const img = new Image();
                    img.src = assetData.texture.src;
                    await new Promise((resolve) => {
                        img.onload = resolve;
                        img.onerror = resolve;
                    });
                    const tileWidth = img.width || gridSize * 2;
                    const tileHeight = img.height || gridSize * 2;
                    // Calculate diagonal stagger position from drop point
                    const offsetX = i * diagonalOffset;
                    const offsetY = i * diagonalOffset;
                    // Create tile document data
                    const tileData = {
                        texture: {
                            src: assetData.texture.src
                        },
                        width: tileWidth,
                        height: tileHeight,
                        x: dropPosition.x - (tileWidth / 2) + offsetX,
                        y: dropPosition.y - (tileHeight / 2) + offsetY,
                        z: 100 + i,
                        rotation: 0,
                        alpha: 1,
                        hidden: false,
                        locked: false,
                        overhead: false,
                        roof: false,
                        occlusion: {
                            mode: 0,
                            alpha: 0
                        }
                    };
                    // Add video properties if it's a video
                    if (assetData.video) {
                        tileData.texture.video = assetData.video;
                    }
                    console.log('Asset Atlas | Creating tile at:', { x: tileData.x, y: tileData.y });
                    await canvas.scene.createEmbeddedDocuments('Tile', [tileData]);
                    successCount++;
                }
                else if (assetData.type === 'AmbientSound' && assetData.path) {
                    // Handle audio drop with diagonal stagger
                    const offsetX = i * diagonalOffset;
                    const offsetY = i * diagonalOffset;
                    const soundData = {
                        x: dropPosition.x + offsetX,
                        y: dropPosition.y + offsetY,
                        path: assetData.path,
                        radius: assetData.radius || 10,
                        volume: assetData.volume || 0.5,
                        easing: true,
                        walls: true,
                        hidden: false
                    };
                    await canvas.scene.createEmbeddedDocuments('AmbientSound', [soundData]);
                    successCount++;
                }
            }
            catch (error) {
                console.error('Asset Atlas | Failed to create asset:', error);
                failCount++;
            }
        }
        if (successCount > 0) {
            ui.notifications?.info(`Created ${successCount} asset(s)${failCount > 0 ? ` (${failCount} failed)` : ''}`);
        }
        else {
            ui.notifications?.error('Failed to create assets');
        }
        return false; // Prevent default handling
    }
    // Check if this is a single Asset Atlas drop
    if (data.type === 'Tile' && data.texture?.src) {
        // Handle image/video tile drop
        const dropPosition = canvas.canvasCoordinatesFromClient({ x: data.x || 0, y: data.y || 0 });
        // Get image dimensions to size the tile appropriately
        const img = new Image();
        img.src = data.texture.src;
        await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
        });
        const gridSize = canvas.scene.grid.size || 100;
        const tileWidth = img.width || gridSize * 2;
        const tileHeight = img.height || gridSize * 2;
        // Create tile document data
        const tileData = {
            texture: {
                src: data.texture.src
            },
            width: tileWidth,
            height: tileHeight,
            x: dropPosition.x - (tileWidth / 2),
            y: dropPosition.y - (tileHeight / 2),
            z: 100,
            rotation: 0,
            alpha: 1,
            hidden: false,
            locked: false,
            overhead: false,
            roof: false,
            occlusion: {
                mode: 0,
                alpha: 0
            }
        };
        // Add video properties if it's a video
        if (data.video) {
            tileData.texture.video = data.video;
        }
        console.log('Asset Atlas | Creating tile:', tileData);
        try {
            const tile = await canvas.scene.createEmbeddedDocuments('Tile', [tileData]);
            ui.notifications?.info(`Created tile: ${data.name || 'Asset'}`);
            console.log('Asset Atlas | Tile created:', tile);
            return false; // Prevent default handling
        }
        catch (error) {
            console.error('Asset Atlas | Failed to create tile:', error);
            ui.notifications?.error('Failed to create tile from asset');
        }
    }
    else if (data.type === 'AmbientSound' && data.path) {
        // Handle audio drop
        const dropPosition = canvas.canvasCoordinatesFromClient({ x: data.x || 0, y: data.y || 0 });
        const soundData = {
            x: dropPosition.x,
            y: dropPosition.y,
            path: data.path,
            radius: data.radius || 10,
            volume: data.volume || 0.5,
            easing: true,
            walls: true,
            hidden: false
        };
        console.log('Asset Atlas | Creating ambient sound:', soundData);
        try {
            const sound = await canvas.scene.createEmbeddedDocuments('AmbientSound', [soundData]);
            ui.notifications?.info(`Created ambient sound: ${data.name || 'Audio'}`);
            console.log('Asset Atlas | Ambient sound created:', sound);
            return false; // Prevent default handling
        }
        catch (error) {
            console.error('Asset Atlas | Failed to create ambient sound:', error);
            ui.notifications?.error('Failed to create ambient sound from asset');
        }
    }
    // Let Foundry handle other drop types
    return true;
});
// Export for debugging
window.AssetAtlas = {
    cache: () => assetCache,
    tagManager: () => tagManager,
    scanner: () => assetScanner,
    tracker: () => usageTracker,
    ui: () => browserUI
};
console.log('Asset Atlas | Module loaded');
//# sourceMappingURL=asset-atlas.js.map
