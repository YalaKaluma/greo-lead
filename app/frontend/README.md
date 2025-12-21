# Leadership OS - Complete React Source Code
**FINAL WORKING VERSION - December 21, 2025**

This is the **complete, tested, working** source code that's currently running on your production site.

## ✅ Verified Working

This exact code is running at: `https://greo-lead-production.up.railway.app/`

All features confirmed working:
- ✅ Dark sidebar with proper styling
- ✅ Hierarchical goals with tree view
- ✅ Title fields in all Journey sections
- ✅ Values & Achievements sections
- ✅ TodoList without numbers, auto grey-out 11+
- ✅ Team page with Supervisors filter
- ✅ Icon-only buttons
- ✅ Calendar at bottom of sidebar
- ✅ White cards with consistent styling

## 📦 Package Contents

```
react-source-FINAL/
├── package.json              - Dependencies
├── vite.config.js           - Build configuration
├── App.jsx (3.7 KB)         - Main app with routing
├── main.jsx                 - Entry point
├── index.css                - Global styles
└── components/
    ├── MyGoals.jsx (21 KB)           - Hierarchical goals + tree view
    ├── MyLeadershipJourney.jsx (31 KB) - Journey with titles + Values/Achievements
    ├── TodoList.jsx (30 KB)          - Tasks (no numbers, auto grey-out)
    ├── MyTeam.jsx (16 KB)            - Team (Supervisors filter, icon buttons)
    ├── Sidebar.jsx (2.9 KB)          - Navigation (Calendar at bottom)
    └── MyJournal.jsx (6.5 KB)        - Message history
```

## 🎯 Complete Feature List

### **MyGoals.jsx**
- ✅ Hierarchical parent-child relationships (`parent_goal_id`)
- ✅ Tree structure view with visual connectors
- ✅ Time horizon filters: Long Term / Medium Term / Short Term (no emojis)
- ✅ Icon-only buttons: 📋 (Tasks), 🗂️ (Sub-Goals)
- ✅ Sub-goals count badge on hierarchy icon
- ✅ Exit hierarchy button
- ✅ White cards: `bg-white border border-gray-200 rounded-lg p-5 shadow-sm`
- ✅ Goal linking to tasks (URL parameter `?goal=123`)

### **MyLeadershipJourney.jsx**
**Card Styling:**
- ✅ EXACT same as Goals: `bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow`
- ✅ All sections uniform gray color (no colored backgrounds)

**Title Fields:**
- ✅ Strengths: Optional title field in add/edit forms, displays bold if exists
- ✅ Development Areas: Optional title field, displays bold if exists
- ✅ Projects: Uses `project_name` as title
- ✅ Failures: Optional title field, displays bold if exists
- ✅ Values: **Required** title field, always bold display
- ✅ Achievements: **Required** title field, always bold display

**Title Display Format:**
```jsx
{item.title && (
  <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
)}
<p className="text-slate-800 font-medium">{item.description}</p>
```

**Sections:**
1. 💪 Strengths (with optional title)
2. 📈 Development Areas (with optional title)
3. 🚀 Projects (project_name as title)
4. 📚 Failures & Learnings (with optional title)
5. ⭐ Values (with required title) - **NEW**
6. 🏆 Greatest Achievements (with required title) - **NEW**
7. ~~🌟 Opportunities~~ - **REMOVED** (redundant with Dev Areas)

**Features:**
- ✅ Click card to edit inline
- ✅ SimpleAddForm for quick entry
- ✅ Editable all fields
- ✅ Delete with confirmation

