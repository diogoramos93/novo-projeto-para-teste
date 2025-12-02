import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Camera, LayoutDashboard, Home as HomeIcon } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">FaceFind</span>
          </Link>

          <nav className="flex items-center gap-4">
            <Link 
              to="/" 
              className={`p-2 rounded-full transition-colors ${!isAdmin ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
              title="Início"
            >
              <HomeIcon className="w-5 h-5" />
            </Link>
            <Link 
              to="/admin" 
              className={`p-2 rounded-full transition-colors ${isAdmin ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
              title="Área Administrativa"
            >
              <LayoutDashboard className="w-5 h-5" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {children}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 mt-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-slate-400 text-sm">
          <p>© {new Date().getFullYear()} FaceFind. Reconhecimento Facial 100% no Cliente.</p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;