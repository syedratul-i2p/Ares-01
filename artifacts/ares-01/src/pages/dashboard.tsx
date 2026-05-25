import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Sun, Moon, Settings, Signal, Battery, ArrowUp, ArrowDown,
  ArrowLeft, ArrowRight, Square, Mic, Send, CheckCircle2, Cpu,
  Thermometer, Zap, Radio, Ruler, Wifi, WifiOff, Loader2,
  Activity, X, RotateCcw, Gamepad2, Bot, AlertTriangle, Database, Camera
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

const DEFAULT_JOINTS: ArmAngles = { base: 90, shoulder: 90, elbow: 90, wrist: 90, gripper: 0 };

// ─── Sub-Components (Memoized to prevent unnecessary re-renders) ───────────────

interface HeaderProps {
  roverOnline: boolean;
  fbStatus: "ready" | "not-configured";
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  theme: string;
  setTheme: (theme: any) => void;
}

const Header = React.memo(function Header({
  roverOnline,
  fbStatus,
  showSettings,
  setShowSettings,
  theme,
  setTheme
}: HeaderProps) {
  return (
    <header className="h-12 border-b bg-card/90 backdrop-blur-sm flex items-center justify-between px-5 shrink-0 z-20">
      <div className="flex items-center gap-3">
        <h1 className="font-bold text-base tracking-tight">ARES-01</h1>
        <span className="text-muted-foreground text-xs font-medium hidden sm:inline">Rover Mission Control</span>
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
  );
});

interface SettingsPanelProps {
  showSettings: boolean;
  fbStatus: "ready" | "not-configured";
  roverIp: string;
  setRoverIp: (val: string) => void;
  streamSrc: string | null;
  streamError: boolean;
  handleConnectCamera: () => void;
  handleDisconnectCamera: () => void;
  wsUrl: string;
  setWsUrl: (val: string) => void;
  roverConnectionStatus: RoverConnectionStatus;
  handleConnectWs: () => void;
  handleDisconnectWs: () => void;
  ping: number | null;
}

