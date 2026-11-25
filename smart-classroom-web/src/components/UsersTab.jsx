import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Edit3, Trash2, Shield, Eye, X, AlertCircle } from 'lucide-react';
import { authFetch } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ConfirmModal from './ConfirmModal';

function formatCreatedAt(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour12: false,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function UsersTab() {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [usersList, setUsersList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    password: '',
    role: 'viewer',
    is_active: true,
  });

  const loadUsers = useCallback(async () => {
    try {
      const res = await authFetch('/users');
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsersList(Array.isArray(data) ? data : []);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let isMounted = true;

    const fetchInitialUsers = async () => {
      try {
        const res = await authFetch('/users');
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        if (isMounted) setUsersList(Array.isArray(data) ? data : []);
      } catch (error) {
        if (isMounted) showToast(error.message, 'error');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchInitialUsers();
    return () => {
      isMounted = false;
    };
  }, [showToast]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormError('');
    setFormData({ username: '', full_name: '', password: '', role: 'viewer', is_active: true });
    setIsModalOpen(true);
  };

  const openEditModal = (target) => {
    setEditingUser(target);
    setFormError('');
    setFormData({
      username: target.username,
      full_name: target.full_name || '',
      password: '',
      role: target.role,
      is_active: target.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setIsSaving(true);

    try {
      let res;
      if (editingUser) {
        const payload = {
          full_name: formData.full_name,
          role: formData.role,
          is_active: formData.is_active,
        };
        if (formData.password.trim()) {
          payload.password = formData.password;
        }
        res = await authFetch(`/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch('/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: formData.username.trim(),
            full_name: formData.full_name.trim(),
            password: formData.password,
            role: formData.role,
          }),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map(d => d.msg).join(', ')
          : data.detail;
        throw new Error(detail || 'Failed to save user');
      }

      setIsModalOpen(false);
      await loadUsers();
      showToast(editingUser ? `Updated user '${editingUser.username}'` : `Created user '${formData.username.trim()}'`, 'success');
    } catch (error) {
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await authFetch(`/users/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to delete user');
      showToast(`Deleted user '${deleteTarget.username}'`, 'success');
      setDeleteTarget(null);
      await loadUsers();
    } catch (error) {
      showToast(error.message, 'error');
      setDeleteTarget(null);
    }
  };

  const isEditingSelf = editingUser && editingUser.id === currentUser?.id;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">User Management</h3>
              <p className="text-xs text-slate-500">Manage Admin and Viewer accounts for Smart Classroom Platform</p>
            </div>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
          >
            <UserPlus size={16} />
            Add User
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 font-medium">User</th>
                <th className="p-4 font-medium">Role</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Created (UTC+7)</th>
                <th className="p-4 font-medium text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading ? (
                <tr><td colSpan="5" className="text-center py-10 text-slate-400">Loading users...</td></tr>
              ) : usersList.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-10 text-slate-400">No users found</td></tr>
              ) : (
                usersList.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const isAdminRole = u.role === 'admin';
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold uppercase ${isAdminRole ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            {(u.username || '?').slice(0, 2)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800">{u.full_name || u.username}</span>
                              {isSelf && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
                                  YOU
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-400 font-mono">@{u.username}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold uppercase ${isAdminRole ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                          {isAdminRole ? <Shield size={12} /> : <Eye size={12} />}
                          {u.role}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${u.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${u.is_active ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                          {u.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-500 whitespace-nowrap">
                        {formatCreatedAt(u.created_at)}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="Edit User"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(u)}
                            disabled={isSelf}
                            className={`p-1.5 rounded-md transition-colors ${isSelf ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                            title={isSelf ? 'Cannot delete your own account' : 'Delete User'}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-semibold text-slate-800">
                {editingUser ? `Edit User: @${editingUser.username}` : 'Create New User'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 text-red-600 text-sm border border-red-100">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {!editingUser && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={50}
                    placeholder="e.g. viewer01"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full border border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Lab Observer"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {editingUser ? 'New Password (leave blank to keep current)' : 'Password (min 6 characters)'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  minLength={6}
                  maxLength={72}
                  placeholder={editingUser ? '••••••••' : 'Enter password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full border border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
                  <select
                    value={formData.role}
                    disabled={isEditingSelf}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full border border-slate-300 rounded-md text-sm p-2 bg-white outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="viewer">Viewer (Read-Only)</option>
                    <option value="admin">Admin (Full Access)</option>
                  </select>
                </div>

                {editingUser && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Account Status</label>
                    <select
                      value={formData.is_active ? 'active' : 'disabled'}
                      disabled={isEditingSelf}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
                      className="w-full border border-slate-300 rounded-md text-sm p-2 bg-white outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete User Account?"
        message={deleteTarget ? `Are you sure you want to permanently delete user '@${deleteTarget.username}'?` : ''}
        confirmText="Yes, Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
