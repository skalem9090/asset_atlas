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

export { SettingsDialog };
//# sourceMappingURL=SettingsDialog.js.map
