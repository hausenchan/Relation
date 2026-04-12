import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(u => { setUser(u); localStorage.setItem('user', JSON.stringify(u)); })
      .catch(() => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const res = await authApi.login({ username, password });
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try { await authApi.logout(); } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  // 检查模块访问权限
  const canAccessModule = (module) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'member' || user.role === 'readonly') return true;
    if (user.role === 'guest') {
      const perm = user.modulePerms?.find(p => p.module === module);
      return perm?.can_read === 1;
    }
    return false;
  };

  const canWrite = (module) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'member') return true;
    if (user.role === 'readonly') return false;
    if (user.role === 'guest') {
      const perm = user.modulePerms?.find(p => p.module === module);
      return perm?.can_write === 1;
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canAccessModule, canWrite }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
