YOUSIF MOHANNAD — PERSONAL PORTFOLIO

A static portfolio with a real, interactive WebGL sculpture and progressive enhancements.
No package installation or build step is required.

FILES
- index.html — original profile content, navigation, and native skill disclosures
- style.css — indigo/lilac visual system, responsive layouts, card tilt, and motion preferences
- script.js — navigation, focus modes, skill search/filters, training filter, and card interactions
- scene.js — procedural 3D sculpture, lighting, camera, pointer controls, and rendering lifecycle
- three.min.js — self-hosted Three.js 0.187.0 browser bundle
- THREE-LICENSE.txt — the upstream Three.js MIT license
- README.txt — this guide

LOCAL PREVIEW
Open index.html in a current browser, or serve this directory with a local static HTTP server.
Google Fonts uses the existing external font links. System fonts are available as a fallback.

DESIGN AND NAVIGATION
- A sticky top navigation highlights the current section and shows reading progress.
- Tablet/mobile uses a keyboard-accessible disclosure menu, including short landscape screens.
- The sculpture changes geometry/color with Defense, Offense, and Research; the text comes from existing skills.
- Drag horizontally to rotate the sculpture. Mouse dragging also changes its vertical angle.
- Left/right, Pause/Play, and Reset controls also work with the keyboard.
- Skill descriptions use native details/summary elements and start expanded.
- Skills can be filtered by category and searched by title, description, or tool.
- The training section can show all learning or only the original current-study card.
- About, skills, labs, experience, training, and contact retain stable anchor links.
- Navigation and skill disclosures remain usable when JavaScript is unavailable.
- Reduced-motion preferences pause automatic 3D movement and disable card tilt and reveal transitions.
- Rendering stops offscreen or when the tab is hidden. Resolution is capped, with lighter geometry on mobile.
- When WebGL or the local 3D library is unavailable, CSS artwork replaces the sculpture.
- The 3D scene uses generated geometry and reflections; there are no remote model/texture downloads.

DEPENDENCY
Three.js 0.187.0 was obtained from the official npm registry and checked against its
published SHA-512 integrity value. The local IIFE bundle exposes window.THREE and
was built with esbuild 0.28.2 from this entry: import * as THREE from 'three';
window.THREE = THREE; . The upstream MIT license is included. Deployment needs
only these static files; no package installation or build service is required.

CONTENT
Personal details, skill descriptions, experience, education, and all 18 course/study
entries are retained from the supplied files. Training and current study keep their
existing status labels. The LinkedIn handle remains text because a verified full URL
was not supplied. No credentials, project results, or employment claims were added.

REVIEW
1. Drag the sculpture and switch among its three modes; try Pause/Play and Reset.
2. Open the mobile menu; test Escape, Tab, and section links.
3. Search/filter skills; open and close their details with a pointer and keyboard.
4. Switch the training filter; check the original labels and current-study entries.
5. Confirm email, GitHub, location, and the displayed LinkedIn handle.

This change is prepared on a review branch. Publishing is a separate step after review.
