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

export { DeleteConfirmationDialog };
//# sourceMappingURL=DeleteConfirmationDialog.js.map
