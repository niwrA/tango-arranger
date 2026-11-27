# Installation and display
Production must be served over HTTPS. On Android Chrome use Install Tango Arranger on the home workspace when available, or the browser menu. On iOS use Safari's Share > Add to Home Screen. Installation is optional; ordinary browser use remains supported. No service worker or offline caching is added.
Display preferences live on the home workspace and default to awake during practice/performance, normal timeout while arranging. The operating system can deny or revoke the lock. Fullscreen remains an explicit user action and uses the existing compact stage fallback.
## Review checklist
- npm run build; npm run test:regression
- Android Chrome over HTTPS: install, launch standalone, verify icons and song storage, dismiss install prompt without errors.
- iOS Safari: browser and Home Screen launch, normal navigation/audio, fullscreen fallback, wake lock where supported.
- Practice and performance: screen stays awake without playback; exit to home/arrange releases; background/return reacquires; toggle preference and reload.
- Unsupported/insecure context and battery saver: no exceptions or misleading active indicator; normal timeout.
- Verify narrow-screen toolbar and fullscreen exit, including switching between activities.