const SettingsPanel = React.memo(function SettingsPanel({
  showSettings,
  fbStatus,
  roverIp,
  setRoverIp,
  streamSrc,
  streamError,
  handleConnectCamera,
  handleDisconnectCamera,
  wsUrl,
  setWsUrl,
  roverConnectionStatus,
  handleConnectWs,
  handleDisconnectWs,
  ping
}: SettingsPanelProps) {
  return (
    <AnimatePresence>
      {showSettings && (
        <motion.div key="settings"
          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="overflow-hidden border-b bg-card/70 backdrop-blur-sm z-10 shrink-0">
          <div className="px-5 py-4 max-w-6xl mx-auto w-full space-y-4">
            {fbStatus === "not-configured" && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/8">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">Firebase Realtime Database not configured</p>
                  <p className="text-amber-600/80 dark:text-amber-400/80">
                    Add your Firebase project credentials to the Secrets config:<br />
                    <span className="font-mono">VITE_FIREBASE_API_KEY</span> ·{" "}
                    <span className="font-mono">VITE_FIREBASE_DATABASE_URL</span> ·{" "}
                    <span className="font-mono">VITE_FIREBASE_PROJECT_ID</span> ·{" "}
                    <span className="font-mono">VITE_FIREBASE_APP_ID</span>
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
  );
});

interface CameraViewProps {
  streamSrc: string | null;
  streamError: boolean;
  fps: number;
  rssi: number;
  setStreamError: React.Dispatch<React.SetStateAction<boolean>>;
}

const CameraView = React.memo(function CameraView({
  streamSrc,
  streamError,
  fps,
  rssi,
  setStreamError
}: CameraViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  return (
    <div
      className="w-full h-full relative bg-black overflow-hidden flex items-center justify-center"
      style={{
        transform: "translate3d(0, 0, 0)",
        willChange: "transform"
      }}
    >
      {streamSrc && !streamError ? (
        <img
          ref={imgRef}
          src={streamSrc}
          alt="ARES-01 live feed"
          className="w-full h-full object-contain"
          onError={() => { setStreamError(true); console.warn(`[ARES-01] Camera stream error at ${streamSrc}`); }}
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
  );
});

interface DPadProps {
  activeDirection: Direction | null;
  onPress: (dir: Direction) => void;
  onRelease: () => void;
  onStop: () => void;
}

const DPad = React.memo(function DPad({
  activeDirection,
  onPress,
  onRelease,
  onStop
}: DPadProps) {
  const dpadActive = (dir: Direction) =>
    activeDirection === dir ? "scale-90 opacity-60 ring-2 ring-primary/40" : "";

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-2">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Drive Controls</div>
      <div className="flex flex-col items-center gap-1.5 select-none">
        <Button variant="secondary" size="lg"
          className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl shadow-sm transition-all duration-75 ${dpadActive("forward")}`}
          onMouseDown={() => onPress("forward")} onMouseUp={onRelease} onMouseLeave={onRelease}
          onTouchStart={e => { e.preventDefault(); onPress("forward"); }} onTouchEnd={onRelease}
          data-testid="btn-move-fwd">
          <ArrowUp className="w-5 h-5 sm:w-6 sm:h-6" />
        </Button>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="lg"
            className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl shadow-sm transition-all duration-75 ${dpadActive("left")}`}
            onMouseDown={() => onPress("left")} onMouseUp={onRelease} onMouseLeave={onRelease}
            onTouchStart={e => { e.preventDefault(); onPress("left"); }} onTouchEnd={onRelease}
            data-testid="btn-move-left">
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
          <Button variant="destructive" size="lg"
            className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl shadow-sm transition-all active:scale-95"
            onClick={onStop} data-testid="btn-move-stop">
            <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
          </Button>
          <Button variant="secondary" size="lg"
            className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl shadow-sm transition-all duration-75 ${dpadActive("right")}`}
            onMouseDown={() => onPress("right")} onMouseUp={onRelease} onMouseLeave={onRelease}
            onTouchStart={e => { e.preventDefault(); onPress("right"); }} onTouchEnd={onRelease}
            data-testid="btn-move-right">
            <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
        </div>
        <Button variant="secondary" size="lg"
          className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl shadow-sm transition-all duration-75 ${dpadActive("backward")}`}
          onMouseDown={() => onPress("backward")} onMouseUp={onRelease} onMouseLeave={onRelease}
          onTouchStart={e => { e.preventDefault(); onPress("backward"); }} onTouchEnd={onRelease}
          data-testid="btn-move-back">
          <ArrowDown className="w-5 h-5 sm:w-6 sm:h-6" />
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
  );
});

interface ArmControlsProps {
  joints: ArmAngles;
  setJointAngle: (joint: keyof ArmAngles, raw: number) => void;
  updateJoint: (joint: keyof ArmAngles, delta: number) => void;
  stepSize: 1 | 5 | 15;
  setStepSize: React.Dispatch<React.SetStateAction<1 | 5 | 15>>;
  applyPreset: (p: typeof ARM_PRESETS[0]) => void;
  handleResetArm: () => void;
  editingJoint: keyof ArmAngles | null;
  setEditingJoint: React.Dispatch<React.SetStateAction<keyof ArmAngles | null>>;
  editValue: string;
  setEditValue: React.Dispatch<React.SetStateAction<string>>;
  commitEdit: (j: keyof ArmAngles) => void;
  startEdit: (j: keyof ArmAngles, v: number) => void;
}

const ArmControls = React.memo(function ArmControls({
  joints,
  setJointAngle,
  updateJoint,
  stepSize,
  setStepSize,
  applyPreset,
  handleResetArm,
  editingJoint,
  setEditingJoint,
  editValue,
  setEditValue,
  commitEdit,
  startEdit
}: ArmControlsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid background
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let x = 10; x < canvas.width; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 10; y < canvas.height; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Geometry parameters (scaled to fit nicely in 150x110)
    const x0 = canvas.width / 2; // base center x
    const y0 = canvas.height - 12; // base center y
    const L1 = 28; // Shoulder length
    const L2 = 24; // Elbow length
    const L3 = 16; // Wrist length

    // Convert angles (0 to 180) to radians
    const baseAngleRad = (joints.base) * Math.PI / 180;
    const shAngleRad = (joints.shoulder) * Math.PI / 180;
    
    // Elbow and wrist angles (relative calculation for 2D forward kinematics side view representation)
    const elAngleAbsRad = (joints.shoulder + joints.elbow - 90) * Math.PI / 180;
    const wrAngleAbsRad = (joints.shoulder + joints.elbow + joints.wrist - 180) * Math.PI / 180;

    // Joint coordinate calculations
    const x1 = x0 + L1 * Math.cos(shAngleRad);
    const y1 = y0 - L1 * Math.sin(shAngleRad);

    const x2 = x1 + L2 * Math.cos(elAngleAbsRad);
    const y2 = y1 - L2 * Math.sin(elAngleAbsRad);

    const x3 = x2 + L3 * Math.cos(wrAngleAbsRad);
    const y3 = y2 - L3 * Math.sin(wrAngleAbsRad);

    // Draw rotating base disk
    ctx.fillStyle = JOINT_CONFIG.base.color;
    ctx.beginPath();
    ctx.ellipse(x0, y0, 20 + 5 * Math.sin(baseAngleRad), 6, 0, 0, 2 * Math.PI);
    ctx.fill();

    // Pedestal stem
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y0 + 10);
    ctx.stroke();

    // Draw Links (bones)
    ctx.shadowBlur = 4;
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";

    // Link 1 (Shoulder)
    ctx.strokeStyle = JOINT_CONFIG.shoulder.color;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // Link 2 (Elbow)
    ctx.strokeStyle = JOINT_CONFIG.elbow.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Link 3 (Wrist)
    ctx.strokeStyle = JOINT_CONFIG.wrist.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Draw Gripper Claws
    const gripVal = joints.gripper;
    const clawSpread = (gripVal / 180) * 0.5 + 0.15; // claw angular spread in rad
    const clawLen = 8;
    
    // Left claw finger
    const lfAngle = wrAngleAbsRad - clawSpread;
    const xLf = x3 + clawLen * Math.cos(lfAngle);
    const yLf = y3 - clawLen * Math.sin(lfAngle);
    ctx.strokeStyle = JOINT_CONFIG.gripper.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x3, y3);
    ctx.lineTo(xLf, yLf);
    ctx.stroke();

    // Right claw finger
    const rfAngle = wrAngleAbsRad + clawSpread;
    const xRf = x3 + clawLen * Math.cos(rfAngle);
    const yRf = y3 - clawLen * Math.sin(rfAngle);
    ctx.beginPath();
    ctx.moveTo(x3, y3);
    ctx.lineTo(xRf, yRf);
    ctx.stroke();

    // Draw Joint Node dots
    const drawJointNode = (x: number, y: number, color: string, r: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };

    drawJointNode(x0, y0, JOINT_CONFIG.base.color, 4);
    drawJointNode(x1, y1, JOINT_CONFIG.shoulder.color, 4);
    drawJointNode(x2, y2, JOINT_CONFIG.elbow.color, 4);
    drawJointNode(x3, y3, JOINT_CONFIG.wrist.color, 3.5);

    // Text labels
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "8px monospace";
    ctx.fillText("2D PREVIEW (SIDE VIEW)", 8, 12);
  }, [joints]);

  return (
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

      <div className="flex flex-row gap-4 items-center bg-muted/20 border border-border/30 rounded-xl p-3.5 w-full">
        <div className="relative w-[150px] h-[110px] rounded-lg border border-border/40 bg-card overflow-hidden shrink-0 flex items-center justify-center">
          <canvas ref={canvasRef} width={150} height={110} className="w-full h-full block" />
        </div>

        <div className="flex-1 w-full space-y-3">
          {JOINT_ORDER.map(key => {
            const cfg = JOINT_CONFIG[key];
            const value = joints[key];
            return (
              <div key={key} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 w-20 shrink-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
                  <span className="text-xs md:text-sm font-semibold text-muted-foreground truncate">{cfg.label}</span>
                </div>
                <button onClick={() => updateJoint(key, -stepSize)}
                  className="h-6 w-6 shrink-0 rounded border border-border flex items-center justify-center text-xs bg-background hover:bg-muted active:scale-90 transition-all font-semibold"
                  data-testid={`btn-arm-${key}-dec`}>−</button>
                <input type="range" min={0} max={180} value={value}
                  onChange={e => setJointAngle(key, Number(e.target.value))}
                  className="joint-slider flex-1 h-2 cursor-pointer"
                  style={{ accentColor: cfg.color }}
                  data-testid={`slider-arm-${key}`} />
                <button onClick={() => updateJoint(key, stepSize)}
                  className="h-6 w-6 shrink-0 rounded border border-border flex items-center justify-center text-xs bg-background hover:bg-muted active:scale-90 transition-all font-semibold"
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
                    className={`w-12 text-right text-xs md:text-sm font-mono font-bold tabular-nums hover:underline cursor-text shrink-0 ${cfg.accentClass}`}
                    data-testid={`btn-arm-${key}-value`}>{value}°</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

interface TelemetryBarProps {
  distance: number;
  solar: number;
  motorTemp: number;
  rssi: number;
  fps: number;
  pitch: number;
  roll: number;
  yaw: number;
  fbStatus: "ready" | "not-configured";
}

const TelemetryBar = React.memo(function TelemetryBar({
  distance,
  solar,
  motorTemp,
  rssi,
  fps,
  pitch,
  roll,
  yaw,
  fbStatus
}: TelemetryBarProps) {
  return (
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
  );
});

// ─── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { theme, setTheme } = useTheme();

  // ── Simulated telemetry
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

  // ── Live telemetry from Firebase
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

  // ── Rover heartbeat / Firebase connection
  const [roverOnline, setRoverOnline] = useState(false);
  const [fbStatus] = useState<"ready" | "not-configured">(
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

  // ── Control Mode
  const [controlMode, setControlMode] = useState<ControlMode>("manual");

  // ── D-Pad
  const [activeDirection, setActiveDirection] = useState<Direction | null>(null);

  const handleDirectionPress = useCallback((dir: Direction) => {
    setActiveDirection(dir);
    const fbDir = dir.toUpperCase() as DriveDirection;
    console.log(`${LOG} Drive: ${fbDir}`);
    setDriveDirection(fbDir);
  }, []);

  const handleDirectionRelease = useCallback(() => {
    setActiveDirection(null);
    console.log(`${LOG} Drive: STOP`);
    setDriveDirection("STOP");
  }, []);

  const handleStop = useCallback(() => {
    setActiveDirection(null);
    console.log(`${LOG} Drive: STOP (manual)`);
    setDriveDirection("STOP");
  }, []);

  // ── 5DOF Arm
  const [joints, setJoints] = useState<ArmAngles>({ base: 90, shoulder: 45, elbow: 120, wrist: 90, gripper: 0 });
  const resetAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateJoint = useCallback((joint: keyof ArmAngles, delta: number) => {
    setJoints(prev => {
      const next = { ...prev, [joint]: Math.max(0, Math.min(180, prev[joint] + delta)) };
      console.log(`${LOG} Arm: ${joint} → ${next[joint]}°`);
      setArmAngles(next);
      return next;
    });
  }, []);

  const setJointAngle = useCallback((joint: keyof ArmAngles, raw: number) => {
    const val = Math.max(0, Math.min(180, raw));
    setJoints(prev => {
      const next = { ...prev, [joint]: val };
      setArmAngles(next);
      return next;
    });
  }, []);

  const animateJointsTo = useCallback((target: ArmAngles, label: string) => {
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
  }, [joints]);

  const handleResetArm = useCallback(() => animateJointsTo(DEFAULT_JOINTS, "Home (reset)"), [animateJointsTo]);
  const applyPreset = useCallback((p: typeof ARM_PRESETS[0]) => animateJointsTo(p.joints, `Preset: ${p.name}`), [animateJointsTo]);

  const [stepSize, setStepSize] = useState<1 | 5 | 15>(5);
  const [editingJoint, setEditingJoint] = useState<keyof ArmAngles | null>(null);
  const [editValue, setEditValue] = useState("");
  const startEdit = useCallback((j: keyof ArmAngles, v: number) => { setEditingJoint(j); setEditValue(String(v)); }, []);
  
  const commitEdit = useCallback((j: keyof ArmAngles) => {
    const p = parseInt(editValue, 10);
    if (!isNaN(p)) setJointAngle(j, p);
    setEditingJoint(null);
  }, [editValue, setJointAngle]);

  // ── AI Command
  const [command, setCommand] = useState("");
  const [language, setLanguage] = useState("en");
  const [history, setHistory] = useState<{ id: number; text: string; action: string; time: string; status: "ok" | "warn" }[]>([
    { id: 1, text: "Move forward 2 meters and scan for obstacles", action: "FORWARD → SCAN", time: "10:42:15 AM", status: "ok" },
    { id: 2, text: "Rotate base 45 degrees left",                  action: "ROTATE → LEFT",  time: "10:40:02 AM", status: "ok" },
    { id: 3, text: "Initialize YOLOv8 object detection",           action: "SCAN",            time: "10:38:55 AM", status: "ok" },
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

  // ── Voice
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any | null>(null);

  const handleVoiceToggle = useCallback(async () => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!isListening && SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = language === "bn" ? "bn-BD" : "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onresult = async (event: any) => {
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

  // ── Camera Stream
  const [roverIp, setRoverIp] = useState("");
  const [streamSrc, setStreamSrc] = useState<string | null>(null);
  const [streamError, setStreamError] = useState(false);

  const handleConnectCamera = useCallback(() => {
    if (!roverIp.trim()) return;
    const url = roverIp.startsWith("http") ? `${roverIp}/stream` : `http://${roverIp}/stream`;
    console.log(`${LOG} Connecting camera stream: ${url}`);
    setStreamError(false);
    setStreamSrc(url);
  }, [roverIp]);

  const handleDisconnectCamera = useCallback(() => {
    setStreamSrc(null);
    setStreamError(false);
    console.log(`${LOG} Camera stream disconnected`);
  }, []);

  // ── Settings Panel state
  const [showSettings, setShowSettings] = useState(false);
  const [roverConnectionStatus, setRoverConnectionStatus] = useState<RoverConnectionStatus>("disconnected");
  const [ping, setPing] = useState<number | null>(null);
  const [wsUrl, setWsUrl] = useState("");

  useInterval(() => {
    if (roverConnectionStatus === "connected") setPing(Math.floor(8 + Math.random() * 18));
  }, 1200);

  const handleConnectWs = useCallback(() => {
    console.log(`${LOG} Connecting WebSocket → ${wsUrl || "<no url>"}`);
    setRoverConnectionStatus("connecting");
    setTimeout(() => {
      setRoverConnectionStatus("connected");
      setPing(12);
      console.log(`${LOG} WebSocket connected`);
    }, 2000);
  }, [wsUrl]);

  const handleDisconnectWs = useCallback(() => {
    setRoverConnectionStatus("disconnected");
    setPing(null);
    console.log(`${LOG} WebSocket disconnected`);
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-dvh w-screen bg-background text-foreground flex flex-col font-sans overflow-hidden justify-between">

      {/* Header */}
      <Header
        roverOnline={roverOnline}
        fbStatus={fbStatus}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        theme={theme}
        setTheme={setTheme}
      />

      {/* Settings / Connection Panel */}
      <SettingsPanel
        showSettings={showSettings}
        fbStatus={fbStatus}
        roverIp={roverIp}
        setRoverIp={setRoverIp}
        streamSrc={streamSrc}
        streamError={streamError}
        handleConnectCamera={handleConnectCamera}
        handleDisconnectCamera={handleDisconnectCamera}
        wsUrl={wsUrl}
        setWsUrl={setWsUrl}
        roverConnectionStatus={roverConnectionStatus}
        handleConnectWs={handleConnectWs}
        handleDisconnectWs={handleDisconnectWs}
        ping={ping}
      />

      {/* Camera View Section (Top - Max 50% Viewport Height Budget) */}
      <div className="w-full bg-black/20 flex justify-center items-center shrink-0 border-b border-border/40">
        <div className="w-full max-w-none md:max-w-[calc(48dvh*16/9)] aspect-video max-h-[50vh] md:max-h-[48dvh] relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
          <CameraView
            streamSrc={streamSrc}
            streamError={streamError}
            fps={fps}
            rssi={rssi}
            setStreamError={setStreamError}
          />
        </div>
      </div>

      {/* Interactive Control Section (Middle - Max 40% Viewport Height Budget) */}
      <div className="flex-1 flex flex-col min-h-0 max-h-[40vh] md:max-h-[39dvh] overflow-hidden bg-background">
        
        {/* 2. MODE SELECTOR TABS */}
        <div className="shrink-0 px-4 pt-2.5 pb-1.5 bg-background z-10">
          <div className="relative flex rounded-xl bg-muted/50 border border-border/50 p-1 gap-0.5 max-w-xl mx-auto">
            {CONTROL_TABS.map(tab => (
              <button key={tab.id} onClick={() => setControlMode(tab.id)}
                className={`relative flex flex-1 items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg z-10 transition-colors duration-150 select-none ${
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
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <AnimatePresence mode="wait" initial={false}>

            {/* ── MANUAL CONTROL ── */}
            {controlMode === "manual" && (
              <motion.div key="manual"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="px-4 py-1 h-full overflow-hidden flex items-center justify-center">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-5xl w-full mx-auto items-center justify-items-center">
                  {/* LEFT: Drive D-Pad */}
                  <div className="flex items-center justify-center w-full">
                    <DPad
                      activeDirection={activeDirection}
                      onPress={handleDirectionPress}
                      onRelease={handleDirectionRelease}
                      onStop={handleStop}
                    />
                  </div>

                  {/* RIGHT: 5DOF Arm */}
                  <div className="flex items-center justify-center w-full">
                    <ArmControls
                      joints={joints}
                      setJointAngle={setJointAngle}
                      updateJoint={updateJoint}
                      stepSize={stepSize}
                      setStepSize={setStepSize}
                      applyPreset={applyPreset}
                      handleResetArm={handleResetArm}
                      editingJoint={editingJoint}
                      setEditingJoint={setEditingJoint}
                      editValue={editValue}
                      setEditValue={setEditValue}
                      commitEdit={commitEdit}
                      startEdit={startEdit}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── AI DIRECTIVE ── */}
            {controlMode === "ai" && (
              <motion.div key="ai"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="p-4 overflow-hidden h-full flex flex-col justify-center">
                <div className="max-w-2xl w-full mx-auto flex flex-col gap-2.5">
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
                      className="cmd-input flex-1 h-9 rounded-lg border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      data-testid="input-ai-cmd" />
                    <Button onClick={handleSendCommand} data-testid="btn-ai-send"
                      className="h-9 px-4 active:scale-95 transition-transform shrink-0">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1 justify-center">
                    {["go forward", "turn left", "pick ball", "scan area", "stop", "arm home",
                      "সামনে যাও", "বামে যাও", "বল তোলো", "থামো"].map(chip => (
                      <button key={chip} onClick={() => setCommand(chip)}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted/50 hover:bg-muted hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all font-medium">
                        {chip}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col min-h-0">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Command Log</div>
                    <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
                      <AnimatePresence initial={false}>
                        {history.map(cmd => (
                          <motion.div key={cmd.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="flex gap-2 items-start p-1.5 rounded-lg bg-muted/40 border border-border/50">
                            {cmd.status === "ok"
                              ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                              : <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />}
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-[11px] leading-snug">{cmd.text}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] font-mono font-semibold text-primary">{cmd.action}</span>
                                <span className="text-[9px] text-muted-foreground">{cmd.time}</span>
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
                className="h-full flex flex-col items-center justify-center gap-3 p-4 min-h-[180px] overflow-hidden">

                <div className="flex items-end justify-center gap-1 h-7">
                  <AnimatePresence>
                    {isListening && [0.6, 1, 0.7, 1, 0.5, 0.9, 0.6, 1, 0.7].map((base, i) => (
                      <motion.span key={i} className="w-1 rounded-full bg-primary"
                        animate={{ scaleY: [base * 0.4, base, base * 0.5, base * 0.9, base * 0.3] }}
                        transition={{ repeat: Infinity, duration: 0.8 + i * 0.07, ease: "easeInOut" }}
                        style={{ height: 24, originY: 1, display: "inline-block" }} />
                    ))}
                  </AnimatePresence>
                </div>

                <div className="relative flex items-center justify-center">
                  <AnimatePresence>
                    {isListening && [1.3, 1.6, 2.0].map((scale, i) => (
                      <motion.div key={i} className="absolute rounded-full bg-primary/15" style={{ width: 70, height: 70 }}
                        animate={{ scale: [1, scale], opacity: [0.5, 0] }}
                        transition={{ repeat: Infinity, duration: 2, delay: i * 0.55, ease: "easeOut" }} />
                    ))}
                  </AnimatePresence>
                  <Button size="lg" variant={isListening ? "default" : "outline"}
                    className={`w-18 h-18 rounded-full relative z-10 transition-all duration-200 active:scale-95 shadow-md ${isListening ? "bg-primary text-primary-foreground shadow-primary/25" : ""}`}
                    onClick={handleVoiceToggle} data-testid="btn-voice-toggle">
                    <Mic className={`w-6 h-6 ${isListening ? "animate-pulse" : ""}`} />
                  </Button>
                </div>

                <div className="text-center space-y-0.5">
                  {isListening ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="text-xs font-semibold text-primary flex items-center justify-center gap-1">
                      Listening
                      <span className="flex gap-0.5">
                        {[0, 0.2, 0.4].map((delay, i) => (
                          <motion.span key={i} animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay }}>.</motion.span>
                        ))}
                      </span>
                    </motion.div>
                  ) : (
                    <p className="text-xs font-medium text-muted-foreground">Tap to start voice command</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">
                    {language === "bn" ? "বাংলা বা ইংরেজিতে বলুন" : "Speak in English or Bengali"} — fires <code className="font-mono text-[9px] bg-muted px-1 rounded">ares01/autonomous/action</code>
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-0.5">
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="w-[110px] h-6 text-[10px]" data-testid="select-voice-lang">
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
      </div>

      {/* Telemetry Bar (Single Instance - Pinned Flat at Bottom) */}
      <div className="w-full shrink-0 mt-auto bg-card/80 border-t z-10 max-h-[8vh] md:max-h-[10vh]">
        <TelemetryBar
          distance={distance}
          solar={solar}
          motorTemp={motorTemp}
          rssi={rssi}
          fps={fps}
          pitch={pitch}
          roll={roll}
          yaw={yaw}
          fbStatus={fbStatus}
        />
      </div>
    </div>
  );
}
