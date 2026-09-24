import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { api, clearToken, getToken, setToken } from "./api.js";
import AuthPage from "./pages/Auth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Board from "./pages/Board.jsx";

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    api("/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => clearToken())
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!user) {
      setSocket(null);
      setNotifications([]);
      return;
    }
    const connection = io({ auth: { token: getToken() } });
    setSocket(connection);
    api("/notifications")
      .then((data) => setNotifications(data.notifications))
      .catch(() => {});
    connection.on("notification", (note) => {
      setNotifications((current) => [note, ...current].slice(0, 40));
    });
    return () => connection.disconnect();
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      socket,
      notifications,
      unread: notifications.filter((note) => !note.read).length,
      async login(email, password) {
        const data = await api("/auth/login", { method: "POST", body: { email, password } });
        setToken(data.token);
        setUser(data.user);
        navigate("/");
      },
      async register(name, email, password) {
        const data = await api("/auth/register", { method: "POST", body: { name, email, password } });
        setToken(data.token);
        setUser(data.user);
        navigate("/");
      },
      logout() {
        clearToken();
        setUser(null);
        navigate("/login");
      },
      async markRead(ids) {
        await api("/notifications/read", { method: "POST", body: ids ? { ids } : {} });
        setNotifications((current) =>
          current.map((note) =>
            !ids || ids.includes(note.id) ? { ...note, read: true } : note
          )
        );
      },
    }),
    [user, socket, notifications, navigate]
  );

  if (!ready) {
    return (
      <div className="boot">
        <span>Keel</span>
      </div>
    );
  }

  return (
    <AppContext.Provider value={value}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <AuthPage mode="login" />} />
        <Route path="/register" element={user ? <Navigate to="/" /> : <AuthPage mode="register" />} />
        <Route path="/" element={user ? <Dashboard /> : <Navigate to="/login" />} />
        <Route path="/projects/:id" element={user ? <Board /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={user ? "/" : "/login"} />} />
      </Routes>
    </AppContext.Provider>
  );
}
