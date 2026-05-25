import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Sun, Moon, Settings, Signal, Battery, ArrowUp, ArrowDown,
  ArrowLeft, ArrowRight, Square, Mic, Send, CheckCircle2, Cpu,
  Thermometer, Zap, Radio, Ruler, Wifi, WifiOff, Globe, Loader2,
  Activity, Video, X, Plug, RotateCcw, Gamepad2, Bot,
  AlertTriangle, Database, Camera
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useInterval } from "@/hooks/use-interval";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  firebaseConfigured,
  setDriveDirection,
  setArmAngles,
  sendAutonomousCommand,
  subscribeTelemetry,
  type DriveDirection,
  type ArmAngles,
} from "@/lib/firebase";
import { parseCommand, ACTION_LABELS } from "@/lib/commandParser";

// ─── Types & Constants ────────────────────────────────────────────────────────

type RoverConnectionStatus = "disconnected" | "connecting" | "connected";
type Direction = "forward" | "backward" | "left" | "right";
type ControlMode = "manual" | "ai" | "voice";

const LOG = "[ARES-01]";

const CONTROL_TABS: { id: ControlMode; label: string; icon: React.ElementType }[] = [
  { id: "manual", label: "Manual Control", icon: Gamepad2 },
  { id: "ai",     label: "AI Directive",   icon: Bot      },
  { id: "voice",  label: "Voice Command",  icon: Mic      },
];

const JOINT_CONFIG = {
  base:     { label: "Base",     color: "#64748b", accentClass: "text-slate-500",   dotClass: "bg-slate-500"   },
  shoulder: { label: "Shoulder", color: "#3b82f6", accentClass: "text-blue-500",    dotClass: "bg-blue-500"    },
  elbow:    { label: "Elbow",    color: "#6366f1", accentClass: "text-indigo-500",  dotClass: "bg-indigo-500"  },
  wrist:    { label: "Wrist",    color: "#8b5cf6", accentClass: "text-violet-500",  dotClass: "bg-violet-500"  },
  gripper:  { label: "Gripper",  color: "#10b981", accentClass: "text-emerald-500", dotClass: "bg-emerald-500" },
} as const;

const JOINT_ORDER = ["base", "shoulder", "elbow", "wrist", "gripper"] as const;

