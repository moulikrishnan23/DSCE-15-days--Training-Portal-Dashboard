# DSCE Training Management Portal (Option A Dynamic Architecture)

Fast React/Vite frontend backed by Google Apps Script + Google Sheets for **Dhanalakshmi Srinivasan College of Engineering (DSCE), Coimbatore**.

---

## Key Features

1. **15-Day Training Program**: Tailored for DSCE's 15-day Aptitude & Soft Skills training curriculum.
2. **79-Sheet Dynamic Workbook Handling**: Supports 19 individual department tabs (`Dep1` to `Dep19`) across Attendance, Pre-Test, Post-Test, and Mock Interviews.
3. **Three-Tier User Roles**:
   - **`lesuccess admin`**: Full view/edit permissions across all modules + exclusive access to the **Sheet Management Admin Portal**.
   - **`college admin`**: Read-only view permissions across all pages and reports (editing controls disabled).
   - **`trainer`**: Operational edit permissions for Attendance, Test Scores, Mock Interviews, and Syllabus.

---

## Project Structure

```text
DSCE-Training-Portal-Dashboard/
├── src/
│   ├── components/
│   │   ├── Common.jsx
│   │   ├── Layout.jsx
│   │   └── Login.jsx
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Attendance.jsx
│   │   ├── Syllabus.jsx
│   │   ├── Tests.jsx
│   │   ├── PostTest.jsx
│   │   ├── MockInterview.jsx
│   │   ├── SimpleTables.jsx (Pre vs Post)
│   │   └── AdminSheetManager.jsx (LeSuccess Admin Portal)
│   ├── services/
│   │   └── appsScript.js
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── Code.gs
├── .env.example
├── package.json
└── index.html
```

---

## Apps Script Setup

1. Open Google Apps Script connected to your `DSCE_31st_Aug_(15 days).xlsx` Google Spreadsheet.
2. Paste the contents of `Code.gs`.
3. Set `CONFIG.SPREADSHEET_ID` to your live Google Sheet ID.
4. Deploy as a Web App:
   - **Execute as**: Me
   - **Who has access**: Anyone
5. Copy the `/exec` deployment URL and paste it into `.env.local`:

```env
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

---

## Local Development & Build

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Build for production
npm run build
```