### **TodoList.jsx**
- ✅ **No task numbers** - Removed `<span>{index + 1}</span>` for more space
- ✅ **Tighter spacing** - Changed from `gap-3` to `gap-2`
- ✅ **Auto grey-out tasks 11+** - `${index >= 10 ? 'opacity-40' : ''}`
- ✅ Drag & drop reordering (react-beautiful-dnd)
- ✅ Priority flags: 🔴 High, 🟠 Medium, 🟢 Low (clickable dropdown)
- ✅ Due date badges with urgency colors (red/orange/amber/green)
- ✅ Project badges: 📁 ProjectName
- ✅ Delegate badges: 👤 PersonName
- ✅ Goal linking: Shows goal **TITLE** (not full description)
- ✅ URL filtering: `?delegate=Name` or `?goal=123`
- ✅ Inline editing with save/cancel
- ✅ Quick date picker (click badge)
- ✅ Persistent task order (maintained when toggling complete)

### **MyTeam.jsx**
- ✅ **Horizontal layout** - Name | Relation | [space] | Context | Icons
- ✅ **Filters:** All / Team Members / **Supervisors** / Mentors / Peers
- ✅ **No emoji icons** on filter buttons (clean text only)
- ✅ **Icon-only action buttons:**
  - 📋 Tasks (no text, hover blue)
  - 🤝 Help (no text, hover green)
- ✅ List layout (one person per row)
- ✅ Click card to edit
- ✅ Ask for Help → Creates delegated task
- ✅ Tasks link navigates to filtered todo-list

### **Sidebar.jsx**
- ✅ **Menu order:** Goals → Todo → Team → Journey → Journal → Feedback → **Calendar** (at bottom)
- ✅ Dark slate background: `bg-slate-800`
- ✅ White text: `text-white`
- ✅ Active state: `bg-blue-600 text-white shadow-lg`
- ✅ Disabled state: `opacity-60 cursor-not-allowed`
- ✅ Mobile responsive: Hamburger menu, slide-in animation
- ✅ Width: 320px (w-80)
- ✅ Header: "Your Executive Operating System" / "Powered by Alfred"

### **MyJournal.jsx**
- ✅ Conversation history with Alfred
- ✅ Filter: All / Alfred / Me
- ✅ Chronological display
- ✅ Message bubbles

### **App.jsx**
- ✅ Client-side routing (page state)
- ✅ URL parameter handling
- ✅ Mobile detection (< 1024px)
- ✅ Sidebar toggle management
- ✅ Mobile header with hamburger
- ✅ Dark overlay when sidebar open on mobile

## 🗄️ Backend Requirements

### Database Schema

```sql
-- Hierarchical Goals
ALTER TABLE journey_goals 
ADD COLUMN parent_goal_id INTEGER REFERENCES journey_goals(id);

-- Title columns for existing sections
ALTER TABLE journey_strengths ADD COLUMN title VARCHAR(200);
ALTER TABLE journey_development_areas ADD COLUMN title VARCHAR(200);
ALTER TABLE journey_failures ADD COLUMN title VARCHAR(200);

-- Timestamps for dev areas (if missing)
ALTER TABLE journey_development_areas 
ADD COLUMN first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Values table (NEW)
CREATE TABLE journey_values (
    id SERIAL PRIMARY KEY,
    user_number VARCHAR NOT NULL,
    title VARCHAR(200) NOT NULL,
    value_text TEXT NOT NULL,
    why TEXT,
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_journey_values_user ON journey_values(user_number);

-- Achievements table (NEW)
CREATE TABLE journey_achievements (
    id SERIAL PRIMARY KEY,
    user_number VARCHAR NOT NULL,
    title VARCHAR(200) NOT NULL,
    achievement_text TEXT NOT NULL,
    impact TEXT,
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_journey_achievements_user ON journey_achievements(user_number);
```

### Required API Endpoints

**Goals (with hierarchy):**
- GET/POST/PUT/DELETE `/api/journey/goals`
  - Schema must include `parent_goal_id: Optional[int]`

**Journey Sections (with titles):**
- GET/POST/PUT/DELETE `/api/journey/strengths` (title optional)
- GET/POST/PUT/DELETE `/api/journey/development-areas` (title optional)
- GET/POST/PUT/DELETE `/api/journey/projects`
- GET/POST/PUT/DELETE `/api/journey/failures` (title optional)
- GET/POST/PUT/DELETE `/api/journey/values` (title required) **NEW**
- GET/POST/PUT/DELETE `/api/journey/achievements` (title required) **NEW**

