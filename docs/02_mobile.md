# Sovereign Mobile Shell App — Technical Specification (v1)

## 1. Overview

The Sovereign Mobile app is a WebView shell client for iOS and Android.

- It does not implement Sovereign UI natively.
- It loads an existing Sovereign web instance inside a secure WebView.
- On first launch, the user can configure the base URL of their Sovereign instance.
- If skipped, the app uses a default URL.
- That URL is stored securely and reused for subsequent launches.

Future versions may add native features (push notifications, offline sync), but v1 focuses on a minimal, stable shell.

---

## 2. Platforms & Tech Stack

- Platforms:
  - iOS ≥ 15
  - Android ≥ 8 (API 26)
- Recommended stack:
  - React Native (TypeScript), preferably Expo-managed workflow.
  - `react-native-webview` for the browser layer.

---

## 3. High-Level App Flow

1. **App launch**
   - Check if `currentInstanceUrl` exists in secure storage.
   - If yes → open the Main WebView Screen.
   - If no → open the Instance Setup Screen.

2. **Instance Setup Screen**
   - User enters their Sovereign workspace URL or selects “Use default instance”.
   - URL is validated and stored.

3. **Main WebView Screen**
   - Full-screen WebView that points to the stored instance URL.
   - Handles:
     - Loading indicator
     - External link interception
     - Network errors
     - Android back button behavior

4. **Settings Screen**
   - Accessible from a menu icon in the WebView.
   - Allows editing or resetting the configured URL.

---

## 4. Instance URL Handling

### 4.1 Storage

Use secure storage per platform:

- iOS → Keychain
- Android → EncryptedSharedPreferences
- Key: `sovereignInstanceUrl`

### 4.2 Validation

Rules for user-entered URL:

1. Must use **https://** (auto-prepend if missing).
2. Must be a valid URL with no spaces.
3. Optional: Make a test request to `/health` or `/` to confirm reachability.

If validation succeeds → save and load WebView.  
If fails → user sees an error message and can retry.

### 4.3 Default URL

Constant in config:

```
DEFAULT_SOVEREIGN_URL = "https://app.sovereign.example"
```

If the user selects _Use default instance_, the app:

- Stores this URL.
- Opens it in the WebView.

---

## 5. Screens

### 5.1 Instance Setup Screen

UI:

- Title: “Connect to Sovereign”
- Text input: `https://your-workspace.example`
- Buttons:
  - **Continue**
  - **Use default instance**

Behavior:

- Continuation triggers validation.
- Success → store URL → WebView.
- Failure → error message.

---

### 5.2 Main WebView Screen

**Elements:**

- Full WebView
- Header with:
  - Loading indicator
  - Menu button → Settings

**WebView Configuration:**

- JavaScript enabled.
- DOM storage enabled.
- `onNavigationStateChange` to detect external links.
- `startInLoadingState` or custom loader.
- `onError` → show Retry / Change Instance UI.

**External Link Handling:**

- If navigation target domain differs from the instance domain:
  - Open via `Linking.openURL`.
  - Do not navigate inside WebView.

**Android Back Button:**

- If WebView `canGoBack` → go back inside WebView.
- Else → exit app.

**Optional:** Pull-to-refresh → reload WebView.

---

### 5.3 Settings Screen

Contains:

- Current instance URL (read-only)
- Change URL button (opens URL form)
- App version
- Reset app button
  - Clears stored URL
  - Clears WebView data
  - Returns to Instance Setup Screen

---

## 6. Security Requirements

1. **HTTPS only** — reject `http://`.
2. **No mixed content** — keep WebView secure.
3. **Cookies remain inside WebView** — no native interception.
4. **No arbitrary JS injection** in v1.

---

## 7. Native–Web Bridge (v1 Scope)

v1 includes a minimal bridge.

### 7.1 Message Format

Messages sent from the web:

```
{ type: "OPEN_EXTERNAL", url: string }
{ type: "LOG", level: "info" | "warn" | "error", message: string }
```

React Native handles these via `onMessage`.

### 7.2 v1 Implementations

- `OPEN_EXTERNAL` → open system browser.
- `LOG` → console output.

### 7.3 Reserved for v2

- Push token request
- File picker access
- Share sheet invocation

---

## 8. Error Handling & UX

### When WebView cannot load:

Show an error overlay with:

- “Retry” → reload WebView
- “Change instance” → Settings

### URL validation errors:

Clear, readable messages such as:

- “Server unreachable”
- “Connection not secure”
- “Invalid URL format”

---

## 9. Project Structure (Recommended)

```
src/
  App.tsx
  navigation/
    RootNavigator.tsx
  screens/
    InstanceSetupScreen.tsx
    WebViewScreen.tsx
    SettingsScreen.tsx
  components/
    InstanceUrlForm.tsx
    LoadingIndicator.tsx
    ErrorOverlay.tsx
  services/
    storage.ts
    validation.ts
  constants/
    config.ts
  hooks/
    useInstanceUrl.ts
    useBackHandler.ts
```

---

## 10. Acceptance Criteria (v1)

- User can configure, persist, and change instance URL.
- App loads the Sovereign web app via WebView.
- External links open outside the WebView.
- Back navigation works properly on Android.
- Reset fully clears configuration and cached WebView data.
- Only HTTPS URLs are accepted.
- Errors are clearly communicated.

---

This completes the v1 specification for the Sovereign Mobile Shell App.
