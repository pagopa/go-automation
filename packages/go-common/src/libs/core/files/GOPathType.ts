/**
 * Path type constants for resolution.
 *
 * Shared vocabulary between path resolution (`GOPaths`) and file copying
 * (`GOFileCopier`): it lives with the file utilities so that they do not
 * depend on the script-level path resolver.
 */
export const GOPathType = {
  INPUT: 'input',
  OUTPUT: 'output',
  CONFIG: 'config',
  CACHE: 'cache',
} as const;

/**
 * Type of path resolution
 */
export type GOPathTypeValue = (typeof GOPathType)[keyof typeof GOPathType];
