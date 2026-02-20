import { AssetBrowserUI } from './AssetBrowserUI.js';

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

export { FilePickerIntegration };
//# sourceMappingURL=FilePickerIntegration.js.map
