/**
 * Core type definitions for Asset Atlas
 */

/**
 * Asset type enumeration
 */
export type AssetType = 'image' | 'audio' | 'video';

/**
 * Metadata extracted from an asset file
 */
export interface AssetMetadata {
  path: string;
  name: string;
  type: AssetType;
  size: number;
  modifiedDate: number;
  dimensions?: { width: number; height: number };
  duration?: number; // for audio/video
}

/**
 * Usage information for an asset
 */
export interface UsageInfo {
  scenes: string[];
  journals: string[];
  actors: string[];
  count: number;
}

/**
 * Cached asset with additional metadata
 */
export interface CachedAsset extends AssetMetadata {
  id: string;
  thumbnail?: string;
  tags: string[];
  usage: UsageInfo;
  indexed: number; // timestamp
}

/**
 * Search criteria for filtering assets
 */
export interface SearchCriteria {
  query?: string;
  types?: AssetType[];
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  unusedOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Tag definition
 */
export interface Tag {
  name: string;
  color?: string;
  created: number;
  usageCount: number;
}

/**
 * Result of a scan operation
 */
export interface ScanResult {
  assetsFound: number;
  assetsAdded: number;
  assetsUpdated: number;
  assetsRemoved: number;
  duration: number;
  errors: string[];
}

/**
 * Result of updating document references
 */
export interface UpdateResult {
  scenesUpdated: number;
  journalsUpdated: number;
  actorsUpdated: number;
  errors: string[];
}

/**
 * Thumbnail size options
 */
export type ThumbnailSize = 'small' | 'medium' | 'large';

/**
 * Module settings
 */
export interface AssetAtlasSettings {
  watchedDirectories: string[];
  excludedDirectories: string[];
  thumbnailSize: ThumbnailSize;
  autoScanInterval: number; // minutes, 0 = disabled
  batchSize: number;
  enableFilePicker: boolean;
  cacheLocation: string;
}

/**
 * Folder tree node
 */
export interface FolderNode {
  name: string;
  path: string;
  assetCount: number;
  children: Map<string, FolderNode>;
  isExpanded: boolean;
  level: number;
}

/**
 * Folder tree state for persistence
 */
export interface FolderTreeState {
  expandedFolders: string[];
  selectedFolder: string | null;
}
