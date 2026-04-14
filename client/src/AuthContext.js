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
    if (['admin', 'member', 'readonly', 'leader', 'sales_director'].includes(user.role)) return true;
    if (user.role === 'guest') {
      const perm = user.modulePerms?.find(p => p.module === module);
      return perm?.can_read === 1;
    }
    return false;
  };

  // 检查菜单可见权限（admin 始终全部可见，其他用户依据 menuPerms 配置）
  const canAccessMenu = (menuKey) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return Array.isArray(user.menuPerms) && user.menuPerms.includes(menuKey);
  };

  const canWrite = (module) => {
    if (!user) return false;
    if (['admin', 'member', 'leader', 'sales_director'].includes(user.role)) return true;
    if (user.role === 'readonly') return false;
    if (user.role === 'guest') {
      const perm = user.modulePerms?.find(p => p.module === module);
      return perm?.can_write === 1;
    }
    return false;
  };

  // 是否可以审批
  const canApprove = () => ['admin', 'leader', 'sales_director'].includes(user?.role);

  // 是否可以指派人脉
  const canAssign = () => ['admin', 'leader', 'sales_director'].includes(user?.role);

  // 是否为高管
  const isExecutive = () => user?.executive_role && ['ceo', 'coo', 'cto', 'cmo'].includes(user.executive_role);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canAccessModule, canWrite, canAccessMenu, canApprove, canAssign, isExecutive }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
