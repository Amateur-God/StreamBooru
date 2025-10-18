export async function ensureStoragePermission() {
  if (typeof window === 'undefined' || !window.Capacitor) return true;
  const platform = window.Capacitor.getPlatform();
  if (platform !== 'android') return true;

  try {
    const { Filesystem } = await import('@capacitor/filesystem');
    const perm = await Filesystem.requestPermissions();
    return perm.publicStorage === 'granted' || perm.publicStorage === 'limited';
  } catch {
    return true;
  }
}