const ARM_PRESETS = [
  { name: "Home",  joints: { base: 90, shoulder: 90,  elbow: 90,  wrist: 90, gripper: 0   } },
  { name: "Pick",  joints: { base: 90, shoulder: 45,  elbow: 135, wrist: 90, gripper: 180 } },
  { name: "Drop",  joints: { base: 45, shoulder: 60,  elbow: 90,  wrist: 45, gripper: 0   } },
  { name: "Reach", joints: { base: 90, shoulder: 150, elbow: 150, wrist: 90, gripper: 90  } },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { theme, setTheme } = useTheme();

  // ── Simulated telemetry (used when Firebase not connected) ─────────────────
  const [simFps,      setSimFps]      = useState(24);
  const [simRssi,     setSimRssi]     = useState(-62);
  const [simDistance, setSimDistance] = useState(120);
  const [simPitch,    setSimPitch]    = useState(2.4);
  const [simRoll,     setSimRoll]     = useState(-1.2);
  const [simYaw,      setSimYaw]      = useState(45.1);
  const [simSolar,    setSimSolar]    = useState(4.2);
  const [simMotorT,   setSimMotorT]   = useState(42.5);

  useInterval(() => {
    setSimFps(Math.floor(22 + Math.random() * 6));
    setSimRssi(Math.floor(-65 + Math.random() * 8));
    setSimDistance(Math.floor(115 + Math.random() * 10));
    setSimPitch(Number((2.4  + (Math.random() * 0.4 - 0.2)).toFixed(1)));
    setSimRoll(Number((-1.2  + (Math.random() * 0.4 - 0.2)).toFixed(1)));
    setSimYaw(Number((45.1   + (Math.random() * 0.4 - 0.2)).toFixed(1)));
  }, 1000);

  // ── Live telemetry from Firebase (overrides simulated when available) ───────
  const [liveTelemetry, setLiveTelemetry] = useState<{
    distance?: number; solar?: number; motor_temp?: number; rssi?: number;
  }>({});

  const distance  = liveTelemetry.distance   ?? simDistance;
  const solar     = liveTelemetry.solar      ?? simSolar;
  const motorTemp = liveTelemetry.motor_temp ?? simMotorT;
  const rssi      = liveTelemetry.rssi       ?? simRssi;
  const fps       = simFps;
  const pitch     = simPitch;
  const roll      = simRoll;
  const yaw       = simYaw;

  // ── Rover heartbeat / Firebase connection ──────────────────────────────────
  const [roverOnline, setRoverOnline] = useState(false);
  const [fbStatus, setFbStatus] = useState<"ready" | "not-configured">(
    firebaseConfigured ? "ready" : "not-configured"
  );

  useEffect(() => {
    if (!firebaseConfigured) return;
    const unsub = subscribeTelemetry(
      data => setLiveTelemetry(prev => ({ ...prev, ...data })),
      online => setRoverOnline(online)
    );
    return unsub;
  }, []);

  // ── Control Mode ──────────────────────────────────────────────────────────
  const [controlMode, setControlMode] = useState<ControlMode>("manual");

  // ── D-Pad ──────────────────────────────────────────────────────────────────
  const [activeDirection, setActiveDirection] = useState<Direction | null>(null);

  const handleDirectionPress = useCallback((dir: Direction) => {
    setActiveDirection(dir);
    const fbDir = dir.toUpperCase() as DriveDirection;
    console.log(`${LOG} Drive: ${fbDir}`);
    setDriveDirection(fbDir);
    // TODO: also POST to local Python backend if needed
  }, []);

  const handleDirectionRelease = useCallback(() => {
    if (activeDirection !== null) {
      setActiveDirection(null);
      console.log(`${LOG} Drive: STOP`);
      setDriveDirection("STOP");
    }
  }, [activeDirection]);

  const handleStop = useCallback(() => {
    setActiveDirection(null);
    console.log(`${LOG} Drive: STOP (manual)`);
    setDriveDirection("STOP");
  }, []);

  const dpadActive = (dir: Direction) =>
    activeDirection === dir ? "scale-90 opacity-60 ring-2 ring-primary/40" : "";

  // ── 5DOF Arm ───────────────────────────────────────────────────────────────
  const DEFAULT_JOINTS: ArmAngles = { base: 90, shoulder: 90, elbow: 90, wrist: 90, gripper: 0 };
  const [joints, setJoints] = useState<ArmAngles>({ base: 90, shoulder: 45, elbow: 120, wrist: 90, gripper: 0 });
  const resetAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateJoint = (joint: keyof ArmAngles, delta: number) => {
    setJoints(prev => {
      const next = { ...prev, [joint]: Math.max(0, Math.min(180, prev[joint] + delta)) };
      console.log(`${LOG} Arm: ${joint} → ${next[joint]}°`);
      setArmAngles(next);
      return next;
    });
  };

  const setJointAngle = (joint: keyof ArmAngles, raw: number) => {
    const val = Math.max(0, Math.min(180, raw));
    setJoints(prev => {
      const next = { ...prev, [joint]: val };
      setArmAngles(next);
      return next;
    });
  };

  const animateJointsTo = (target: ArmAngles, label: string) => {
    if (resetAnimRef.current) clearInterval(resetAnimRef.current);
    console.log(`${LOG} Arm → ${label}`);
    const start = { ...joints };
    const steps = 24;
    let step = 0;
    resetAnimRef.current = setInterval(() => {
      step++;
      const t = 1 - Math.pow(1 - step / steps, 3);
      const next: ArmAngles = {
        base:     Math.round(start.base     + (target.base     - start.base)     * t),
        shoulder: Math.round(start.shoulder + (target.shoulder - start.shoulder) * t),
        elbow:    Math.round(start.elbow    + (target.elbow    - start.elbow)    * t),
        wrist:    Math.round(start.wrist    + (target.wrist    - start.wrist)    * t),
        gripper:  Math.round(start.gripper  + (target.gripper  - start.gripper)  * t),
      };
      setJoints(next);
      if (step >= steps) {
        clearInterval(resetAnimRef.current!);
        resetAnimRef.current = null;
        setArmAngles(next); // final write to Firebase
      }
    }, 16);
  };

  const handleResetArm = () => animateJointsTo(DEFAULT_JOINTS, "Home (reset)");
  const applyPreset = (p: typeof ARM_PRESETS[0]) => animateJointsTo(p.joints, `Preset: ${p.name}`);

  const [stepSize, setStepSize] = useState<1 | 5 | 15>(5);
  const [editingJoint, setEditingJoint] = useState<keyof ArmAngles | null>(null);
  const [editValue, setEditValue] = useState("");
  const startEdit = (j: keyof ArmAngles, v: number) => { setEditingJoint(j); setEditValue(String(v)); };
  const commitEdit = (j: keyof ArmAngles) => {
    const p = parseInt(editValue, 10);
    if (!isNaN(p)) setJointAngle(j, p);
    setEditingJoint(null);
  };

  // ── AI Command ─────────────────────────────────────────────────────────────
  const [command, setCommand] = useState("");
  const [language, setLanguage] = useState("en");
  const [history, setHistory] = useState([
    { id: 1, text: "Move forward 2 meters and scan for obstacles", action: "FORWARD → SCAN", time: "10:42:15 AM", status: "ok" as const },
    { id: 2, text: "Rotate base 45 degrees left",                  action: "ROTATE → LEFT",  time: "10:40:02 AM", status: "ok" as const },
    { id: 3, text: "Initialize YOLOv8 object detection",           action: "SCAN",            time: "10:38:55 AM", status: "ok" as const },
  ]);
  const commandInputRef = useRef<HTMLInputElement>(null);

  const handleSendCommand = useCallback(async () => {
    if (!command.trim()) return;
    const result = parseCommand(command);
    const label = ACTION_LABELS[result.action];
    console.log(`${LOG} AI Command [${language}]: "${command}" → ${result.action} (${result.confidence})`);

    await sendAutonomousCommand({
      command: result.action,
      raw: command,
      language,
      timestamp: Date.now(),
    });

    setHistory(prev => [{
      id: Date.now(),
      text: command,
      action: `${result.action} — ${label}`,
      time: new Date().toLocaleTimeString(),
      status: result.action === "UNKNOWN" ? "warn" as const : "ok" as const,
    }, ...prev].slice(0, 8));
    setCommand("");
  }, [command, language]);

  // ── Voice ──────────────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const handleVoiceToggle = useCallback(async () => {
    const SpeechRecognitionAPI =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!isListening && SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = language === "bn" ? "bn-BD" : "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        console.log(`${LOG} Voice transcript: "${transcript}"`);
        const result = parseCommand(transcript);
        console.log(`${LOG} Voice → ${result.action}`);
        await sendAutonomousCommand({ command: result.action, raw: transcript, language, timestamp: Date.now() });
        setHistory(prev => [{
          id: Date.now(), text: transcript,
          action: `${result.action} — ${ACTION_LABELS[result.action]}`,
          time: new Date().toLocaleTimeString(),
          status: result.action === "UNKNOWN" ? "warn" as const : "ok" as const,
        }, ...prev].slice(0, 8));
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend   = () => setIsListening(false);
      recognition.start();
      setIsListening(true);
      console.log(`${LOG} Voice recognition started (${language})`);
    } else {
      recognitionRef.current?.stop();
      setIsListening(false);
      console.log(`${LOG} Voice recognition stopped`);
    }
  }, [isListening, language]);

  // ── Camera Stream ──────────────────────────────────────────────────────────
  const [roverIp, setRoverIp] = useState("");
  const [streamSrc, setStreamSrc] = useState<string | null>(null);
  const [streamError, setStreamError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleConnectCamera = () => {
    if (!roverIp.trim()) return;
    const url = roverIp.startsWith("http") ? `${roverIp}/stream` : `http://${roverIp}/stream`;
    console.log(`${LOG} Connecting camera stream: ${url}`);
    setStreamError(false);
    setStreamSrc(url);
  };

  const handleDisconnectCamera = () => {
    setStreamSrc(null);
    setStreamError(false);
    console.log(`${LOG} Camera stream disconnected`);
  };

  // ── Settings panel ─────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [roverConnectionStatus, setRoverConnectionStatus] = useState<RoverConnectionStatus>("disconnected");
  const [ping, setPing] = useState<number | null>(null);
  const [wsUrl, setWsUrl] = useState("");

  useInterval(() => {
    if (roverConnectionStatus === "connected") setPing(Math.floor(8 + Math.random() * 18));
  }, 1200);

  const handleConnectWs = () => {
    console.log(`${LOG} Connecting WebSocket → ${wsUrl || "<no url>"}`);
    setRoverConnectionStatus("connecting");
    setTimeout(() => {
      setRoverConnectionStatus("connected");
      setPing(12);
      console.log(`${LOG} WebSocket connected`);
    }, 2000);
  };

  const handleDisconnectWs = () => {
    setRoverConnectionStatus("disconnected");
    setPing(null);
    console.log(`${LOG} WebSocket disconnected`);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-background text-foreground flex flex-col font-sans overflow-hidden">

      {/* ── Top Nav ── */}
      <header className="h-12 border-b bg-card/90 backdrop-blur-sm flex items-center justify-between px-5 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-base tracking-tight">ARES-01</h1>
          <span className="text-muted-foreground text-xs font-medium hidden sm:inline">Rover Mission Control</span>
          {/* Heartbeat / rover online dot */}
          <Badge
            variant="outline"
            className={`text-[10px] h-5 transition-colors duration-500 ${
              roverOnline
                ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                : "bg-red-500/10 text-red-500 border-red-500/20"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 transition-colors duration-500 ${roverOnline ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
            {roverOnline ? "ROVER ONLINE" : "ROVER OFFLINE"}
          </Badge>
          {/* Firebase status */}
          {fbStatus === "not-configured" && (
            <Badge variant="outline" className="text-[10px] h-5 bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
              <Database className="w-2.5 h-2.5" />
              Firebase not configured
            </Badge>
          )}
          {fbStatus === "ready" && (
            <Badge variant="outline" className="text-[10px] h-5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 gap-1">
              <Database className="w-2.5 h-2.5" />
              Firebase live
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant={showSettings ? "secondary" : "ghost"} size="icon" className="h-8 w-8"
            onClick={() => setShowSettings(s => !s)} data-testid="button-settings">
            {showSettings ? <X className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")} data-testid="button-theme-toggle">
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </header>

      {/* ── Settings / Connection Panel ── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div key="settings"
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden border-b bg-card/70 backdrop-blur-sm z-10 shrink-0">
            <div className="px-5 py-4 max-w-6xl mx-auto w-full space-y-4">

              {/* Firebase status banner */}
              {fbStatus === "not-configured" && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/8">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                    <p className="font-semibold">Firebase Realtime Database not configured</p>
                    <p className="text-amber-600/80 dark:text-amber-400/80">
                      Add your Firebase project credentials to the Replit Secrets panel:<br />
                      <span className="font-mono">VITE_FIREBASE_API_KEY</span> ·{" "}
                      <span className="font-mono">VITE_FIREBASE_DATABASE_URL</span> ·{" "}
                      <span className="font-mono">VITE_FIREBASE_PROJECT_ID</span> ·{" "}
                      <span className="font-mono">VITE_FIREBASE_APP_ID</span>
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Camera stream */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Camera className="w-3 h-3" /> ESP32-CAM Stream
                  </label>
                  <div className="flex gap-1.5">
                    <Input
                      className="h-8 text-xs bg-background font-mono flex-1"
                      placeholder="192.168.1.100"
                      value={roverIp}
                      onChange={e => setRoverIp(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleConnectCamera()}
                      data-testid="input-rover-ip"
                    />
                    {streamSrc ? (
                      <Button variant="outline" size="sm" className="h-8 text-xs border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 shrink-0"
                        onClick={handleDisconnectCamera} data-testid="btn-disconnect-camera">
                        <X className="w-3 h-3 mr-1" /> Disconnect
                      </Button>
                    ) : (
                      <Button size="sm" className="h-8 text-xs shrink-0"
                        onClick={handleConnectCamera} disabled={!roverIp.trim()} data-testid="btn-connect-camera">
                        <Camera className="w-3 h-3 mr-1" /> Connect
                      </Button>
                    )}
                  </div>
                  {streamSrc && (
                    <p className="text-[10px] font-mono text-muted-foreground truncate">
                      {streamError ? "⚠ Stream unreachable" : `▶ ${streamSrc}`}
                    </p>
                  )}
                </div>

                {/* WebSocket / HTTP direct */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3 h-3" /> WebSocket Endpoint
                  </label>
                  <div className="flex gap-1.5">
                    <Input className="h-8 text-xs bg-background font-mono flex-1"
                      placeholder="ws://192.168.1.100:81"
                      value={wsUrl}
                      onChange={e => setWsUrl(e.target.value)}
                      data-testid="input-ws-url"
                    />
                    {roverConnectionStatus === "connected" ? (
                      <Button variant="outline" size="sm" className="h-8 text-xs border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 shrink-0"
                        onClick={handleDisconnectWs} data-testid="btn-disconnect-ws">
                        <WifiOff className="w-3 h-3 mr-1" /> Disconnect
                      </Button>
                    ) : (
                      <Button size="sm" className="h-8 text-xs shrink-0"
                        onClick={handleConnectWs} disabled={roverConnectionStatus === "connecting"} data-testid="btn-connect-ws">
                        {roverConnectionStatus === "connecting"
                          ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          : <Wifi className="w-3 h-3 mr-1" />}
                        {roverConnectionStatus === "connecting" ? "Connecting…" : "Connect"}
                      </Button>
                    )}
                  </div>
                  {ping !== null && roverConnectionStatus === "connected" && (
                    <p className="text-[10px] font-mono text-green-600 dark:text-green-400">✓ Connected — {ping}ms latency</p>
                  )}
                </div>

                {/* Firebase DB info */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Database className="w-3 h-3" /> Firebase Realtime DB
                  </label>
                  <div className="text-[10px] font-mono text-muted-foreground space-y-0.5 bg-muted/40 rounded-md p-2 border border-border/50">
                    <div><span className="text-foreground/60">drive:</span> ares01/drive/direction</div>
                    <div><span className="text-foreground/60">arm:</span> ares01/arm/angles</div>
                    <div><span className="text-foreground/60">cmd:</span> ares01/autonomous/action</div>
                    <div><span className="text-foreground/60">telemetry:</span> ares01/telemetry/*</div>
                    <div><span className="text-foreground/60">heartbeat:</span> ares01/telemetry/heartbeat</div>
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Vertical Stack ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* 1. CAMERA VIEW — 16:9 aspect ratio, capped at 55vh on large screens */}
        <div
          className="w-full shrink-0 relative bg-black overflow-hidden"
          style={{ height: "min(56.25vw, 55vh)" }}
        >
          {/* MJPEG stream */}
          {streamSrc && !streamError ? (
            <img
              ref={imgRef}
              src={streamSrc}
              alt="ARES-01 live feed"
              className="w-full h-full object-contain"
              onError={() => { setStreamError(true); console.warn(`${LOG} Camera stream error at ${streamSrc}`); }}
              data-testid="camera-feed"
            />
          ) : (
            <>
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                {streamError ? (
                  <>
                    <AlertTriangle className="w-8 h-8 text-red-400/60" />
                    <span className="text-red-400/60 font-mono text-sm">STREAM UNREACHABLE</span>
                    <span className="text-white/20 font-mono text-xs">{streamSrc}</span>
                  </>
                ) : (
                  <>
                    <span className="text-white/15 font-mono text-xl tracking-widest select-none">FEED — ESP32-CAM</span>
                    <span className="text-white/10 font-mono text-xs">Enter rover IP in Settings to connect</span>
                  </>
                )}
              </div>
            </>
          )}

          {/* Top-left overlay */}
          <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
            <div className={`flex items-center gap-1.5 bg-black/55 backdrop-blur-md border border-white/10 rounded-md px-2.5 py-1 transition-all duration-500 ${streamSrc && !streamError ? "border-green-500/30" : ""}`}>
              <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${streamSrc && !streamError ? "bg-green-400 animate-pulse" : "bg-white/30"}`} />
              <span className="text-white text-[11px] font-medium">{streamSrc && !streamError ? "Live" : "No Signal"}</span>
            </div>
            {streamSrc && !streamError && (
              <div className="bg-black/55 backdrop-blur-md border border-white/10 rounded-md px-2.5 py-1">
                <span className="text-white/80 font-mono text-[11px]">{fps} FPS</span>
              </div>
            )}
          </div>

          {/* Top-right overlay */}
          <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none">
            <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur-md border border-white/10 rounded-md px-2.5 py-1">
              <Signal className="w-3 h-3 text-white/70" />
              <span className="text-white/80 font-mono text-[11px]">{rssi} dBm</span>
            </div>
            <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur-md border border-white/10 rounded-md px-2.5 py-1">
              <Battery className="w-3 h-3 text-white/70" />
              <span className="text-white/80 font-mono text-[11px]">87% — 3654mAh</span>
            </div>
          </div>
        </div>

        {/* 2. MODE SELECTOR TABS */}
        <div className="shrink-0 px-4 pt-3 pb-0 bg-background z-10">
          <div className="relative flex rounded-xl bg-muted/50 border border-border/50 p-1 gap-0.5 max-w-3xl mx-auto">
            {CONTROL_TABS.map(tab => (
              <button key={tab.id} onClick={() => setControlMode(tab.id)}
                className={`relative flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg z-10 transition-colors duration-150 select-none ${
                  controlMode === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-${tab.id}`}>
                {controlMode === tab.id && (
                  <motion.div layoutId="tab-pill" className="absolute inset-0 bg-background rounded-lg shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                )}
                <tab.icon className="w-3.5 h-3.5 relative z-10 shrink-0" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. INTERACTIVE CONTROL AREA */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>

            {/* ── MANUAL CONTROL ── */}
            {controlMode === "manual" && (
              <motion.div key="manual"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-7xl mx-auto w-full">

                  {/* LEFT: Drive D-Pad */}
                  <div className="flex flex-col items-center justify-center gap-3 py-2">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Drive Controls</div>
                    <div className="flex flex-col items-center gap-1.5 select-none">
                      <Button variant="secondary" size="lg"
                        className={`w-16 h-16 rounded-2xl shadow-sm transition-all duration-75 ${dpadActive("forward")}`}
                        onMouseDown={() => handleDirectionPress("forward")} onMouseUp={handleDirectionRelease} onMouseLeave={handleDirectionRelease}
                        onTouchStart={e => { e.preventDefault(); handleDirectionPress("forward"); }} onTouchEnd={handleDirectionRelease}
                        data-testid="btn-move-fwd">
                        <ArrowUp className="w-6 h-6" />
                      </Button>
                      <div className="flex gap-1.5">
                        <Button variant="secondary" size="lg"
                          className={`w-16 h-16 rounded-2xl shadow-sm transition-all duration-75 ${dpadActive("left")}`}
                          onMouseDown={() => handleDirectionPress("left")} onMouseUp={handleDirectionRelease} onMouseLeave={handleDirectionRelease}
                          onTouchStart={e => { e.preventDefault(); handleDirectionPress("left"); }} onTouchEnd={handleDirectionRelease}
                          data-testid="btn-move-left">
                          <ArrowLeft className="w-6 h-6" />
                        </Button>
                        <Button variant="destructive" size="lg"
                          className="w-16 h-16 rounded-2xl shadow-sm transition-all active:scale-95"
                          onClick={handleStop} data-testid="btn-move-stop">
                          <Square className="w-5 h-5 fill-current" />
                        </Button>
                        <Button variant="secondary" size="lg"
                          className={`w-16 h-16 rounded-2xl shadow-sm transition-all duration-75 ${dpadActive("right")}`}
                          onMouseDown={() => handleDirectionPress("right")} onMouseUp={handleDirectionRelease} onMouseLeave={handleDirectionRelease}
                          onTouchStart={e => { e.preventDefault(); handleDirectionPress("right"); }} onTouchEnd={handleDirectionRelease}
                          data-testid="btn-move-right">
                          <ArrowRight className="w-6 h-6" />
                        </Button>
                      </div>
                      <Button variant="secondary" size="lg"
                        className={`w-16 h-16 rounded-2xl shadow-sm transition-all duration-75 ${dpadActive("backward")}`}
                        onMouseDown={() => handleDirectionPress("backward")} onMouseUp={handleDirectionRelease} onMouseLeave={handleDirectionRelease}
                        onTouchStart={e => { e.preventDefault(); handleDirectionPress("backward"); }} onTouchEnd={handleDirectionRelease}
                        data-testid="btn-move-back">
                        <ArrowDown className="w-6 h-6" />
                      </Button>
                      <div className="h-5 mt-1">
                        <AnimatePresence>
                          {activeDirection && (
                            <motion.span key={activeDirection} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                              className="text-xs font-mono font-semibold text-primary uppercase tracking-widest" data-testid="text-active-direction">
                              ▶ {activeDirection}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: 5DOF Arm */}
                  <div className="flex flex-col gap-2.5 py-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">5DOF Arm Control</div>
                      <div className="flex items-center gap-2">
                        <div className="flex rounded-md overflow-hidden border border-border text-[10px] font-mono">
                          {([1, 5, 15] as const).map(s => (
                            <button key={s} onClick={() => setStepSize(s)}
                              className={`px-2 py-0.5 transition-colors ${stepSize === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                              data-testid={`btn-step-${s}`}>{s}°</button>
                          ))}
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={handleResetArm} data-testid="btn-arm-reset">
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      {ARM_PRESETS.map(p => (
                        <button key={p.name} onClick={() => applyPreset(p)}
                          className="text-[11px] py-1 px-1 rounded-md border border-border bg-background hover:bg-muted hover:border-primary/40 transition-all text-muted-foreground hover:text-foreground font-medium"
                          data-testid={`btn-preset-${p.name.toLowerCase()}`}>{p.name}</button>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      {JOINT_ORDER.map(key => {
                        const cfg = JOINT_CONFIG[key];
                        const value = joints[key];
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 w-20 shrink-0">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
                              <span className="text-[11px] font-medium text-muted-foreground truncate">{cfg.label}</span>
                            </div>
                            <button onClick={() => updateJoint(key, -stepSize)}
                              className="h-6 w-6 shrink-0 rounded border border-border flex items-center justify-center text-xs bg-background hover:bg-muted active:scale-90 transition-all"
                              data-testid={`btn-arm-${key}-dec`}>−</button>
                            <input type="range" min={0} max={180} value={value}
                              onChange={e => setJointAngle(key, Number(e.target.value))}
                              className="joint-slider flex-1"
                              style={{ accentColor: cfg.color }}
                              data-testid={`slider-arm-${key}`} />
                            <button onClick={() => updateJoint(key, stepSize)}
                              className="h-6 w-6 shrink-0 rounded border border-border flex items-center justify-center text-xs bg-background hover:bg-muted active:scale-90 transition-all"
                              data-testid={`btn-arm-${key}-inc`}>+</button>
                            {editingJoint === key ? (
                              <input type="number" min={0} max={180} value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => commitEdit(key)}
                                onKeyDown={e => { if (e.key === "Enter") commitEdit(key); if (e.key === "Escape") setEditingJoint(null); }}
                                className="w-12 text-right font-mono text-xs border border-primary rounded px-1 py-0.5 bg-background focus:outline-none"
                                autoFocus data-testid={`input-arm-${key}-direct`} />
                            ) : (
                              <button onClick={() => startEdit(key, value)}
                                className={`w-12 text-right text-xs font-mono font-semibold tabular-nums hover:underline cursor-text shrink-0 ${cfg.accentClass}`}
                                data-testid={`btn-arm-${key}-value`}>{value}°</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* ── AI DIRECTIVE ── */}
            {controlMode === "ai" && (
              <motion.div key="ai"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="p-4">
                <div className="max-w-4xl mx-auto flex flex-col gap-4 pt-2 w-full">
                  <div className="text-center">
                    <div className="text-sm font-semibold">Autonomous Directive</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Natural language commands in English or Bengali → Firebase <code className="font-mono text-[10px] bg-muted px-1 rounded">ares01/autonomous/action</code>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="w-[110px] shrink-0" data-testid="select-lang">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="bn">Bengali</SelectItem>
                      </SelectContent>
                    </Select>
                    <input ref={commandInputRef} type="text" inputMode="text" autoComplete="off"
                      placeholder={language === "bn" ? "নির্দেশ দিন… যেমন: সামনে যাও, বল তোলো" : "Give command… e.g., go forward, pick ball, scan area"}
                      value={command}
                      onChange={e => setCommand(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSendCommand()}
                      onClick={() => commandInputRef.current?.focus()}
                      className="cmd-input flex-1 h-10 rounded-lg border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      data-testid="input-ai-cmd" />
                    <Button onClick={handleSendCommand} data-testid="btn-ai-send"
                      className="h-10 px-4 active:scale-95 transition-transform shrink-0">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Quick command chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {["go forward", "turn left", "pick ball", "scan area", "stop", "arm home",
                      "সামনে যাও", "বামে যাও", "বল তোলো", "থামো"].map(chip => (
                      <button key={chip} onClick={() => setCommand(chip)}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-muted/50 hover:bg-muted hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all font-medium">
                        {chip}
                      </button>
                    ))}
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Command Log → <span className="font-mono normal-case">ares01/autonomous/action</span></div>
                    <div className="space-y-1.5">
                      <AnimatePresence initial={false}>
                        {history.map(cmd => (
                          <motion.div key={cmd.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="flex gap-2.5 items-start p-2.5 rounded-xl bg-muted/40 border border-border/50">
                            {cmd.status === "ok"
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                              : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-xs leading-snug">{cmd.text}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-mono font-semibold text-primary">{cmd.action}</span>
                                <span className="text-[10px] text-muted-foreground">{cmd.time}</span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── VOICE COMMAND ── */}
            {controlMode === "voice" && (
              <motion.div key="voice"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="h-full flex flex-col items-center justify-center gap-6 p-4 min-h-[280px]">

                <div className="flex items-end justify-center gap-1 h-10">
                  <AnimatePresence>
                    {isListening && [0.6, 1, 0.7, 1, 0.5, 0.9, 0.6, 1, 0.7].map((base, i) => (
                      <motion.span key={i} className="w-1.5 rounded-full bg-primary"
                        animate={{ scaleY: [base * 0.4, base, base * 0.5, base * 0.9, base * 0.3] }}
                        transition={{ repeat: Infinity, duration: 0.8 + i * 0.07, ease: "easeInOut" }}
                        style={{ height: 40, originY: 1, display: "inline-block" }} />
                    ))}
                  </AnimatePresence>
                </div>

                <div className="relative flex items-center justify-center">
                  <AnimatePresence>
                    {isListening && [1.4, 1.9, 2.5].map((scale, i) => (
                      <motion.div key={i} className="absolute rounded-full bg-primary/15" style={{ width: 120, height: 120 }}
                        animate={{ scale: [1, scale], opacity: [0.5, 0] }}
                        transition={{ repeat: Infinity, duration: 2, delay: i * 0.55, ease: "easeOut" }} />
                    ))}
                  </AnimatePresence>
                  <Button size="lg" variant={isListening ? "default" : "outline"}
                    className={`w-28 h-28 rounded-full relative z-10 transition-all duration-200 active:scale-95 shadow-lg ${isListening ? "bg-primary text-primary-foreground shadow-primary/25" : ""}`}
                    onClick={handleVoiceToggle} data-testid="btn-voice-toggle">
                    <Mic className={`w-9 h-9 ${isListening ? "animate-pulse" : ""}`} />
                  </Button>
                </div>

                <div className="text-center space-y-1">
                  {isListening ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="text-base font-semibold text-primary flex items-center justify-center gap-1">
                      Listening
                      <span className="flex gap-0.5">
                        {[0, 0.2, 0.4].map((delay, i) => (
                          <motion.span key={i} animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay }}>.</motion.span>
                        ))}
                      </span>
                    </motion.div>
                  ) : (
                    <p className="text-sm font-medium text-muted-foreground">Tap to start voice command</p>
                  )}
                  <p className="text-xs text-muted-foreground/60">
                    {language === "bn" ? "বাংলা বা ইংরেজিতে বলুন" : "Speak in English or Bengali"} — fires <code className="font-mono text-[10px] bg-muted px-1 rounded">ares01/autonomous/action</code>
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="w-[130px] h-7 text-xs" data-testid="select-voice-lang">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English (en-US)</SelectItem>
                        <SelectItem value="bn">Bengali (bn-BD)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* 4. MICRO-TELEMETRY BAR — listens to Firebase ares01/telemetry/* */}
        <div className="shrink-0 border-t bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-0 divide-x divide-border overflow-x-auto">

            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Ruler className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Dist</span>
              <span className="text-xs font-mono font-semibold">{distance}</span>
              <span className="text-[10px] text-muted-foreground">cm</span>
              <div className="w-10 ml-1">
                <Progress value={(distance / 250) * 100} className="h-1"
                  indicatorColor={distance < 30 ? "bg-red-500" : distance < 80 ? "bg-yellow-500" : "bg-green-500"} />
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Zap className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Solar</span>
              <span className="text-xs font-mono font-semibold">{solar.toFixed(1)}V</span>
              <div className="w-10 ml-1">
                <Progress value={Math.min(100, (solar / 5) * 100)} className="h-1" indicatorColor="bg-yellow-400" />
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Cpu className="w-3 h-3 text-primary shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">AI Vision</span>
              <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                YOLOv8
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">1.4M fr</span>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Thermometer className="w-3 h-3 text-orange-500 shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Motors</span>
              <span className={`text-xs font-mono font-semibold ${motorTemp > 60 ? "text-red-500" : motorTemp > 45 ? "text-orange-500" : "text-foreground"}`}>
                {motorTemp.toFixed(1)}°C
              </span>
              <div className="w-10 ml-1">
                <Progress value={(motorTemp / 80) * 100} className="h-1"
                  indicatorColor={motorTemp > 60 ? "bg-red-500" : motorTemp > 45 ? "bg-orange-500" : "bg-green-500"} />
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Radio className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">IMU</span>
              <span className="text-xs font-mono">R<span className="text-muted-foreground">:</span>{roll}°</span>
              <span className="text-xs font-mono">P<span className="text-muted-foreground">:</span>{pitch}°</span>
              <span className="text-xs font-mono">Y<span className="text-muted-foreground">:</span>{yaw}°</span>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0 ml-auto">
              <Signal className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-xs font-mono font-semibold">{rssi} dBm</span>
              <span className="text-[10px] text-muted-foreground mx-0.5">·</span>
              <span className="text-xs font-mono font-semibold">{fps} FPS</span>
              {fbStatus === "ready" && (
                <>
                  <span className="text-[10px] text-muted-foreground mx-0.5">·</span>
                  <Database className="w-2.5 h-2.5 text-indigo-500" />
                  <span className="text-[10px] text-indigo-500 font-medium">FB</span>
                </>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
