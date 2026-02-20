/**
 * Import Dialog - UI for importing assets from library to world
 */

/// <reference path="./foundry-types.d.ts" />

import { CachedAsset } from './types';
import { AssetAtlasFolder } from './AssetAtlasFolder';

export interface ImportDialogOptions {
  assets: CachedAsset[];
  worldName: string;
  folderManager: AssetAtlasFolder;
}

export interface ImportDialogResult {
  copy: boolean;
  overwrite: boolean;
  preserveStructure: boolean;
}

export class ImportDialog extends Dialog {
  private assets: CachedAsset[];
  private worldName: string;
  private folderManager: AssetAtlasFolder;

  constructor(options: ImportDialogOptions, dialogOptions = {}) {
    super({
      title: 'Import Assets to World',
      content: '',
      buttons: {},
      ...dialogOptions
    });

    this.assets = options.assets;
    this.worldName = options.worldName;
    this.folderManager = options.folderManager;
  }

  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      template: 'modules/asset-atlas/templates/import-dialog.hbs',
      width: 600,
      classes: ['asset-atlas', 'import-dialog'],
      resizable: true
    };
  }

  async getData(): Promise<any> {
    const data = await super.getData();
    
    const assetCount = this.assets.length;
    const destinationPath = this.folderManager.getWorldPath(this.worldName);

    return {
      ...data,
      assets: this.assets,
      assetCount,
      worldName: this.worldName,
      destinationPath
    };
  }

  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('.cancel-button').on('click', () => {
      this.close();
    });

    html.find('.import-button').on('click', () => {
      const result: ImportDialogResult = {
        copy: html.find('#copy-files').is(':checked'),
        overwrite: html.find('#overwrite-existing').is(':checked'),
        preserveStructure: html.find('#preserve-structure').is(':checked')
      };

      this.close();
      
      if (this.data.callback) {
        this.data.callback(result);
      }
    });
  }

  static async show(options: ImportDialogOptions): Promise<ImportDialogResult | null> {
    return new Promise((resolve) => {
      const dialog = new ImportDialog(options, {
        callback: (result: ImportDialogResult) => resolve(result)
      });
      dialog.render(true);
    });
  }
}
