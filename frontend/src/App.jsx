import { PackageCheck } from "lucide-react";

function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-12">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-700 text-white">
            <PackageCheck aria-hidden="true" size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-800">GEM Condominium</p>
            <h1 className="text-3xl font-semibold tracking-normal">Parcel Nexus</h1>
          </div>
        </div>

        <div className="max-w-2xl">
          <p className="text-lg leading-8 text-slate-700">
            This is the frontend for Parcel Nexus, a package management system for GEM Condominium. It allows residents to view and manage their packages, and provides a dashboard for the building manager to oversee all deliveries. The backend is built with Node.js and Express, while the frontend is built with React and Vite.
          </p>
        </div>
      </section>
    </main>
  );
}

export default App;
