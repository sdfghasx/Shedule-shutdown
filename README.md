# Schedule Shutdown v1.0

<p align="center">
  <img src="https://github.com/user-attachments/assets/b66f9bdc-9f64-40bf-925e-a9847fcc38b1" alt="Schedule Shutdown Preview" width="350">
</p>

A beautiful Windows desktop application to schedule shutdown, sleep, or screen lock with a timer. Built with Python and Eel, featuring a glassmorphism UI with a starry Midnight Purple theme.

## ✨ Features

- **Three modes**: Sleep, Shutdown, Lock Screen
- **Visual circular timer** with color-changing progress ring (blue → yellow → red)
- **Time presets**: 15, 30, 45, 60, 90 minutes — one click setup
- **±15 minute buttons** to quickly adjust running timer
- **Drag slider** to set any time from 1 to 480 minutes (8 hours)
- **Windows notifications** at 5 min and 1 min before action (optional)
- **Sound alert** 1 minute before action
- **System tray** — minimizes to tray when timer is active and window is closed
- **Multiple instances** — run several timers simultaneously
- **Starry Midnight Purple** glassmorphism design

 <img src="https://github.com/user-attachments/assets/05157199-867b-4f62-89dd-479fe7442b17" alt="Schedule Shutdown Preview" width="350">

## 🚀 Installation

### Option 1: Installer (Recommended)
Download the latest installer from [Releases](https://github.com/sdfghasx/Shedule-shutdown/releases) and run `ScheduleShutdownSetup.exe`.

### Option 2: Run from source
```bash
git clone https://github.com/sdfghasx/Shedule-shutdown.git
cd Shedule-shutdown
pip install -r requirements.txt
python main.py
