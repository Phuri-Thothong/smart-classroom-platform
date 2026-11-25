import { LayoutDashboard, Clock, Users, Zap, LogOut, Shield, Eye } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Sidebar({ activeTab, setActiveTab }) {
  const { user, isAdmin, logout } = useAuth();
  const navTabs = isAdmin ? ['dashboard', 'automation', 'users'] : ['dashboard', 'automation'];

  return (
    <aside className="w-64 bg-slate-800 text-slate-100 flex flex-col shadow-xl z-20 shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-slate-700">
        <Zap className="text-blue-400 mr-3" size={24} />
        <h1 className="text-lg font-bold">Smart Class</h1>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-2">
        {navTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`w-full flex items-center px-4 py-3 rounded-lg capitalize transition-colors ${activeTab === tab ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
          >
            {tab === 'dashboard' ? <LayoutDashboard className="mr-3" size={20} /> : tab === 'automation' ? <Clock className="mr-3" size={20} /> : <Users className="mr-3" size={20} />}
            <span className="font-medium">{tab}</span>
          </button>
        ))}
      </nav>

      {user && (
        <div className="p-4 border-t border-slate-700 bg-slate-800/80">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.full_name || user.username}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-slate-400 font-mono truncate">@{user.username}</span>
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${isAdmin ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-600 text-slate-200'}`}>
                  {isAdmin ? <Shield size={10} /> : <Eye size={10} />}
                  {user.role}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-700/70 hover:bg-red-600/90 text-slate-200 hover:text-white transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}
