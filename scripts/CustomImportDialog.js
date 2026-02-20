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

export { CustomImportDialog };
//# sourceMappingURL=CustomImportDialog.js.map
