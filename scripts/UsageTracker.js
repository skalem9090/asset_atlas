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

export { UsageTracker };
//# sourceMappingURL=UsageTracker.js.map
