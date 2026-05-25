import React, { useState, useRef } from "react";
import {
  Sun,
  Moon,
  Settings,
  Signal,
  Battery,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Square,
  Mic,
  Send,
  CheckCircle2,
  Cpu,
  Thermometer,
  Zap,
  Radio,
  Ruler,
  Wifi,
  WifiOff,
  Globe,
  Loader2,
  Activity,
  Video,
  X,
  Plug,
  RotateCcw,
  Gamepad2,
  Bot
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useInterval } from "@/hooks/use-interval";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

type ConnectionStatus = "disconnected" | "connecting" | "connected";
type Direction = "forward" | "backward" | "left" | "right";
type ControlMode = "manual" | "ai" | "voice";

const CONTROL_TABS: { id: ControlMode; label: string; icon: React.ElementType }[] = [
  { id: "manual", label: "Manual Control",  icon: Gamepad2 },
  { id: "ai",     label: "AI Directive",    icon: Bot      },
  { id: "voice",  label: "Voice Command",   icon: Mic      },
];

const LOG_PREFIX = "[ARES-01]";

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

export default function Dashboard() {
  const { theme, setTheme } = useTheme();

  // ── Telemetry ──────────────────────────────────────────────────────────────
  const [fps, setFps] = useState(24);
  const [rssi, setRssi] = useState(-62);
  const [distance, setDistance] = useState(120);
  const [pitch, setPitch] = useState(2.4);
  const [roll, setRoll] = useState(-1.2);
  const [yaw, setYaw] = useState(45.1);

  useInterval(() => {
    setFps(Math.floor(22 + Math.random() * 6));
    setRssi(Math.floor(-65 + Math.random() * 8));
    setDistance(Math.floor(115 + Math.random() * 10));
    setPitch(Number((2.4 + (Math.random() * 0.4 - 0.2)).toFixed(1)));
    setRoll(Number((-1.2 + (Math.random() * 0.4 - 0.2)).toFixed(1)));
    setYaw(Number((45.1 + (Math.random() * 0.4 - 0.2)).toFixed(1)));
  }, 1000);

  // ── Control Mode ──────────────────────────────────────────────────────────
  const [controlMode, setControlMode] = useState<ControlMode>("manual");

  // ── D-Pad ──────────────────────────────────────────────────────────────────
  const [activeDirection, setActiveDirection] = useState<Direction | null>(null);

  const handleDirectionPress = (dir: Direction) => {
    setActiveDirection(dir);
    console.log(`${LOG_PREFIX} Rover Moving: ${dir.toUpperCase()}`);
  };

  const handleDirectionRelease = () => {
    if (activeDirection !== null) {
      setActiveDirection(null);
      console.log(`${LOG_PREFIX} Rover Action: STOP`);
    }
  };

  const handleStop = () => {
    setActiveDirection(null);
    console.log(`${LOG_PREFIX} Rover Action: STOP (manual)`);
  };

  const dpadActive = (dir: Direction) =>
    activeDirection === dir ? "scale-90 opacity-60 ring-2 ring-primary/40" : "";

  // ── 5DOF Arm ───────────────────────────────────────────────────────────────
  const DEFAULT_JOINTS = { base: 90, shoulder: 90, elbow: 90, wrist: 90, gripper: 0 };
  const [joints, setJoints] = useState({ base: 90, shoulder: 45, elbow: 120, wrist: 90, gripper: 0 });
  const resetAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateJoint = (joint: keyof typeof joints, delta: number) => {
    setJoints(prev => {
      const next = Math.max(0, Math.min(180, prev[joint] + delta));
      console.log(`${LOG_PREFIX} Arm Joint: ${joint} → ${next}°`);
      return { ...prev, [joint]: next };
    });
  };

  const setJointAngle = (joint: keyof typeof joints, raw: number) => {
    const next = Math.max(0, Math.min(180, raw));
    console.log(`${LOG_PREFIX} Arm Joint: ${joint} → ${next}° (drag)`);
    setJoints(prev => ({ ...prev, [joint]: next }));
  };

  const animateJointsTo = (target: typeof joints, label: string) => {
    if (resetAnimRef.current) clearInterval(resetAnimRef.current);
    console.log(`${LOG_PREFIX} Arm → ${label}`);
    const startValues = { ...joints };
    const steps = 24;
    let step = 0;
    resetAnimRef.current = setInterval(() => {
      step++;
      const t = 1 - Math.pow(1 - step / steps, 3);
      setJoints({
        base:     Math.round(startValues.base     + (target.base     - startValues.base)     * t),
        shoulder: Math.round(startValues.shoulder + (target.shoulder - startValues.shoulder) * t),
        elbow:    Math.round(startValues.elbow    + (target.elbow    - startValues.elbow)    * t),
        wrist:    Math.round(startValues.wrist    + (target.wrist    - startValues.wrist)    * t),
        gripper:  Math.round(startValues.gripper  + (target.gripper  - startValues.gripper)  * t),
      });
      if (step >= steps) { clearInterval(resetAnimRef.current!); resetAnimRef.current = null; }
    }, 16);
  };

  const handleResetArm = () => animateJointsTo(DEFAULT_JOINTS, "Home (reset)");
  const applyPreset = (preset: typeof ARM_PRESETS[0]) => animateJointsTo(preset.joints, `Preset: ${preset.name}`);

  const [stepSize, setStepSize] = useState<1 | 5 | 15>(5);
  const [editingJoint, setEditingJoint] = useState<keyof typeof joints | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (joint: keyof typeof joints, value: number) => { setEditingJoint(joint); setEditValue(String(value)); };
  const commitEdit = (joint: keyof typeof joints) => {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed)) setJointAngle(joint, parsed);
    setEditingJoint(null);
  };

  // ── AI Command ─────────────────────────────────────────────────────────────
  const [command, setCommand] = useState("");
  const [language, setLanguage] = useState("en");
  const [history, setHistory] = useState([
    { id: 1, text: "Move forward 2 meters and scan for obstacles", time: "10:42:15 AM" },
    { id: 2, text: "Rotate base 45 degrees left",                  time: "10:40:02 AM" },
    { id: 3, text: "Initialize YOLOv8 object detection",           time: "10:38:55 AM" },
  ]);

  const handleSendCommand = () => {
    if (!command.trim()) return;
    console.log(`${LOG_PREFIX} AI Command [${language === "en" ? "EN" : "BN"}]: "${command}"`);
    setHistory(prev => [{ id: Date.now(), text: command, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 5));
    setCommand("");
  };

  const commandInputRef = useRef<HTMLInputElement>(null);

  // ── Voice ──────────────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);

  const handleVoiceToggle = () => {
    const next = !isListening;
    setIsListening(next);
    console.log(`${LOG_PREFIX} Voice: ${next ? "STARTED" : "STOPPED"}`);
  };

  // ── Settings / Connection ──────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [connectionType, setConnectionType] = useState("websocket");
  const [ipAddress, setIpAddress] = useState("");
  const [port, setPort] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [ping, setPing] = useState<number | null>(null);

  useInterval(() => {
    if (connectionStatus === "connected") setPing(Math.floor(8 + Math.random() * 18));
  }, 1200);

  const handleConnect = () => {
    const addr = `${ipAddress || "<no-ip>"}:${port || "<no-port>"}`;
    console.log(`${LOG_PREFIX} Connecting via ${connectionType.toUpperCase()} → ${addr}`);
    setConnectionStatus("connecting");
    setTimeout(() => {
      setConnectionStatus("connected");
      setPing(12);
      console.log(`${LOG_PREFIX} Connected @ ${addr}`);
      if (streamUrl) console.log(`${LOG_PREFIX} Stream: ${streamUrl}`);
    }, 2000);
  };

  const handleDisconnect = () => {
    console.log(`${LOG_PREFIX} Disconnected`);
    setConnectionStatus("disconnected");
    setPing(null);
  };

  const statusConfig: Record<ConnectionStatus, { label: string; color: string; dot: string }> = {
    disconnected: { label: "Disconnected",         color: "text-muted-foreground border-border bg-muted/40",                        dot: "bg-muted-foreground"        },
    connecting:   { label: "Connecting...",         color: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10", dot: "bg-amber-500 animate-pulse" },
    connected:    { label: "Connected to ESP32-S3", color: "text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10", dot: "bg-green-500 animate-pulse" },
  };
  const currentStatus = statusConfig[connectionStatus];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-background text-foreground flex flex-col font-sans overflow-hidden">

      {/* ── Top Nav ── */}
      <header className="h-12 border-b bg-card/90 backdrop-blur-sm flex items-center justify-between px-5 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-base tracking-tight">ARES-01</h1>
          <span className="text-muted-foreground text-xs font-medium hidden sm:inline">Rover Mission Control</span>
          <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 text-[10px] h-5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1.5" />
            ACTIVE
          </Badge>
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

      {/* ── Settings Panel ── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            key="settings"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden border-b bg-card/60 backdrop-blur-sm z-10 shrink-0"
          >
            <div className="px-5 py-4 max-w-5xl mx-auto w-full">
              <div className="flex items-center gap-2 mb-3">
                <Plug className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold">Device Connection — ESP32-S3-WROOM CAM</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                  <Select value={connectionType} onValueChange={val => { setConnectionType(val); console.log(`${LOG_PREFIX} Connection: ${val}`); }}>
                    <SelectTrigger className="h-8 text-xs bg-background" data-testid="select-connection-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="websocket"><span className="flex items-center gap-1.5 text-xs"><Activity className="w-3 h-3 text-primary" />WebSocket</span></SelectItem>
                      <SelectItem value="http"><span className="flex items-center gap-1.5 text-xs"><Globe className="w-3 h-3" />HTTP / REST</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Rover Address</label>
                  <div className="flex gap-1.5">
                    <Input className="h-8 text-xs bg-background font-mono flex-1" placeholder="192.168.1.100" value={ipAddress} onChange={e => setIpAddress(e.target.value)} data-testid="input-ip-address" />
                    <Input className="h-8 text-xs bg-background font-mono w-14" placeholder="81" value={port} onChange={e => setPort(e.target.value)} data-testid="input-port" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Video className="w-3 h-3" />Stream URL</label>
                  <Input className="h-8 text-xs bg-background font-mono" placeholder="/stream or http://..." value={streamUrl} onChange={e => setStreamUrl(e.target.value)} data-testid="input-stream-url" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Control</label>
                  <div className="flex items-center gap-2">
                    {connectionStatus === "connected" ? (
                      <Button variant="outline" size="sm" className="h-8 text-xs border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10" onClick={handleDisconnect} data-testid="btn-disconnect">
                        <WifiOff className="w-3 h-3 mr-1" /> Disconnect
                      </Button>
                    ) : (
                      <Button size="sm" className="h-8 text-xs" onClick={handleConnect} disabled={connectionStatus === "connecting"} data-testid="btn-connect">
                        {connectionStatus === "connecting" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Wifi className="w-3 h-3 mr-1" />}
                        {connectionStatus === "connecting" ? "Connecting…" : "Connect"}
                      </Button>
                    )}
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${currentStatus.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dot}`} />
                      {currentStatus.label}
                    </span>
                    {ping !== null && connectionStatus === "connected" && (
                      <span className="text-[10px] font-mono text-muted-foreground" data-testid="text-ping">{ping}ms</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Vertical Stack ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* 1. PRIMARY CAMERA VIEW */}
        <div className="w-full shrink-0 relative bg-black" style={{ height: "clamp(160px, 40vh, 420px)" }}>
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
              backgroundSize: "24px 24px"
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white/15 font-mono text-xl tracking-widest select-none">FEED — ESP32-CAM</span>
          </div>

          {/* Top-left overlay */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur-md border border-white/10 rounded-md px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white text-[11px] font-medium">Connected</span>
            </div>
            <div className="bg-black/55 backdrop-blur-md border border-white/10 rounded-md px-2.5 py-1">
              <span className="text-white/80 font-mono text-[11px]">{fps} FPS</span>
            </div>
          </div>

          {/* Top-right overlay */}
          <div className="absolute top-3 right-3 flex items-center gap-2">
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
          <div className="relative flex rounded-xl bg-muted/50 border border-border/50 p-1 gap-0.5 max-w-xl mx-auto">
            {CONTROL_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setControlMode(tab.id)}
                className={`relative flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg z-10 transition-colors duration-150 select-none ${
                  controlMode === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-${tab.id}`}
              >
                {controlMode === tab.id && (
                  <motion.div
                    layoutId="tab-pill"
                    className="absolute inset-0 bg-background rounded-lg shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
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

            {/* ── MANUAL CONTROL: 2-Column Grid ── */}
            {controlMode === "manual" && (
              <motion.div
                key="manual"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="h-full p-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto h-full">

                  {/* LEFT: D-Pad */}
                  <div className="flex flex-col items-center justify-center gap-3 py-2">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Drive Controls</div>
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
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={handleResetArm} data-testid="btn-arm-reset">
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Presets */}
                    <div className="grid grid-cols-4 gap-1">
                      {ARM_PRESETS.map(preset => (
                        <button key={preset.name} onClick={() => applyPreset(preset)}
                          className="text-[11px] py-1 px-1 rounded-md border border-border bg-background hover:bg-muted hover:border-primary/40 transition-all text-muted-foreground hover:text-foreground font-medium"
                          data-testid={`btn-preset-${preset.name.toLowerCase()}`}>{preset.name}</button>
                      ))}
                    </div>

                    {/* Joint rows */}
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
                              className="joint-slider flex-1 h-1.5"
                              style={{ accentColor: cfg.color }}
                              data-testid={`slider-arm-${key}`}
                            />
                            <button onClick={() => updateJoint(key, stepSize)}
                              className="h-6 w-6 shrink-0 rounded border border-border flex items-center justify-center text-xs bg-background hover:bg-muted active:scale-90 transition-all"
                              data-testid={`btn-arm-${key}-inc`}>+</button>
                            {editingJoint === key ? (
                              <input type="number" min={0} max={180} value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => commitEdit(key)}
                                onKeyDown={e => { if (e.key === "Enter") commitEdit(key); if (e.key === "Escape") setEditingJoint(null); }}
                                className="w-12 text-right font-mono text-xs border border-primary rounded px-1 py-0.5 bg-background focus:outline-none"
                                autoFocus data-testid={`input-arm-${key}-direct`}
                              />
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
              <motion.div
                key="ai"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="h-full p-4"
              >
                <div className="max-w-2xl mx-auto flex flex-col gap-5 pt-2">
                  <div className="text-center">
                    <div className="text-sm font-semibold">Autonomous Directive</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Send natural language commands to the rover</div>
                  </div>

                  <div className="flex gap-2 items-stretch">
                    <Select value={language} onValueChange={val => { setLanguage(val); console.log(`${LOG_PREFIX} Language: ${val}`); }}>
                      <SelectTrigger className="w-[110px] shrink-0" data-testid="select-lang">
                        <SelectValue placeholder="Language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="bn">Bengali</SelectItem>
                      </SelectContent>
                    </Select>
                    <input
                      ref={commandInputRef}
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      placeholder="Tell the rover what to do…"
                      value={command}
                      onChange={e => setCommand(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSendCommand()}
                      onClick={() => commandInputRef.current?.focus()}
                      className="cmd-input flex-1 h-10 rounded-lg border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      data-testid="input-ai-cmd"
                    />
                    <Button onClick={handleSendCommand} data-testid="btn-ai-send" className="h-10 px-4 active:scale-95 transition-transform shrink-0">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Command History</div>
                    <div className="space-y-2">
                      <AnimatePresence initial={false}>
                        {history.map(cmd => (
                          <motion.div key={cmd.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="flex gap-2.5 items-start p-3 rounded-xl bg-muted/40 border border-border/50">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm leading-snug">{cmd.text}</span>
                              <span className="text-[10px] text-muted-foreground font-mono mt-0.5">{cmd.time}</span>
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
              <motion.div
                key="voice"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="h-full flex flex-col items-center justify-center gap-6 p-4"
              >
                {/* Waveform */}
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

                {/* Mic button with pulse rings */}
                <div className="relative flex items-center justify-center">
                  <AnimatePresence>
                    {isListening && [1.4, 1.9, 2.5].map((scale, i) => (
                      <motion.div key={i} className="absolute rounded-full bg-primary/15"
                        style={{ width: 120, height: 120 }}
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
                  <p className="text-xs text-muted-foreground/60">Speak clearly — rover listens in real time</p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* 4. MICRO-TELEMETRY BAR */}
        <div className="shrink-0 border-t bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-0 divide-x divide-border overflow-x-auto">

            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Ruler className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Dist</span>
              <span className="text-xs font-mono font-semibold">{distance}</span>
              <span className="text-[10px] text-muted-foreground">cm</span>
              <div className="w-10 ml-1">
                <Progress value={(distance / 250) * 100} className="h-1" indicatorColor={distance < 30 ? "bg-red-500" : distance < 80 ? "bg-yellow-500" : "bg-green-500"} />
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Zap className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Solar</span>
              <span className="text-xs font-mono font-semibold">4.2V</span>
              <div className="w-10 ml-1">
                <Progress value={78} className="h-1" indicatorColor="bg-yellow-400" />
              </div>
              <span className="text-[10px] text-muted-foreground">78%</span>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Cpu className="w-3 h-3 text-primary shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">AI Vision</span>
              <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                YOLOv8
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">1.4M frames</span>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Thermometer className="w-3 h-3 text-orange-500 shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Motors</span>
              <span className="text-xs font-mono font-semibold text-orange-500">42.5°C</span>
              <div className="w-10 ml-1">
                <Progress value={42.5} className="h-1" indicatorColor="bg-orange-500" />
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
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-xs font-mono font-semibold">{fps} FPS</span>
            </div>

          </div>
        </div>

      </div>{/* END main vertical stack */}
    </div>
  );
}
