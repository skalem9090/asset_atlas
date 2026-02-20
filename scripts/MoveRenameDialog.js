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

export { MoveRenameDialog };
//# sourceMappingURL=MoveRenameDialog.js.map
