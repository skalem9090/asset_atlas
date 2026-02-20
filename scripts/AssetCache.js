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

export { AssetCache };
//# sourceMappingURL=AssetCache.js.map