**Tasks:**
- GET/POST/PUT/DELETE `/api/tasks`
- PATCH `/api/tasks/{id}/toggle`
- GET `/api/tasks/filters`

**Team:**
- GET/POST/PUT/DELETE `/api/journey/people`

**Journal:**
- GET `/api/journal`

## 🎨 Design System

### Color Palette
```javascript
// Core colors
'bg-slate-800'    // Sidebar background
'bg-gray-50'      // Page background
'bg-white'        // Card backgrounds
'bg-blue-600'     // Primary buttons, active states

// Text colors
'text-white'      // Sidebar text
'text-slate-800'  // Primary text
'text-slate-600'  // Secondary text
'text-slate-400'  // Tertiary text

// Borders
'border-gray-200' // Card borders
'border-slate-700' // Sidebar dividers
```

### Typography Scale
```javascript
// Titles
'text-lg font-bold'      // Card titles

// Body
'text-base font-medium'  // Main content
'text-sm'                // Supporting text
'text-xs'                // Badges, labels
```

### Card Component (Goals & Journey)
```jsx
className="bg-white border border-gray-200 rounded-lg p-5 
           shadow-sm hover:shadow-md transition-shadow"
```

### Spacing System
```javascript
'p-5'      // Card padding
'gap-2'    // Tight spacing (TodoList)
'gap-4'    // Medium spacing
'gap-6'    // Large spacing
'mb-2'     // Title margin
```

## 📱 Responsive Design

### Breakpoints
- **Mobile:** `< 1024px`
  - Sidebar hidden by default
  - Hamburger menu
  - Full-width content
  - Sticky mobile header
  
- **Desktop:** `≥ 1024px`
  - Sidebar always visible (320px)
  - No hamburger
  - Flex layout

### Mobile-Specific Features
- Hamburger icon (☰) in top-left header
- Dark overlay (`bg-black bg-opacity-50`) when sidebar open
- Auto-close sidebar on navigation
- Touch-friendly tap targets (44px minimum)

## 🛠️ Development Setup

### Prerequisites
```json
{
  "node": ">=18.0.0",
  "npm": ">=9.0.0"
}
```

### Dependencies
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-beautiful-dnd": "^13.1.1",
  "axios": "^1.6.2"
}
```

### Install & Run
```bash
# Install dependencies
npm install

# Development server
npm run dev
# Opens on http://localhost:5173

# Production build
npm run build
# Outputs to ../static/
```

### Environment Variables
Create `.env` file:
```bash
VITE_API_URL=https://your-api.up.railway.app
VITE_USER_NUMBER=whatsapp:+17707789240
```

## 📝 Key Implementation Patterns

### 1. Hierarchical Goals with Tree View
```jsx
const [hierarchicalView, setHierarchicalView] = useState(null);

// Render logic
if (hierarchicalView) {
  const parentGoal = goals.find(g => g.id === hierarchicalView);
  const childGoals = goals.filter(g => g.parent_goal_id === hierarchicalView);
  // Show tree view with connectors
} else {
  // Show normal grid view
}
```

### 2. Journey Title Display
```jsx
// All journey items follow this pattern
{item.title && (
  <h4 className="text-lg font-bold text-slate-800 mb-2">
    {item.title}
  </h4>
)}
<p className="text-slate-800 font-medium">
  {item.strength || item.skill || item.failure_text}
</p>
```

### 3. TodoList Auto Grey-out
```jsx
<div className={`
  bg-white border border-gray-200 rounded px-3 py-3
  ${index >= 10 ? 'opacity-40' : ''}
`}>
  {/* Task content */}
</div>
```

### 4. URL Parameter Filtering
```jsx
// In App.jsx
const urlParams = new URLSearchParams(window.location.search);
const delegateFilter = urlParams.get('delegate');
const goalFilter = urlParams.get('goal');

// Pass to TodoList
<TodoList 
  initialDelegate={delegateFilter}
  initialGoal={goalFilter}
