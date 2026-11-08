// Values are injected by vite.config.ts (define). BUILD_NUMBER is "dev" for local builds.
export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_NUMBER: string = __BUILD_NUMBER__;
export const BUILD_DATE: string = __BUILD_DATE__;

/** e.g. "1.0.0 (বিল্ড 12) • 08 Nov 2026" */
export function versionLabel(): string {
  const build = BUILD_NUMBER === 'dev' ? 'dev' : `বিল্ড ${BUILD_NUMBER}`;
  return `${APP_VERSION} (${build}) • ${BUILD_DATE}`;
}
