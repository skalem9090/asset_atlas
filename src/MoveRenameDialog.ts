/**
 * Move/Rename Dialog - Shows confirmation with affected references
 */

import { CachedAsset, UsageInfo } from './types';
import { UsageTracker } from './UsageTracker';

export interface MoveRenameDialogOptions {
  asset: CachedAsset;
  operation: 'move' | 'rename';
  usageTracker: UsageTracker;
}

export class MoveRenameDialog extends Dialog {
  private asset: CachedAsset;
  private operation: 'move' | 'rename';
  private usageTracker: UsageTracker;
  private usage: UsageInfo;

  constructor(options: MoveRenameDialogOptions, dialogOptions = {}) {
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
  async getData(): Promise<any> {
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
  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('.cancel-button').on('click', () => this.close());
    html.find('form').on('submit', this._onSubmit.bind(this));
  }

  /**
   * Handle form submission
   */
  private async _onSubmit(event: JQuery.TriggeredEvent): Promise<void> {
    event.preventDefault();
    
    const form = $(event.currentTarget);
    const newPath = form.find('#new-path').val() as string;

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
  static async show(options: MoveRenameDialogOptions): Promise<string | null> {
    return new Promise((resolve) => {
      const dialog = new MoveRenameDialog(options, {
        callback: (newPath: string) => resolve(newPath)
      });
      dialog.render(true);
    });
  }
}
