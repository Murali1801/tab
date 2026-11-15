interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const subs = new Set<() => void>();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  subs.forEach((s) => s());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  subs.forEach((s) => s());
});

export const canInstall = () => deferred !== null;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function onInstallChange(cb: () => void) {
  subs.add(cb);
  return () => void subs.delete(cb);
}

export async function install() {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice;
  deferred = null;
  subs.forEach((s) => s());
}
