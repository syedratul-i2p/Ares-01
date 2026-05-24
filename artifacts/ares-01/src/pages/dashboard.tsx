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
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";

type ConnectionStatus = "disconnected" | "connecting" | "connected";
type Direction = "forward" | "backward" | "left" | "right";
type ControlMode = "manual" | "ai" | "voice";

const CONTROL_TABS: { id: ControlMode; label: string; icon: React.ElementType }[] = [
  { id: "manual", label: "Manual",       icon: Gamepad2 },
  { id: "ai",     label: "AI Directive", icon: Bot      },
  { id: "voice",  label: "Voice",        icon: Mic      },
];

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

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
    // TODO: send WebSocket / HTTP command → { action: "move", direction: dir }
  };

  const handleDirectionRelease = () => {
    if (activeDirection !== null) {
      setActiveDirection(null);
      console.log(`${LOG_PREFIX} Rover Action: STOP`);
      // TODO: send WebSocket / HTTP command → { action: "stop" }
    }
  };

  const handleStop = () => {
    setActiveDirection(null);
    console.log(`${LOG_PREFIX} Rover Action: STOP (manual)`);
    // TODO: send WebSocket / HTTP command → { action: "stop" }
  };

  const dpadActive = (dir: Direction) =>
    activeDirection === dir ? "scale-90 opacity-60 ring-2 ring-primary/40" : "";

  // ── 5DOF Arm ───────────────────────────────────────────────────────────────
  const DEFAULT_JOINTS = { base: 90, shoulder: 90, elbow: 90, wrist: 90, gripper: 0 };

  const [joints, setJoints] = useState({
    base: 90, shoulder: 45, elbow: 120, wrist: 90, gripper: 0
  });

  const resetAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateJoint = (joint: keyof typeof joints, delta: number) => {
    setJoints(prev => {
      const next = Math.max(0, Math.min(180, prev[joint] + delta));
      console.log(`${LOG_PREFIX} Arm Joint: ${joint} → ${next}° (${delta > 0 ? "+" : ""}${delta})`);
      // TODO: send WebSocket / HTTP command → { action: "arm", joint, angle: next }
      return { ...prev, [joint]: next };
    });
  };

  const setJointAngle = (joint: keyof typeof joints, raw: number) => {
    const next = Math.max(0, Math.min(180, raw));
    console.log(`${LOG_PREFIX} Arm Joint: ${joint} → ${next}° (drag)`);
    // TODO: send WebSocket / HTTP command → { action: "arm", joint, angle: next }
    setJoints(prev => ({ ...prev, [joint]: next }));
  };

  const animateJointsTo = (target: typeof joints, label: string) => {
    if (resetAnimRef.current) clearInterval(resetAnimRef.current);
    console.log(`${LOG_PREFIX} Arm → ${label}`);
    // TODO: send WebSocket / HTTP command → { action: "arm_pose", target }
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

  const startEdit = (joint: keyof typeof joints, value: number) => {
    setEditingJoint(joint);
    setEditValue(String(value));
  };

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
    { id: 2, text: "Rotate base 45 degrees left", time: "10:40:02 AM" },
    { id: 3, text: "Initialize YOLOv8 object detection", time: "10:38:55 AM" }
  ]);

  const handleLanguageChange = (val: string) => {
    setLanguage(val);
    console.log(`${LOG_PREFIX} AI Language set to: ${val === "en" ? "English" : "Bengali"}`);
  };

  const handleSendCommand = () => {
    if (!command.trim()) return;
    console.log(`${LOG_PREFIX} AI Command Sent [${language === "en" ? "English" : "Bengali"}]: "${command}"`);
    // TODO: POST to AI endpoint → { command, language }
    setHistory(prev => [{ id: Date.now(), text: command, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 5));
    setCommand("");
  };

  const commandInputRef = useRef<HTMLInputElement>(null);

  // ── Voice ──────────────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);

  const handleVoiceToggle = () => {
    const next = !isListening;
    setIsListening(next);
    console.log(`${LOG_PREFIX} Voice Recognition: ${next ? "STARTED — waiting for command" : "STOPPED"}`);
    // TODO: start / stop Web Speech API or stream audio to backend
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
      console.log(`${LOG_PREFIX} Connected to ESP32-S3 via ${connectionType.toUpperCase()} @ ${addr}`);
      if (streamUrl) console.log(`${LOG_PREFIX} Video stream: ${streamUrl}`);
    }, 2000);
  };

  const handleDisconnect = () => {
    console.log(`${LOG_PREFIX} Disconnected from Rover`);
    setConnectionStatus("disconnected");
    setPing(null);
  };

  const statusConfig: Record<ConnectionStatus, { label: string; color: string; dot: string }> = {
    disconnected: { label: "Disconnected",         color: "text-muted-foreground border-border bg-muted/40",                             dot: "bg-muted-foreground"          },
    connecting:   { label: "Connecting...",         color: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10",      dot: "bg-amber-500 animate-pulse"   },
    connected:    { label: "Connected to ESP32-S3", color: "text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10",      dot: "bg-green-500 animate-pulse"   },
  };
  const currentStatus = statusConfig[connectionStatus];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">

      {/* Top Nav */}
      <header className="h-14 border-b bg-card flex items-center justify-between px-6 shrink-0 z-10 relative">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg tracking-tight">ARES-01</h1>
          <span className="text-muted-foreground text-sm font-medium">Rover Mission Control</span>
          <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 ml-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-2" />
            MISSION ACTIVE
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showSettings ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setShowSettings(s => !s)}
            data-testid="button-settings"
          >
            {showSettings ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            data-testid="button-theme-toggle"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* Settings / Connection Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            key="settings-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-b bg-card/50 backdrop-blur-sm z-10"
          >
            <div className="max-w-[1800px] mx-auto w-full px-6 py-5">
              <div className="flex items-center gap-2 mb-4">
                <Plug className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold">Device Connection</h2>
                <span className="text-xs text-muted-foreground">— ESP32-S3-WROOM CAM</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connection Type</label>
                  <Select value={connectionType} onValueChange={val => { setConnectionType(val); console.log(`${LOG_PREFIX} Connection type: ${val.toUpperCase()}`); }}>
                    <SelectTrigger data-testid="select-connection-type" className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="websocket">
                        <span className="flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-primary" /> WebSocket (Recommended)</span>
                      </SelectItem>
                      <SelectItem value="http">
                        <span className="flex items-center gap-2"><Globe className="w-3.5 h-3.5" /> HTTP / REST API</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rover Address</label>
                  <div className="flex gap-2">
                    <Input className="bg-background font-mono text-sm flex-1" placeholder="e.g., 192.168.1.100" value={ipAddress} onChange={e => setIpAddress(e.target.value)} data-testid="input-ip-address" />
                    <Input className="bg-background font-mono text-sm w-20 shrink-0" placeholder="81" value={port} onChange={e => setPort(e.target.value)} data-testid="input-port" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Video className="w-3 h-3" /> Video Stream Endpoint
                  </label>
                  <Input className="bg-background font-mono text-sm" placeholder="e.g., /stream or http://192.168.1.100:80/stream" value={streamUrl} onChange={e => setStreamUrl(e.target.value)} data-testid="input-stream-url" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connection Control</label>
                  <div className="flex items-center gap-2">
                    {connectionStatus === "connected" ? (
                      <Button variant="outline" className="shrink-0 border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10" onClick={handleDisconnect} data-testid="btn-disconnect">
                        <WifiOff className="w-4 h-4 mr-2" /> Disconnect
                      </Button>
                    ) : (
                      <Button className="shrink-0" onClick={handleConnect} disabled={connectionStatus === "connecting"} data-testid="btn-connect">
                        {connectionStatus === "connecting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wifi className="w-4 h-4 mr-2" />}
                        {connectionStatus === "connecting" ? "Connecting" : "Connect to Rover"}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border ${currentStatus.color} transition-all duration-300`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dot}`} />
                      {currentStatus.label}
                    </span>
                    {ping !== null && connectionStatus === "connected" && (
                      <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground bg-muted/60 px-2 py-1 rounded-md border" data-testid="text-ping">
                        <Activity className="w-3 h-3 text-green-500" /> Ping: {ping}ms
                      </motion.span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Layout: Split Screen ── */}
      <main className="flex-1 p-4 lg:p-5 flex flex-col gap-0 max-w-[1800px] mx-auto w-full min-h-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">

          {/* ── LEFT: Video + Telemetry ── */}
          <div className="flex flex-col gap-4 flex-1 min-w-0 min-h-0">

            {/* Video Feed */}
            <section className="relative rounded-xl overflow-hidden bg-black border shadow-sm flex items-center justify-center aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0">
              <div
                className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
                style={{
                  backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                  backgroundSize: "20px 20px"
                }}
              />
              <div className="text-muted-foreground/30 font-mono text-2xl tracking-widest pointer-events-none select-none">
                FEED — ESP32-CAM
              </div>
              <div className="absolute top-4 left-4 flex gap-2">
                <Badge variant="secondary" className="bg-black/50 text-white backdrop-blur-md border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-2" />
                  Connected
                </Badge>
                <Badge variant="secondary" className="bg-black/50 text-white backdrop-blur-md border-white/10 font-mono">
                  {fps} FPS
                </Badge>
              </div>
              <div className="absolute top-4 right-4 flex gap-2">
                <Badge variant="secondary" className="bg-black/50 text-white backdrop-blur-md border-white/10 font-mono flex items-center gap-1.5">
                  <Signal className="w-3 h-3" /> {rssi} dBm
                </Badge>
                <Badge variant="secondary" className="bg-black/50 text-white backdrop-blur-md border-white/10 font-mono flex items-center gap-1.5">
                  <Battery className="w-3 h-3" /> 87% — 3654mAh
                </Badge>
              </div>
            </section>

            {/* Telemetry Strip */}
            <section className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
              <Card>
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <Ruler className="w-3 h-3" /> Distance
                  </div>
                  <div className="text-2xl font-mono">{distance} <span className="text-sm text-muted-foreground">cm</span></div>
                  <Progress value={(distance / 250) * 100} className="h-1" indicatorColor={distance < 30 ? "bg-red-500" : distance < 80 ? "bg-yellow-500" : "bg-green-500"} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <Zap className="w-3 h-3" /> Solar Array
                  </div>
                  <div className="text-2xl font-mono">4.2 <span className="text-sm text-muted-foreground">V</span></div>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Progress value={78} className="h-1 flex-1" /> 78%
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <Cpu className="w-3 h-3" /> AI Vision
                  </div>
                  <div className="text-sm font-medium flex items-center gap-2 mt-1">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> YOLOv8 Active
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-auto">Frames: 1.4M</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <Thermometer className="w-3 h-3" /> Motors
                  </div>
                  <div className="text-2xl font-mono">42.5 <span className="text-sm text-muted-foreground">°C</span></div>
                  <Progress value={42.5} className="h-1" indicatorColor="bg-orange-500" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <Radio className="w-3 h-3" /> IMU
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono mt-1">
                    <span className="text-muted-foreground">R:</span> <span>{roll}°</span>
                    <span className="text-muted-foreground">P:</span> <span>{pitch}°</span>
                    <span className="text-muted-foreground">Y:</span> <span>{yaw}°</span>
                  </div>
                </CardContent>
              </Card>
            </section>

          </div>{/* END LEFT */}

          {/* ── RIGHT: Unified Control Panel ── */}
          <div className="flex flex-col lg:w-[370px] xl:w-[410px] shrink-0 min-h-0">
            <Card className="flex flex-col flex-1 overflow-hidden">

              {/* Tab Switcher */}
              <div className="shrink-0 p-3 pb-0">
                <div className="relative flex rounded-lg bg-muted/50 p-1 gap-0.5">
                  {CONTROL_TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setControlMode(tab.id)}
                      className={`relative flex flex-1 items-center justify-center gap-1.5 py-2.5 px-1 text-xs font-semibold rounded-md z-10 transition-colors duration-150 select-none ${
                        controlMode === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid={`tab-${tab.id}`}
                    >
                      {controlMode === tab.id && (
                        <motion.div
                          layoutId="ctrl-tab-pill"
                          className="absolute inset-0 bg-background rounded-md shadow-sm"
                          transition={{ type: "spring", stiffness: 500, damping: 38 }}
                        />
                      )}
                      <tab.icon className="w-3.5 h-3.5 relative z-10 shrink-0" />
                      <span className="relative z-10 whitespace-nowrap">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Panel Content */}
              <CardContent className="flex-1 overflow-y-auto p-4 min-h-0">
                <AnimatePresence mode="wait" initial={false}>

                  {/* ── Manual Control ── */}
                  {controlMode === "manual" && (
                    <motion.div
                      key="manual"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="space-y-5"
                    >
                      {/* D-Pad */}
                      <div className="flex flex-col items-center gap-2 select-none pt-1">
                        <Button
                          variant="secondary" size="lg"
                          className={`w-16 h-16 transition-all duration-75 ${dpadActive("forward")}`}
                          onMouseDown={() => handleDirectionPress("forward")}
                          onMouseUp={handleDirectionRelease}
                          onMouseLeave={handleDirectionRelease}
                          onTouchStart={e => { e.preventDefault(); handleDirectionPress("forward"); }}
                          onTouchEnd={handleDirectionRelease}
                          data-testid="btn-move-fwd"
                        >
                          <ArrowUp className="w-6 h-6" />
                        </Button>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary" size="lg"
                            className={`w-16 h-16 transition-all duration-75 ${dpadActive("left")}`}
                            onMouseDown={() => handleDirectionPress("left")}
                            onMouseUp={handleDirectionRelease}
                            onMouseLeave={handleDirectionRelease}
                            onTouchStart={e => { e.preventDefault(); handleDirectionPress("left"); }}
                            onTouchEnd={handleDirectionRelease}
                            data-testid="btn-move-left"
                          >
                            <ArrowLeft className="w-6 h-6" />
                          </Button>
                          <Button
                            variant="destructive" size="lg"
                            className="w-16 h-16 transition-all duration-75 active:scale-95"
                            onClick={handleStop}
                            data-testid="btn-move-stop"
                          >
                            <Square className="w-5 h-5 fill-current" />
                          </Button>
                          <Button
                            variant="secondary" size="lg"
                            className={`w-16 h-16 transition-all duration-75 ${dpadActive("right")}`}
                            onMouseDown={() => handleDirectionPress("right")}
                            onMouseUp={handleDirectionRelease}
                            onMouseLeave={handleDirectionRelease}
                            onTouchStart={e => { e.preventDefault(); handleDirectionPress("right"); }}
                            onTouchEnd={handleDirectionRelease}
                            data-testid="btn-move-right"
                          >
                            <ArrowRight className="w-6 h-6" />
                          </Button>
                        </div>
                        <Button
                          variant="secondary" size="lg"
                          className={`w-16 h-16 transition-all duration-75 ${dpadActive("backward")}`}
                          onMouseDown={() => handleDirectionPress("backward")}
                          onMouseUp={handleDirectionRelease}
                          onMouseLeave={handleDirectionRelease}
                          onTouchStart={e => { e.preventDefault(); handleDirectionPress("backward"); }}
                          onTouchEnd={handleDirectionRelease}
                          data-testid="btn-move-back"
                        >
                          <ArrowDown className="w-6 h-6" />
                        </Button>
                        <div className="h-5 mt-1">
                          <AnimatePresence>
                            {activeDirection && (
                              <motion.span
                                key={activeDirection}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="text-xs font-mono font-semibold text-primary uppercase tracking-widest"
                                data-testid="text-active-direction"
                              >
                                ▶ {activeDirection}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      <div className="h-px bg-border" />

                      {/* 5DOF Arm */}
                      <div className="space-y-3">
                        {/* Header + step toggle */}
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">5DOF Arm Control</h4>
                          <div className="flex rounded-md overflow-hidden border border-border text-[10px] font-mono">
                            {([1, 5, 15] as const).map(s => (
                              <button
                                key={s}
                                onClick={() => setStepSize(s)}
                                className={`px-2 py-0.5 transition-colors ${stepSize === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                                data-testid={`btn-step-${s}`}
                              >
                                {s}°
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* SVG arm diagram + base rotation */}
                        {(() => {
                          const PI = Math.PI;
                          const seg = 22;
                          const bp = { x: 18, y: 82 };
                          const vec = (a: number, l: number) => ({ dx: Math.cos(a * PI / 180) * l, dy: -Math.sin(a * PI / 180) * l });

                          const sA = 20 + (joints.shoulder / 180) * 140;
                          const sv = vec(sA, seg);
                          const sp = { x: bp.x + sv.dx, y: bp.y + sv.dy };

                          const eA = sA + ((joints.elbow - 90) / 90) * 65;
                          const ev = vec(eA, seg);
                          const ep = { x: sp.x + ev.dx, y: sp.y + ev.dy };

                          const wA = eA + ((joints.wrist - 90) / 90) * 55;
                          const wv = vec(wA, seg);
                          const wp = { x: ep.x + wv.dx, y: ep.y + wv.dy };

                          const gSpread = (joints.gripper / 180) * 28;
                          const stemV = vec(wA, 7);
                          const se = { x: wp.x + stemV.dx, y: wp.y + stemV.dy };
                          const g1 = { x: se.x + vec(wA + gSpread, 9).dx, y: se.y + vec(wA + gSpread, 9).dy };
                          const g2 = { x: se.x + vec(wA - gSpread, 9).dx, y: se.y + vec(wA - gSpread, 9).dy };

                          const bAngle = (joints.base - 90) * PI / 180;

                          return (
                            <div className="bg-muted/30 rounded-lg p-2 flex items-center gap-3">
                              <svg width="110" height="96" viewBox="0 0 110 96" className="shrink-0">
                                <line x1="8" y1="88" x2="50" y2="88" stroke="currentColor" strokeWidth="1" opacity="0.15" />
                                <rect x="12" y="82" width="12" height="6" rx="2" fill="currentColor" opacity="0.2" />
                                <line x1={bp.x} y1={bp.y} x2={sp.x} y2={sp.y} stroke={JOINT_CONFIG.shoulder.color} strokeWidth="2.5" strokeLinecap="round" />
                                <line x1={sp.x} y1={sp.y} x2={ep.x} y2={ep.y} stroke={JOINT_CONFIG.elbow.color} strokeWidth="2.5" strokeLinecap="round" />
                                <line x1={ep.x} y1={ep.y} x2={wp.x} y2={wp.y} stroke={JOINT_CONFIG.wrist.color} strokeWidth="2.5" strokeLinecap="round" />
                                <line x1={wp.x} y1={wp.y} x2={se.x} y2={se.y} stroke={JOINT_CONFIG.gripper.color} strokeWidth="2" strokeLinecap="round" />
                                <line x1={se.x} y1={se.y} x2={g1.x} y2={g1.y} stroke={JOINT_CONFIG.gripper.color} strokeWidth="2" strokeLinecap="round" />
                                <line x1={se.x} y1={se.y} x2={g2.x} y2={g2.y} stroke={JOINT_CONFIG.gripper.color} strokeWidth="2" strokeLinecap="round" />
                                <circle cx={bp.x} cy={bp.y} r="4"   fill={JOINT_CONFIG.shoulder.color} />
                                <circle cx={sp.x} cy={sp.y} r="3.5" fill={JOINT_CONFIG.elbow.color} />
                                <circle cx={ep.x} cy={ep.y} r="3.5" fill={JOINT_CONFIG.wrist.color} />
                                <circle cx={wp.x} cy={wp.y} r="3"   fill={JOINT_CONFIG.gripper.color} />
                              </svg>
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Base</span>
                                <svg width="44" height="44" viewBox="-22 -22 44 44">
                                  <circle r="18" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.2" />
                                  <circle r="18" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" opacity="0.15" />
                                  <line x1="0" y1="0" x2={Math.cos(bAngle) * 15} y2={Math.sin(bAngle) * 15}
                                    stroke={JOINT_CONFIG.base.color} strokeWidth="2.5" strokeLinecap="round" />
                                  <circle r="3" fill={JOINT_CONFIG.base.color} />
                                </svg>
                                <span className="text-[10px] font-mono font-bold" style={{ color: JOINT_CONFIG.base.color }}>{joints.base}°</span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Presets */}
                        <div className="grid grid-cols-4 gap-1">
                          {ARM_PRESETS.map(preset => (
                            <button
                              key={preset.name}
                              onClick={() => applyPreset(preset)}
                              className="text-[11px] py-1 px-1.5 rounded border border-border bg-background hover:bg-muted hover:text-foreground transition-colors text-muted-foreground font-medium"
                              data-testid={`btn-preset-${preset.name.toLowerCase()}`}
                            >
                              {preset.name}
                            </button>
                          ))}
                        </div>

                        {/* Joint rows */}
                        {JOINT_ORDER.map(key => {
                          const cfg = JOINT_CONFIG[key];
                          const value = joints[key];
                          return (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="flex items-center gap-1.5 text-xs font-medium">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
                                  {cfg.label}
                                </span>
                                {editingJoint === key ? (
                                  <input
                                    type="number" min={0} max={180} value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onBlur={() => commitEdit(key)}
                                    onKeyDown={e => { if (e.key === "Enter") commitEdit(key); if (e.key === "Escape") setEditingJoint(null); }}
                                    className="w-14 text-right font-mono text-xs border border-border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:border-primary"
                                    autoFocus
                                    data-testid={`input-arm-${key}-direct`}
                                  />
                                ) : (
                                  <button
                                    onClick={() => startEdit(key, value)}
                                    title="Click to type exact angle"
                                    className={`text-xs font-mono font-semibold tabular-nums hover:underline cursor-text ${cfg.accentClass}`}
                                    data-testid={`btn-arm-${key}-value`}
                                  >
                                    {value}°
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => updateJoint(key, -stepSize)}
                                  className="h-6 w-6 shrink-0 rounded border border-border flex items-center justify-center text-xs bg-background hover:bg-muted active:scale-90 transition-all text-muted-foreground"
                                  data-testid={`btn-arm-${key}-dec`}
                                >−</button>
                                <input
                                  type="range" min={0} max={180} value={value}
                                  onChange={e => setJointAngle(key, Number(e.target.value))}
                                  className="joint-slider flex-1"
                                  style={{ accentColor: cfg.color }}
                                  data-testid={`slider-arm-${key}`}
                                />
                                <button
                                  onClick={() => updateJoint(key, stepSize)}
                                  className="h-6 w-6 shrink-0 rounded border border-border flex items-center justify-center text-xs bg-background hover:bg-muted active:scale-90 transition-all text-muted-foreground"
                                  data-testid={`btn-arm-${key}-inc`}
                                >+</button>
                              </div>
                            </div>
                          );
                        })}

                        {/* Reset */}
                        <Button
                          variant="outline" size="sm"
                          className="w-full mt-1 text-xs gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={handleResetArm}
                          data-testid="btn-arm-reset"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset Arm to Home
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* ── AI Directive ── */}
                  {controlMode === "ai" && (
                    <motion.div
                      key="ai"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="flex flex-col gap-5 h-full"
                    >
                      <div className="flex items-center gap-3">
                        <Select value={language} onValueChange={handleLanguageChange}>
                          <SelectTrigger className="w-[130px]" data-testid="select-lang">
                            <SelectValue placeholder="Language" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="bn">Bengali</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground ml-auto">Natural language control</span>
                      </div>

                      <div className="flex gap-2">
                        <input
                          ref={commandInputRef}
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          placeholder="Tell the rover what to do..."
                          value={command}
                          onChange={e => setCommand(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleSendCommand()}
                          onClick={() => commandInputRef.current?.focus()}
                          className="cmd-input flex-1 h-11 rounded-lg border border-input bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                          data-testid="input-ai-cmd"
                        />
                        <Button onClick={handleSendCommand} data-testid="btn-ai-send" className="h-11 px-4 active:scale-95 transition-transform">
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="flex-1">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Command Log</h4>
                        <div className="space-y-2">
                          <AnimatePresence initial={false}>
                            {history.map(cmd => (
                              <motion.div
                                key={cmd.id}
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="flex gap-3 text-sm p-3 rounded-lg bg-muted/40 border border-border/50"
                              >
                                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                <div className="flex flex-col min-w-0">
                                  <span className="text-foreground leading-snug">{cmd.text}</span>
                                  <span className="text-xs text-muted-foreground font-mono mt-1">{cmd.time}</span>
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* ── Voice Command ── */}
                  {controlMode === "voice" && (
                    <motion.div
                      key="voice"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="flex flex-col items-center justify-center min-h-[420px] gap-8"
                    >
                      {/* Waveform */}
                      <div className="flex items-end justify-center gap-1 h-14">
                        <AnimatePresence>
                          {isListening && [0.6, 1, 0.7, 1, 0.5, 0.9, 0.6, 1, 0.7].map((base, i) => (
                            <motion.span
                              key={i}
                              className="w-1.5 rounded-full bg-primary"
                              animate={{ scaleY: [base * 0.4, base, base * 0.5, base * 0.9, base * 0.3] }}
                              transition={{ repeat: Infinity, duration: 0.8 + i * 0.07, ease: "easeInOut" }}
                              style={{ height: 44, originY: 1, display: "inline-block" }}
                            />
                          ))}
                        </AnimatePresence>
                      </div>

                      {/* Pulse rings + mic */}
                      <div className="relative flex items-center justify-center">
                        <AnimatePresence>
                          {isListening && [1.5, 2.0, 2.6].map((scale, i) => (
                            <motion.div
                              key={i}
                              className="absolute rounded-full bg-primary/15"
                              style={{ width: 128, height: 128 }}
                              animate={{ scale: [1, scale], opacity: [0.5, 0] }}
                              transition={{ repeat: Infinity, duration: 2, delay: i * 0.55, ease: "easeOut" }}
                            />
                          ))}
                        </AnimatePresence>
                        <Button
                          size="lg"
                          variant={isListening ? "default" : "outline"}
                          className={`w-32 h-32 rounded-full relative z-10 transition-all duration-200 active:scale-95 shadow-lg ${
                            isListening ? "bg-primary text-primary-foreground shadow-primary/25" : ""
                          }`}
                          onClick={handleVoiceToggle}
                          data-testid="btn-voice-toggle"
                        >
                          <Mic className={`w-10 h-10 ${isListening ? "animate-pulse" : ""}`} />
                        </Button>
                      </div>

                      {/* Status */}
                      <div className="text-center space-y-1.5">
                        {isListening ? (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-base font-semibold text-primary flex items-center justify-center gap-1.5"
                          >
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
                        <p className="text-xs text-muted-foreground/60">Speak clearly to control the rover</p>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </CardContent>

            </Card>
          </div>{/* END RIGHT */}

        </div>
      </main>

    </div>
  );
}
