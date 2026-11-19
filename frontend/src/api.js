import axios from 'axios';

const TOKEN_KEY = 'token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001' });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const errorMessage = (err) => err.response?.data?.error ?? 'No se pudo conectar con el servidor';
