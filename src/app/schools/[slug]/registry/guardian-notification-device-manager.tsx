"use client";

import {
  useState,
} from "react";

import {
  obtainPasskeyStepUpGrant,
} from "@/client/passkey-step-up";

type Device = {
  id: string;
  status: string;
  platform: string;
  browser: string;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function GuardianNotificationDeviceManager(
  {
    schoolSlug,
    studentId,
    guardianLinkId,
    activeCount,
    onChanged,
  }: {
    schoolSlug: string;
    studentId: string;
    guardianLinkId: string;
    activeCount: number;
    onChanged?: () => void;
  },
) {
  const [open,setOpen] = useState(false);
  const [loading,setLoading] = useState(false);
  const [busyDeviceId,setBusyDeviceId] = useState("");
  const [devices,setDevices] = useState<Device[]>([]);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  const endpoint =
    `/api/schools/${encodeURIComponent(schoolSlug)}/registry/students/${encodeURIComponent(studentId)}/guardians/${encodeURIComponent(guardianLinkId)}/devices`;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint,{ cache: "no-store" });
      const text = await response.text();
      let body: { message?: string; devices?: Device[] } = {};
      if (text.trim()) {
        try { body = JSON.parse(text) as typeof body; } catch { body = {}; }
      }
      if (!response.ok) {
        throw new Error(body.message ?? `CASA could not load guardian notification devices. [HTTP ${response.status}]`);
      }
      setDevices(body.devices ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CASA could not load guardian notification devices.");
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    setNotice("");
    setError("");
    if (next) await load();
  }

  async function disable(device: Device) {
    setBusyDeviceId(device.id);
    setError("");
    setNotice("");
    try {
      const grant =
        await obtainPasskeyStepUpGrant({
          schoolSlug,
          action: "SECURITY_SETTINGS",
        });
      const response =
        await fetch(endpoint,{
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-casa-passkey-step-up": grant,
          },
          body: JSON.stringify({ action: "DISABLE", deviceId: device.id }),
        });
      const text = await response.text();
      let body: { message?: string; code?: string } = {};
      if (text.trim()) {
        try { body = JSON.parse(text) as typeof body; } catch { body = {}; }
      }
      if (!response.ok) {
        throw new Error(`${body.message ?? "CASA could not disable this notification device."} [HTTP ${response.status}]`);
      }
      setNotice("This device is disabled for this guardian-student relationship. Other active devices and other student relationships are unchanged.");
      await load();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CASA could not disable this notification device.");
    } finally {
      setBusyDeviceId("");
    }
  }

  return (
    <div className="w-full border-t border-black/10 pt-2">
      <button
        type="button"
        className="text-xs font-semibold underline underline-offset-4"
        disabled={loading || Boolean(busyDeviceId)}
        onClick={() => void toggle()}
      >
        {open ? "Hide notification devices" : `Manage notification devices (${activeCount} active)`}
      </button>

      {open ? (
        <div className="mt-3 grid gap-2">
          <p className="text-xs leading-5 text-black/55">
            A guardian can keep more than one active device and can use one browser device for more than one linked student. Disabling a device here affects only this guardian-student relationship.
          </p>
          {loading ? <p className="text-xs text-black/45">Loading devices...</p> : null}
          {!loading && devices.length === 0 ? (
            <p className="text-xs text-black/45">No notification devices are registered for this relationship yet.</p>
          ) : null}

          {devices.map((device) => (
            <div key={device.id} className="border border-black/15 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold">{device.platform} - {device.browser}</p>
                  <p className="mt-1 text-[11px] text-black/45">
                    {device.status}
                    {device.lastSeenAt ? ` - last seen ${new Date(device.lastSeenAt).toLocaleString()}` : ""}
                  </p>
                </div>
                {device.status === "ACTIVE" ? (
                  <button
                    type="button"
                    className="casa-button-secondary"
                    disabled={Boolean(busyDeviceId)}
                    onClick={() => void disable(device)}
                  >
                    {busyDeviceId === device.id ? "Disabling..." : "Disable for this student"}
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold text-black/45">Disabled</span>
                )}
              </div>
            </div>
          ))}

          {notice ? <p className="text-xs leading-5">{notice}</p> : null}
          {error ? <p className="text-xs leading-5 text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
