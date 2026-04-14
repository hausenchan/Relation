import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { authApi } from './api';

const AuthContext = createContext(null);
const IDLE_TIMEOUT = 2 * 60 * 60 * 1000; // 2小时

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef(null);

  const doLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/login';
  }, []);

  // 无操作超时检测
  useEffect(() => {
    if (!user) return;
    const reset = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(doLogout, IDLE_TIMEOUT);
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach(e => window.addEventListener(e, reset));
    reset();
    return () => {
      clearTimeout(idleTimer.current);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [user, doLogout]);

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
    doLogout();
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
  const isExecutive = () => {
    const execRoles = ['ceo', 'coo', 'cto', 'cmo'];
    return execRoles.includes(user?.executive_role) || execRoles.includes(user?.role);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canAccessModule, canWrite, canAccessMenu, canApprove, canAssign, isExecutive }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
