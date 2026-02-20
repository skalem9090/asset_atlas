/**
 * Tag Manager - Handles tag creation, assignment, and persistence
 */

import { Tag } from './types';

export class TagManager {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'AssetAtlasTagDB';
  private readonly dbVersion = 1;

  /**
   * Initialize the tag database
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onerror = () => {
          const error = request.error;
          console.error('Asset Atlas | Tag database initialization failed:', error);
          
          if (error?.name === 'QuotaExceededError') {
            reject(new Error('Database quota exceeded. Please free up browser storage space.'));
          } else if (error?.name === 'VersionError') {
            reject(new Error('Database version conflict. Try clearing browser data for this site.'));
          } else {
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
            const db = (event.target as IDBOpenDBRequest).result;

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
          } catch (error) {
            console.error('Asset Atlas | Tag database schema creation failed:', error);
            reject(new Error(`Failed to create tag database schema: ${(error as Error).message}`));
          }
        };

        request.onblocked = () => {
          console.warn('Asset Atlas | Tag database upgrade blocked by another connection');
          reject(new Error('Database upgrade blocked. Please close other tabs with this site open.'));
        };
      } catch (error) {
        console.error('Asset Atlas | Failed to initiate tag database connection:', error);
        reject(new Error(`Tag database initialization error: ${(error as Error).message}`));
      }
    });
  }

  /**
   * Creates a new tag
   */
  async createTag(name: string): Promise<Tag> {
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
      const transaction = this.db!.transaction(['tags'], 'readwrite');
      const store = transaction.objectStore('tags');

      // Check if tag already exists
      const getRequest = store.get(trimmedName);

      getRequest.onsuccess = () => {
        if (getRequest.result) {
          reject(new Error(`Tag "${trimmedName}" already exists`));
          return;
        }

        const tag: Tag = {
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
  async getAllTags(): Promise<Tag[]> {
    if (!this.db) {
      console.warn('Asset Atlas | Tag database not initialized, returning empty array');
      return [];
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(['tags'], 'readonly');
        const store = transaction.objectStore('tags');
        const request = store.getAll();

        transaction.onerror = () => {
          console.error('Asset Atlas | Transaction error getting tags:', transaction.error);
          resolve([]); // Return empty array to allow UI to continue
        };

        request.onsuccess = () => {
          resolve(request.result as Tag[]);
        };

        request.onerror = () => {
          console.error('Asset Atlas | Failed to get tags:', request.error);
          resolve([]); // Return empty array to allow UI to continue
        };
      } catch (error) {
        console.error('Asset Atlas | Unexpected error in getAllTags:', error);
        resolve([]);
      }
    });
  }

  /**
   * Gets tags for an asset
   */
  async getAssetTags(assetPath: string): Promise<string[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['asset_tags'], 'readonly');
      const store = transaction.objectStore('asset_tags');
      const index = store.index('assetPath');
      const request = index.getAll(assetPath);

      request.onsuccess = () => {
        const assetTags = request.result as Array<{ assetPath: string; tagName: string }>;
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
  async addTagsToAssets(assetPaths: string[], tagNames: string[]): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Process all additions first, then update usage counts
    const addedTags = new Map<string, number>(); // tagName -> count of new associations

    for (const assetPath of assetPaths) {
      for (const tagName of tagNames) {
        const transaction = this.db.transaction(['asset_tags'], 'readwrite');
        const assetTagsStore = transaction.objectStore('asset_tags');
        const index = assetTagsStore.index('assetPath_tagName');

        await new Promise<void>((resolve, reject) => {
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

      await new Promise<void>((resolve, reject) => {
        const getRequest = tagsStore.get(tagName);

        getRequest.onsuccess = () => {
          const tag = getRequest.result as Tag | undefined;
          if (tag) {
            tag.usageCount += count;
            const putRequest = tagsStore.put(tag);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(new Error(`Failed to update usage count: ${putRequest.error}`));
          } else {
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
  async removeTagsFromAssets(assetPaths: string[], tagNames: string[]): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Track removed tags for usage count updates
    const removedTags = new Map<string, number>(); // tagName -> count of removed associations

    for (const assetPath of assetPaths) {
      for (const tagName of tagNames) {
        const transaction = this.db.transaction(['asset_tags'], 'readwrite');
        const assetTagsStore = transaction.objectStore('asset_tags');
        const index = assetTagsStore.index('assetPath_tagName');

        await new Promise<void>((resolve, reject) => {
          const getRequest = index.get([assetPath, tagName]);

          getRequest.onsuccess = () => {
            const assetTag = getRequest.result as { id: string; assetPath: string; tagName: string } | undefined;

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

      await new Promise<void>((resolve, reject) => {
        const getRequest = tagsStore.get(tagName);

        getRequest.onsuccess = () => {
          const tag = getRequest.result as Tag | undefined;
          if (tag && tag.usageCount > 0) {
            tag.usageCount = Math.max(0, tag.usageCount - count);
            const putRequest = tagsStore.put(tag);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(new Error(`Failed to update usage count: ${putRequest.error}`));
          } else {
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
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
