/**
 * Run after `npx cap add android` / `npx cap sync android`.
 * 1. Adds storage permissions (incl. MANAGE_EXTERNAL_STORAGE = "All files access") to AndroidManifest.xml
 * 2. Installs the StorageAccess native plugin + MainActivity that registers it
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
// Package name comes from capacitor.config.json (appId) so the folder / Java package always match it
const capConfig = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const appId = capConfig.appId;
const javaDir = path.join(root, 'android/app/src/main/java', ...appId.split('.'));

// ---- 1. Manifest ----
if (!fs.existsSync(manifestPath)) {
  console.error('AndroidManifest.xml not found: ' + manifestPath);
  process.exit(1);
}
let manifest = fs.readFileSync(manifestPath, 'utf8');

const perms = [
  '<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
];

for (const perm of perms) {
  const name = perm.match(/android:name="([^"]+)"/)[1];
  if (!manifest.includes(name)) {
    manifest = manifest.replace(/<application/, perm + '\n    <application');
    console.log('Added permission: ' + name);
  } else {
    console.log('Permission already present: ' + name);
  }
}

if (!manifest.includes('android:requestLegacyExternalStorage')) {
  manifest = manifest.replace(/<application/, '<application android:requestLegacyExternalStorage="true"');
  console.log('Added requestLegacyExternalStorage');
}

fs.writeFileSync(manifestPath, manifest, 'utf8');

// ---- 2. Native plugin ----
fs.mkdirSync(javaDir, { recursive: true });
for (const file of ['StorageAccessPlugin.java', 'MainActivity.java']) {
  const src = fs.readFileSync(path.join(root, 'native-android', file), 'utf8').replace(/^package\s+[\w.]+;/m, 'package ' + appId + ';');
  fs.writeFileSync(path.join(javaDir, file), src, 'utf8');
  console.log('Installed ' + file + ' (package ' + appId + ')');
}
