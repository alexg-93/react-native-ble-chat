import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import {
  discoverServices, discoverCharacteristics,
  readCharacteristic,
  subscribeCharacteristic, unsubscribeCharacteristic,
  addServicesDiscoveredListener, addCharacteristicsDiscoveredListener,
  addCharacteristicReadListener, addCharacteristicChangedListener,
} from '../../modules/expo-bluetooth-scanner';
import type { GattService, GattCharacteristic } from '../../modules/expo-bluetooth-scanner';
import { useScannerStore } from '../store/scannerStore';

interface CharHistory {
  [charUuid: string]: Array<{ value: string; ts: number }>;
}

export function useGattDetail(deviceId: string) {
  const [services, setServices] = useState<GattService[]>([]);
  const [characteristics, setCharacteristics] = useState<{ [svcUuid: string]: GattCharacteristic[] }>({});
  const [values, setValues] = useState<{ [charUuid: string]: string }>({});
  const [notifying, setNotifying] = useState<{ [charUuid: string]: boolean }>({});
  const [charHistory, setCharHistory] = useState<CharHistory>({});
  const [expandedHistory, setExpandedHistory] = useState<{ [charUuid: string]: boolean }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to events
  const subRefs = useState<Array<{ remove: () => void }>>(() => [])[0];

  const discover = useCallback(() => {
    setLoading(true);
    setError(null);

    // Clean up previous subs
    subRefs.forEach((s) => s.remove());
    subRefs.length = 0;

    subRefs.push(
      addServicesDiscoveredListener((evt) => {
        if (evt.id !== deviceId) return;
        setServices(evt.services);
        setLoading(false);
        evt.services.forEach((svc: GattService) => {
          discoverCharacteristics(deviceId, svc.uuid);
        });
      }),
    );

    subRefs.push(
      addCharacteristicsDiscoveredListener((evt) => {
        if (evt.id !== deviceId) return;
        setCharacteristics((prev) => ({ ...prev, [evt.serviceUUID]: evt.characteristics }));
      }),
    );

    subRefs.push(
      addCharacteristicReadListener((evt) => {
        if (evt.id !== deviceId) return;
        setValues((prev) => ({ ...prev, [evt.charUUID]: evt.value }));
        setCharHistory((prev) => ({
          ...prev,
          [evt.charUUID]: [
            ...(prev[evt.charUUID] ?? []),
            { value: evt.value, ts: Date.now() },
          ].slice(-50),
        }));
      }),
    );

    subRefs.push(
      addCharacteristicChangedListener((evt) => {
        if (evt.id !== deviceId) return;
        setValues((prev) => ({ ...prev, [evt.charUUID]: evt.value }));
        setCharHistory((prev) => ({
          ...prev,
          [evt.charUUID]: [
            ...(prev[evt.charUUID] ?? []),
            { value: evt.value, ts: Date.now() },
          ].slice(-50),
        }));
      }),
    );

    discoverServices(deviceId);
  }, [deviceId]);

  const readChar = useCallback((svcUUID: string, charUUID: string) => {
    readCharacteristic(deviceId, svcUUID, charUUID);
  }, [deviceId]);

  const toggleSubscribe = useCallback((svcUUID: string, charUUID: string) => {
    if (notifying[charUUID]) {
      unsubscribeCharacteristic(deviceId, svcUUID, charUUID);
      setNotifying((prev) => ({ ...prev, [charUUID]: false }));
    } else {
      subscribeCharacteristic(deviceId, svcUUID, charUUID);
      setNotifying((prev) => ({ ...prev, [charUUID]: true }));
    }
  }, [deviceId, notifying]);

  const toggleHistory = useCallback((charUUID: string) => {
    setExpandedHistory((prev) => ({ ...prev, [charUUID]: !prev[charUUID] }));
  }, []);

  const cleanup = useCallback(() => {
    subRefs.forEach((s) => s.remove());
    subRefs.length = 0;
    Object.keys(notifying).forEach((charUUID) => {
      if (notifying[charUUID]) {
        Object.entries(characteristics).forEach(([svcUUID, chars]) => {
          if (chars.some((c) => c.uuid === charUUID)) {
            unsubscribeCharacteristic(deviceId, svcUUID, charUUID);
          }
        });
      }
    });
  }, [deviceId, notifying, characteristics]);

  return {
    services,
    characteristics,
    values,
    notifying,
    charHistory,
    expandedHistory,
    loading,
    error,
    discover,
    readChar,
    toggleSubscribe,
    toggleHistory,
    cleanup,
  };
}
