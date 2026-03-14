import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { scannerService } from '../scanner/ScannerService';
import { useScannerStore } from '../store/scannerStore';
import { loadLastSession } from '../storage/AsyncStorageService';

let started = false;

export function useScanner() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!started) {
      started = true;
      scannerService.subscribe();

      // Load persisted scan session
      loadLastSession().then((session) => {
        if (session?.devices && session.devices.length > 0) {
          const store = useScannerStore.getState();
          store.setStaleSession(session.devices, session.ts);
        }
      });
    }

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      // Auto-stop scan when app goes to background
      if (prev === 'active' && next !== 'active') {
        if (useScannerStore.getState().scanning) {
          scannerService.stopScan();
        }
      }
    });

    return () => {
      sub.remove();
      // Don't unsubscribe service — it lives for the app lifetime
    };
  }, []);

  const store = useScannerStore();
  return {
    ...store,
    startScan: () => scannerService.startScan(),
    stopScan: () => scannerService.stopScan(),
    connect: (id: string) => scannerService.connect(id),
    disconnect: (id: string) => scannerService.disconnect(id),
  };
}
