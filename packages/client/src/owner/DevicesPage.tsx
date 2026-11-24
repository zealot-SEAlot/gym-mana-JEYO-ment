// The owner's Devices screen (R42, R51, KTD5, U3 plan step 4): get a one-time code to pair the door
// tablet, see each paired tablet with its last scan's time and address, and revoke one. A revoked
// tablet's next request is refused, and it shows the pairing screen again.
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.ts";
import { errorMessage } from "../forms.tsx";

// One row of GET /api/devices. Times are UTC text, like every time the server stores
interface Device {
  id: number;
  pairedAt: string;
  lastScanAt: string | null;
  lastScanAddress: string | null;
}

// The answer to POST /api/devices/pairing-code
interface PairingCode {
  pairingCode: string;
  expiresAt: string;
}

// Times are stored in UTC and shown in gym time, whatever time zone this device is set to (KTD7)
const gymTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
});

function shown(utc: string): string {
  return gymTime.format(new Date(utc));
}

export function DevicesPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDevices(await api<Device[]>("/devices", { userStarted: true }));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function getCode() {
    setBusy(true);
    setNotice(null);
    try {
      setCode(
        await api<PairingCode>("/devices/pairing-code", { method: "POST", userStarted: true }),
      );
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(device: Device) {
    // Undoing it means walking to the door and pairing again, so the owner confirms first
    if (!window.confirm(`Revoke tablet ${device.id}? It stops scanning until you pair it again.`)) {
      return;
    }
    setBusy(true);
    try {
      await api(`/devices/${device.id}`, { method: "DELETE", userStarted: true });
      setNotice(`Revoked tablet ${device.id}. It can't scan until it is paired again.`);
      await load();
    } catch (caught) {
      setError(
        errorMessage(caught, {
          device_not_found: "That tablet was already revoked. Refresh the list.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Devices</h1>
      <p role="status">{notice}</p>
      {error !== null && <p role="alert">{error}</p>}

      <h2>Pair the door tablet</h2>
      {code === null ? (
        <p>Get a code here, then type it on the door tablet.</p>
      ) : (
        <>
          <p>
            On the door tablet, open <strong>{window.location.origin}/door</strong> and type this
            code. It works once and stops working at {shown(code.expiresAt)}.
          </p>
          <p className="pairing-code">{code.pairingCode}</p>
        </>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void getCode();
        }}
      >
        {/* A new code replaces the old one, so only the newest code on screen works */}
        {code === null ? "Get a pairing code" : "Get a new code"}
      </button>

      <h2>Paired tablets</h2>
      {devices === null ? (
        error === null && <p>Loading tablets…</p>
      ) : devices.length === 0 ? (
        <p>No tablet is paired.</p>
      ) : (
        <ul>
          {devices.map((device) => (
            <li key={device.id}>
              <p>
                <strong>Tablet {device.id}</strong> · paired {shown(device.pairedAt)} · last scan{" "}
                {/* The address shows if a tablet starts scanning from somewhere it shouldn't (KTD5) */}
                {device.lastScanAt === null
                  ? "none yet"
                  : `${shown(device.lastScanAt)} from ${device.lastScanAddress ?? "an unknown address"}`}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void revoke(device);
                }}
              >
                Revoke tablet {device.id}
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* The list doesn't update itself, so after pairing at the door the owner refreshes it */}
      <button
        type="button"
        onClick={() => {
          void load();
        }}
      >
        Refresh list
      </button>
    </>
  );
}
