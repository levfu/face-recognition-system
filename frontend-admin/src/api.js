import axios from 'axios';

/** Relative /api when served behind nginx proxy; fallback for Vite dev. */
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({ baseURL: API_BASE });

export function authHeaders() {
  const token = localStorage.getItem('adminToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getRole() {
  return localStorage.getItem('adminRole') ?? 'admin';
}

export function getUsername() {
  return localStorage.getItem('adminUsername') ?? '';
}
