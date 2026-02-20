/**
 * Dry Run Dialog - Shows what would be deleted without actually deleting
 */

/// <reference path="./foundry-types.d.ts" />

import { CachedAsset } from './types';

export interface DryRunDialogOptions {
  assets: CachedAsset[];
  totalSize: number;
  totalCount: number;
}

export class DryRunDialog extends Dialog {
  private assets: CachedAsset[];
  private totalSize: number;
  private totalCount: number;

  constructor(options: DryRunDialogOptions, dialogOptions = {}) {
    super({
      title: 'Dry Run - Deletion Preview',
      content: '',
      buttons: {},
      ...dialogOptions
    });

    this.assets = options.assets;
    this.totalSize = options.totalSize;
    this.totalCount = options.totalCount;
  }

  /**
   * Get default options
   */
  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      template: 'modules/asset-atlas/templates/dry-run-dialog.hbs',
      width: 700,
      classes: ['asset-atlas', 'dry-run-dialog'],
      resizable: true
    };
  }

  /**
   * Prepare data for rendering
   */
  async getData(): Promise<any> {
    const data = await super.getData();

    return {
      ...data,
      assets: this.assets,
      totalSize: this.totalSize,
      totalCount: this.totalCount
    };
  }

  /**
   * Activate event listeners
   */
  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('.close-button').on('click', () => {
      this.close();
    });

    html.find('.proceed-button').on('click', () => {
      this.close();
      if (this.data.callback) {
        this.data.callback(true);
      }
    });
  }

  /**
   * Show the dialog and return a promise with whether to proceed
   */
  static async show(options: DryRunDialogOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog = new DryRunDialog(options, {
        callback: (proceed: boolean) => resolve(proceed)
      });
      dialog.render(true);
    });
  }
}
