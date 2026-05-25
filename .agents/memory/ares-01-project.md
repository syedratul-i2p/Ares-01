---
name: ARES-01 Project State
description: Key decisions and pending work for the ARES-01 rover mission control dashboard
---

# ARES-01 Rover Mission Control

## What's done
- React + Vite + TypeScript dashboard at `artifacts/ares-01`
- Full vertical-stack layout: MJPEG video (clamp 40vh) → tab bar → controls → telemetry bar
- Firebase Realtime Database fully wired (project: `ares-01-i2p`)
- `src/lib/firebase.ts` — init + setDriveDirection, setArmAngles, sendAutonomousCommand, subscribeTelemetry (3s heartbeat watchdog)
- `src/lib/commandParser.ts` — English + Bengali (transliterated) NLP → ParsedCommand
- Manual D-pad, 5DOF arm sliders + presets, AI Directive, Voice (bn-BD + en-US)
- Telemetry bar shows live Firebase data with simulated fallback

## Firebase schema
- `ares01/drive/direction` — DriveDirection string
- `ares01/arm/angles` — {base, shoulder, elbow, wrist, gripper}
- `ares01/autonomous/action` — {command, raw, language, timestamp}
- `ares01/telemetry/{distance,solar,motor_temp,rssi,heartbeat}`

## Pending (waiting for ESP32-S3 board delivery)
- ESP32 firmware (.ino): WiFi + Firebase-ESP-Client + PCA9685 PWM + OV2640 MJPEG + telemetry write
- User will upload via Arduino IDE — offer complete .ino when board arrives

## **Why:** Firebase web SDK config (apiKey, appId etc.) is different from Admin SDK service account JSON — user provided service account first; had to guide them to Firebase Console → Project Settings → Your Apps → Web app config.