/>
```

## 🧪 Testing Checklist

### Goals Page
- [ ] Create parent goal
- [ ] Create child goal (select parent from dropdown)
- [ ] Click 🗂️ icon → See tree view
- [ ] Tree shows parent at top with green border
- [ ] Children show with visual connectors
- [ ] Exit hierarchy button works
- [ ] Click 📋 → Navigate to filtered tasks
- [ ] Time horizon filters work (no emojis visible)

### Journey Page
- [ ] All cards have white background (not colored)
- [ ] Add Strength with title → Title shows bold
- [ ] Add Dev Area with title → Title shows bold
- [ ] Add Failure with title → Title shows bold
- [ ] Add Value (title required) → Saves and displays
- [ ] Add Achievement (title required) → Saves and displays
- [ ] Values section visible at bottom
- [ ] Achievements section visible at bottom
- [ ] No Opportunities section
- [ ] Inline editing works

### TodoList
- [ ] No task numbers visible
- [ ] Create 12 tasks
- [ ] Tasks 1-10 normal brightness
- [ ] Tasks 11-12 greyed out (40% opacity)
- [ ] Drag & drop reordering works
- [ ] Goal badge shows TITLE not full text
- [ ] URL `?delegate=Name` filters correctly
- [ ] URL `?goal=123` filters correctly

### Team Page
- [ ] Context shows to RIGHT of name (not below)
- [ ] Supervisors filter button exists
- [ ] No emojis on filter buttons
- [ ] Tasks button is 📋 only (no text)
- [ ] Help button is 🤝 only (no text)
- [ ] Click 🤝 → Help panel opens
- [ ] Create task → Delegates correctly

### Sidebar
- [ ] Calendar is at bottom
- [ ] Order: Goals→Todo→Team→Journey→Journal→Feedback→Calendar
- [ ] Dark slate background
- [ ] Mobile: Hamburger shows/hides sidebar
- [ ] Mobile: Overlay closes sidebar when clicked

## 🚀 Build & Deploy

### Build for Production
```bash
npm run build

# Output:
# ../static/index.html
# ../static/assets/index-[hash].css
# ../static/assets/index-[hash].js
```

### Deploy to Railway
```bash
# Package static files
tar -czf static.tar.gz static/

# Deploy via git
git add static/
git commit -m "Update frontend"
git push  # Railway auto-deploys

# Or upload static files directly to Railway
```

### Verify Deployment
```bash
# Check CSS loads
curl https://your-app.railway.app/assets/index-[hash].css

# Should return CSS code (not 404)
```

## 📊 File Sizes
- MyGoals.jsx: 21 KB
- MyLeadershipJourney.jsx: 31 KB  
- TodoList.jsx: 30 KB
- MyTeam.jsx: 16 KB
- Sidebar.jsx: 2.9 KB
- MyJournal.jsx: 6.5 KB
- App.jsx: 3.7 KB

**Total:** ~110 KB uncompressed

**Built:**
- CSS: ~22 KB (4.6 KB gzipped)
- JS: ~355 KB (106 KB gzipped)

## 🎯 What Makes This Special

1. **Hierarchical thinking** - Goals break down into sub-goals visually
2. **Scannable journey** - Titles make everything easy to skim
3. **Smart prioritization** - Auto grey-out forces focus on top 10
4. **Integrated workflow** - Goals → Tasks → Team → Reflection
5. **Professional design** - Consistent white cards, clean layout
6. **Mobile optimized** - Works perfectly on phone
7. **Zero page reloads** - Instant navigation, smooth UX

## 📚 Additional Resources

See also:
- `DEPLOY_INSTRUCTIONS.md` - How to deploy static files
- `COMPLETE_DEPLOYMENT_GUIDE.md` - Full deployment checklist
- Backend files in `/backend` folder

---

**This is production-ready code currently running at:**
`https://greo-lead-production.up.railway.app/`

All features working, all bugs fixed, ready to use! 🎉

Last updated: December 21, 2025
