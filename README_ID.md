# Fam Tree 🌳 (Bahasa Indonesia)

Aplikasi manajemen Silsilah Keluarga yang modern, interaktif, dan tangguh. Dibangun menggunakan **React**, **Vite**, **Supabase**, dan **@xyflow/react**.

## ✨ Fitur Utama

- **Visualisasi Pohon Keluarga Interaktif**: Layout pohon yang dinamis dan responsif menggunakan `@xyflow/react` dengan mesin pengaturan otomatis `dagre`.
- **Logika Garis Darah Cerdas**: Secara otomatis membedakan antara keturunan darah langsung dan pasangan (pendatang) untuk hierarki visual yang lebih jernih.
- **Kontrol Akses Berbasis Role (RBAC)**:
  - 📖 **Pelanggan (Guest)**: Akses hanya-baca (view-only) untuk melihat pohon dan tabel.
  - ✍️ **Editor**: Izin CRUD (Tambah, Baca, Ubah, Hapus) penuh untuk data anggota keluarga.
  - 🛡️ **Super Admin**: Akses eksklusif ke pengaturan aplikasi, manajemen pengguna (pengaturan role), dan penghapusan data total.
- **Integrasi Supabase Cloud**: Sinkronisasi data real-time dan autentikasi yang aman.
- **Manajemen Data Excel**:
  - **Impor**: Tambah banyak anggota sekaligus melalui file `.xlsx`.
  - **Ekspor**: Cadangkan seluruh silsilah Anda ke dalam format spreadsheet.
- **Kalkulator Nasab**: Hitung dan visualisasikan hubungan kekerabatan antara dua anggota keluarga mana pun.
- **Manajemen Acara**: Halaman khusus untuk memantau **Ulang Tahun** dan **Anniversary** yang akan datang.
- **UI/UX Modern**:
  - Desain **Glassmorphism** untuk tampilan premium.
  - Dukungan **Mode Terang & Gelap**.
  - **Pemotong Gambar (Image Cropper)** untuk foto profil anggota.

## 🚀 Memulai

### Prasyarat

- Node.js (v18+)
- npm / yarn
- Proyek Supabase

### Instalasi

1. Clone repositori ini:
   ```bash
   git clone https://github.com/usernameanda/famtree.git
   cd famtree
   ```

2. Instal dependensi:
   ```bash
   npm install
   ```

3. Setup variabel lingkungan (Environment Variables):
   Buat file `.env` di direktori root:
   ```env
   VITE_SUPABASE_URL=url_supabase_anda
   VITE_SUPABASE_ANON_KEY=anon_key_supabase_anda
   ```

4. Jalankan server pengembangan:
   ```bash
   npm run dev
   ```

### 🗄️ Setup Database (Supabase)

Jalankan SQL berikut di Editor SQL Supabase Anda untuk menyiapkan tabel yang dibutuhkan:

#### 1. Tabel `family_members`
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

#### 2. Tabel `profiles` (Manajemen Pengguna)
```sql
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  role TEXT DEFAULT 'editor',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aktifkan RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Kebijakan (Policies)
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Admins can manage all profiles" ON profiles FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);
```

## 🛠️ Stack Teknologi

- **Frontend**: React 19, Vite 7
- **Visualisasi**: @xyflow/react (React Flow)
- **Mesin Layout**: Dagre
- **Styling**: Vanilla CSS (Custom Glassmorphism)
- **Animasi**: Framer Motion
- **Ikon**: Lucide React
- **Backend & Auth**: Supabase
- **Pemrosesan Excel**: SheetJS (XLSX)

---

Dibuat dengan ❤️ untuk pelestarian sejarah keluarga.
