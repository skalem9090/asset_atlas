/**
 * Usage Tracker - Tracks asset usage across Foundry documents
 */

import { UsageInfo, UpdateResult } from './types';
import { AssetCache } from './AssetCache';

export class UsageTracker {
  private cache: AssetCache;

  constructor(cache: AssetCache) {
    this.cache = cache;
  }

  /**
   * Scans all documents to build usage information
   * In a real Foundry implementation, this would iterate through:
   * - game.scenes
   * - game.journal
   * - game.actors
   */
  async scanAllDocuments(): Promise<Map<string, UsageInfo>> {
    const usageMap = new Map<string, UsageInfo>();

    try {
      // Check if Foundry game object is available
      if (typeof game === 'undefined') {
        console.warn('Asset Atlas | Foundry game object not available');
        return usageMap;
      }

      // Scan scenes
      try {
        if ((game as any).scenes) {
          for (const scene of (game as any).scenes) {
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
            } catch (error) {
              console.warn(`Asset Atlas | Error scanning scene ${scene.id}:`, error);
            }
          }
        }
      } catch (error) {
        console.error('Asset Atlas | Error scanning scenes:', error);
      }

      // Scan journals
      try {
        if ((game as any).journal) {
          for (const journal of (game as any).journal) {
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
            } catch (error) {
              console.warn(`Asset Atlas | Error scanning journal ${journal.id}:`, error);
            }
          }
        }
      } catch (error) {
        console.error('Asset Atlas | Error scanning journals:', error);
      }

      // Scan actors
      try {
        if ((game as any).actors) {
          for (const actor of (game as any).actors) {
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
            } catch (error) {
              console.warn(`Asset Atlas | Error scanning actor ${actor.id}:`, error);
            }
          }
        }
      } catch (error) {
        console.error('Asset Atlas | Error scanning actors:', error);
      }
    } catch (error) {
      console.error('Asset Atlas | Error in scanAllDocuments:', error);
    }

    return usageMap;
  }

  /**
   * Finds all references to an asset
   */
  async findAssetReferences(assetPath: string): Promise<UsageInfo> {
    const usage: UsageInfo = {
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
  async updateReferences(oldPath: string, newPath: string): Promise<UpdateResult> {
    const result: UpdateResult = {
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
      const updatedDocuments: Array<{ type: string; id: string; oldData: any }> = [];

      // Update scenes
      try {
        if ((game as any).scenes) {
          for (const scene of (game as any).scenes) {
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
            } catch (error) {
              const errorMsg = `Scene ${scene.id}: ${(error as Error).message}`;
              console.error(`Asset Atlas | ${errorMsg}`);
              result.errors.push(errorMsg);
            }
          }
        }
      } catch (error) {
        const errorMsg = `Error updating scenes: ${(error as Error).message}`;
        console.error(`Asset Atlas | ${errorMsg}`);
        result.errors.push(errorMsg);
      }

      // Update journals
      try {
        if ((game as any).journal) {
          for (const journal of (game as any).journal) {
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
            } catch (error) {
              const errorMsg = `Journal ${journal.id}: ${(error as Error).message}`;
              console.error(`Asset Atlas | ${errorMsg}`);
              result.errors.push(errorMsg);
            }
          }
        }
      } catch (error) {
        const errorMsg = `Error updating journals: ${(error as Error).message}`;
        console.error(`Asset Atlas | ${errorMsg}`);
        result.errors.push(errorMsg);
      }

      // Update actors
      try {
        if ((game as any).actors) {
          for (const actor of (game as any).actors) {
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
            } catch (error) {
              const errorMsg = `Actor ${actor.id}: ${(error as Error).message}`;
              console.error(`Asset Atlas | ${errorMsg}`);
              result.errors.push(errorMsg);
            }
          }
        }
      } catch (error) {
        const errorMsg = `Error updating actors: ${(error as Error).message}`;
        console.error(`Asset Atlas | ${errorMsg}`);
        result.errors.push(errorMsg);
      }

      // If there were errors, attempt rollback
      if (result.errors.length > 0 && updatedDocuments.length > 0) {
        console.warn('Asset Atlas | Errors occurred, attempting rollback...');
        await this.rollbackUpdates(updatedDocuments);
      }
    } catch (error) {
      const errorMsg = `Critical error in updateReferences: ${(error as Error).message}`;
      console.error(`Asset Atlas | ${errorMsg}`);
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * Rollback document updates
   */
  private async rollbackUpdates(updatedDocuments: Array<{ type: string; id: string; oldData: any }>): Promise<void> {
    try {
      if (typeof game === 'undefined') {
        console.error('Asset Atlas | Cannot rollback: Foundry game object not available');
        return;
      }

      for (const doc of updatedDocuments) {
        try {
          let collection: any;
          
          switch (doc.type) {
            case 'scene':
              collection = (game as any).scenes;
              break;
            case 'journal':
              collection = (game as any).journal;
              break;
            case 'actor':
              collection = (game as any).actors;
              break;
          }

          if (collection) {
            const document = collection.get(doc.id);
            if (document) {
              await document.update(doc.oldData);
              console.log(`Asset Atlas | Rolled back ${doc.type} ${doc.id}`);
            }
          }
        } catch (error) {
          console.error(`Asset Atlas | Failed to rollback ${doc.type} ${doc.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Asset Atlas | Critical error during rollback:', error);
    }
  }

  /**
   * Extracts asset paths from a document's data
   * This is a helper method that would be used by scanAllDocuments
   */
  private extractAssetPaths(documentData: any): string[] {
    const paths: string[] = [];

    // Recursively search through document data for asset paths
    const searchObject = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      for (const key in obj) {
        const value = obj[key];

        // Check if this looks like an asset path
        if (typeof value === 'string' && this.isAssetPath(value)) {
          paths.push(value);
        } else if (typeof value === 'object') {
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
  private isAssetPath(str: string): boolean {
    // Check for common asset path patterns
    const assetExtensions = /\.(png|jpg|jpeg|gif|webp|svg|mp3|ogg|wav|flac|mp4|webm)$/i;
    return assetExtensions.test(str);
  }

  /**
   * Updates a document's asset references
   * This is a helper method that would be used by updateReferences
   */
  private replaceAssetPaths(documentData: any, oldPath: string, newPath: string): boolean {
    let modified = false;

    const replaceInObject = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      for (const key in obj) {
        const value = obj[key];

        if (typeof value === 'string' && value === oldPath) {
          obj[key] = newPath;
          modified = true;
        } else if (typeof value === 'object') {
          replaceInObject(value);
        }
      }
    };

    replaceInObject(documentData);
    return modified;
  }
}
