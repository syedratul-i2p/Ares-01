/**
 * ARES-01 Firebase Service
 * Handles all real-time communication between the dashboard and rover.
 *
 * Firebase Realtime Database schema:
 *   ares01/
 *     drive/direction          — "FORWARD" | "BACKWARD" | "LEFT" | "RIGHT" | "STOP"
 *     arm/angles               — { base, shoulder, elbow, wrist, gripper } (0–180)
 *     autonomous/action        — { command, raw, timestamp, language }
 *     telemetry/distance       — number (cm)
 *     telemetry/solar          — number (V)
 *     telemetry/motor_temp     — number (°C)
 *     telemetry/rssi           — number (dBm)
 *     telemetry/heartbeat      — number (Unix ms timestamp — written by rover)
 */

import { initializeApp, FirebaseApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off, Database, DatabaseReference } from "firebase/database";

// ─── Config ───────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured =
  !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;

let app: FirebaseApp | null = null;
let db: Database | null = null;

if (firebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    console.log("[ARES-01] Firebase initialized — Realtime Database ready");
  } catch (err) {
    console.warn("[ARES-01] Firebase init failed:", err);
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function dbRef(path: string): DatabaseReference | null {
  if (!db) return null;
  return ref(db, path);
}

// ─── Drive Control ────────────────────────────────────────────────────────────

let driveDebounce: ReturnType<typeof setTimeout> | null = null;

export type DriveDirection = "FORWARD" | "BACKWARD" | "LEFT" | "RIGHT" | "STOP";

export async function setDriveDirection(direction: DriveDirection): Promise<void> {
  const r = dbRef("ares01/drive/direction");
  if (!r) return;

  // Debounce rapid hold-to-move events to 50ms
  if (driveDebounce) clearTimeout(driveDebounce);
  driveDebounce = setTimeout(async () => {
    try {
      await set(r, direction);
    } catch (err) {
      console.warn("[ARES-01] Drive write failed:", err);
    }
  }, 50);
}

// ─── Arm Control ──────────────────────────────────────────────────────────────

export interface ArmAngles {
  base: number;
  shoulder: number;
  elbow: number;
  wrist: number;
  gripper: number;
}

let armDebounce: ReturnType<typeof setTimeout> | null = null;

export async function setArmAngles(angles: ArmAngles): Promise<void> {
  const r = dbRef("ares01/arm/angles");
  if (!r) return;

  if (armDebounce) clearTimeout(armDebounce);
  armDebounce = setTimeout(async () => {
    try {
      await set(r, angles);
    } catch (err) {
      console.warn("[ARES-01] Arm write failed:", err);
    }
  }, 80);
}

// ─── Autonomous Command ───────────────────────────────────────────────────────

export interface AutonomousAction {
  command: string;   // parsed machine command e.g. "PICK", "SCAN", "FORWARD"
  raw: string;       // original human text
  language: string;  // "en" | "bn"
  timestamp: number; // Date.now()
}

export async function sendAutonomousCommand(action: AutonomousAction): Promise<void> {
  const r = dbRef("ares01/autonomous/action");
  if (!r) {
    console.log("[ARES-01][FIREBASE-STUB] Autonomous action:", action);
    return;
  }
  try {
    await set(r, action);
  } catch (err) {
    console.warn("[ARES-01] Autonomous write failed:", err);
  }
}

// ─── Telemetry Listeners ──────────────────────────────────────────────────────

export interface Telemetry {
  distance: number;
  solar: number;
  motor_temp: number;
  rssi: number;
}

type TelemetryCallback = (data: Partial<Telemetry>) => void;
type HeartbeatCallback = (connected: boolean) => void;

const activeListeners: DatabaseReference[] = [];
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
const HEARTBEAT_TIMEOUT_MS = 3000;

export function subscribeTelemetry(
  onTelemetry: TelemetryCallback,
  onHeartbeat: HeartbeatCallback
): () => void {
  if (!db) {
    console.log("[ARES-01][FIREBASE-STUB] Telemetry subscription skipped — Firebase not configured");
    return () => {};
  }

  // Individual telemetry fields
  const fields: (keyof Telemetry)[] = ["distance", "solar", "motor_temp", "rssi"];
  fields.forEach(field => {
    const r = ref(db!, `ares01/telemetry/${field}`);
    activeListeners.push(r);
    onValue(r, snapshot => {
      const val = snapshot.val();
      if (val !== null) onTelemetry({ [field]: Number(val) });
    });
  });

  // Heartbeat: rover must update this timestamp every ~1–2s
  const hbRef = ref(db, "ares01/telemetry/heartbeat");
  activeListeners.push(hbRef);

  const resetHeartbeatTimer = () => {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      onHeartbeat(false);
    }, HEARTBEAT_TIMEOUT_MS);
  };

  onValue(hbRef, snapshot => {
    const ts = snapshot.val();
    if (ts !== null) {
      onHeartbeat(true);
      resetHeartbeatTimer();
    }
  });

  // Return unsubscribe function
  return () => {
    activeListeners.forEach(r => off(r));
    activeListeners.length = 0;
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
  };
}
