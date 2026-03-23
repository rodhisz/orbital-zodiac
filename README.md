# Fam Tree 🌳

A modern, interactive, and robust Family Tree (Silsilah Keluarga) management application built with **React**, **Vite**, **Supabase**, and **@xyflow/react**.

## ✨ Features

- **Interactive Tree Visualization**: Dynamic and responsive family tree layout using `@xyflow/react` and `dagre` layout engine.
- **Intelligent Bloodline Logic**: Automatically distinguishes between direct blood descendants and in-laws for a clear visual hierarchy.
- **Role-Based Access Control (RBAC)**:
  - 📖 **Guest**: View-only access to the tree and tables.
  - ✍️ **Editor**: Full CRUD (Create, Read, Update, Delete) permissions for family members.
  - 🛡️ **Super Admin**: Exclusive access to application settings, user management (promoting/demoting editors), and destructive operations.
- **Supabase Cloud Integration**: Real-time data synchronization and secure authentication.
- **Excel Data Management**:
  - **Import**: Batch add members via `.xlsx` files.
  - **Export**: Backup your entire silsilah to a spreadsheet.
- **Kinship Calculator (Kalkulator Nasab)**: Calculate and visualize relationships between any two family members.
- **Events Management**: Dedicated views for upcoming **Birthdays** and **Anniversaries**.
- **Modern UI/UX**:
  - **Glassmorphism Design** for a premium aesthetic.
  - **Dark & Light Mode** support.
  - **Image Cropper** for profile photos.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- npm / yarn
- Supabase Project

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/famtree.git
   cd famtree
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

### 🗄️ Database Setup (Supabase)

Run the following SQL in your Supabase SQL Editor to prepare the required tables:

#### 1. Table `family_members`
```sql
CREATE TABLE public.family_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT DEFAULT 'male',
  birth DATE,
  death DATE,
  photo TEXT,
  father_id TEXT,
  mother_id TEXT,
  spouses JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. Table `profiles` (User Management)
```sql
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  role TEXT DEFAULT 'editor',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
```

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite 7
- **Visualization**: @xyflow/react (React Flow)
- **Layout Engine**: Dagre
- **Styling**: Vanilla CSS (Custom Glassmorphism)
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Backend & Auth**: Supabase
- **Excel Processing**: SheetJS (XLSX)

---

Developed with ❤️ for family history preservation.
