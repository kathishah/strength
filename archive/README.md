
# Micro-Session Strength & Mobility App

A mobile-first HTML app designed to guide twice-a-day micro workouts based on your DEXA-informed training plan.  
The app auto-selects the correct session (AM/PM), shows exercises one at a time, supports swipe navigation, progress tracking, and animated GIFs.

---

## 🚀 Features

### **1. Day & Session Awareness**
- Automatically detects the day of the week.
- Lets you switch between **AM** and **PM** micro-sessions.
- Each session is broken into phases (Warm-up, Strength, Mobility, etc.).

### **2. Exercise Cards**
- Each exercise displays:
  - Title  
  - Sets × reps  
  - Notes  
  - Tags  
  - Animated GIF / image  
- Swipe **left/right** or tap **Prev / Next** to move through exercises.

### **3. Progress Tracking**
- Each exercise can be marked **Done**.
- Progress is stored in `localStorage` per:
  - Date  
  - Day (e.g., Monday)  
  - Session (AM/PM)  
  - Exercise index  
- The header shows session progress:  
  `Session: X / Y exercises done`.

### **4. GIF Support (Peloton-style or Custom)**
- Use ready-made GIFs from the web (e.g., Peloton creators on Giphy) or host your own.
- Reference any remote URL directly in the `program` object and include attribution so the app can credit the artist/source.
- If a URL is missing or broken, the UI falls back to `gifs/not-found.svg` so it’s obvious which exercise still needs art.
- Includes an optional workflow for generating GIFs locally from frames (see below).

---

## 📁 Project Structure

```
strength/
  routine_micro.html        # main app
  gifs/                     # final animated GIFs (referenced by HTML)
    cat-cow.gif
    goblet-squat.gif
    ...
  frames/                   # PNG frames used to generate GIFs
    cat-cow/
      frame01.png
      frame02.png
      frame03.png
    goblet-squat/
      frame01.png
      ...
  make_gifs.sh              # script to convert frames -> GIFs
  README.md                 # this file
```

---

## 🛠 Setup Instructions

### **1. Open the App**
You can open `routine_micro.html` directly in:
- Safari (iPhone)
- Chrome (Android)
- Desktop browsers (for debugging)

Add it to your **Home Screen** for an app-like experience.

---

## 🎨 GIF Options

### **Option A: Link to Existing GIFs (Recommended)**
1. Find Peloton-style GIFs (Giphy has a rich catalog: [https://giphy.com/peloton](https://giphy.com/peloton)).
2. Update each exercise in `routine_micro.html`:

```js
gifUrl: "https://media.giphy.com/media/3oKIPp7fmUqbd6hbDi/giphy.gif",
attribution: {
  label: "Peloton creators on Giphy",
  url: "https://giphy.com/peloton"
}
```

3. If you omit `attribution`, the app auto-labels any `giphy.com` URL with a generic credit line.

### **Option B: Generate Your Own GIFs from Frames**

#### **1. Add your PNG frames**
Place Peloton-style PNG frames into:

```
frames/<exercise-slug>/frame01.png
frames/<exercise-slug>/frame02.png
frames/<exercise-slug>/frame03.png
```

Example:

```
frames/cat-cow/frame01.png
frames/cat-cow/frame02.png
frames/cat-cow/frame03.png
```

#### **2. Generate animated GIFs (Mac)**
Install ImageMagick:

```bash
brew install imagemagick
```

Run the script:

```bash
./make_gifs.sh
```

This auto-creates:

```
gifs/cat-cow.gif
gifs/goblet-squat.gif
...
```

#### **3. Reference the GIFs in the App**
In `routine_micro.html`, inside the `program` object:

```js
gifUrl: "gifs/cat-cow.gif"
```

Add attribution if needed:

```js
attribution: {
  label: "Shot by Coach Name",
  url: "https://example.com"
}
```

---

## 🔧 Customization

### **Edit Exercises**
Inside the `program` object:
- Modify exercises  
- Add or remove phases  
- Adjust sets/reps  
- Swap GIFs  

### **Change Look & Feel**
Edit CSS variables at the top of the HTML.

---

## 📱 Optional Enhancements
If you want them, I can add:

- Session timer  
- Rest timer  
- Sound/vibration cues  
- Weekly progress heatmap  
- Voice guidance  

---

## 📬 Support
Just ask ChatGPT for:
- Exercise animation generation  
- New HTML/CSS functionality  
- Updates to your plan  
- Additional utilities  

Enjoy the workouts and consistency!
