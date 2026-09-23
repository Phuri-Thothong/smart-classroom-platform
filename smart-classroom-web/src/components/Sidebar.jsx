import { LayoutDashboard, Clock, Users, Zap } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
  return (
    <aside className="w-64 bg-slate-800 text-slate-100 flex flex-col shadow-xl z-20">
      <div className="h-16 flex items-center px-6 border-b border-slate-700">
        <Zap className="text-blue-400 mr-3" size={24} />
        <h1 className="text-lg font-bold">Smart Class</h1>
      </div>
      <nav className="flex-1 py-6 px-3 space-y-2">
        {['dashboard', 'automation', 'users'].map(tab => (
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
    </aside>
  );
}
