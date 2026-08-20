import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AppV2 from "./AppV2";
import { AuthProvider } from "./auth";
import "./index.css";

const routerBasePath = (import.meta.env.VITE_BASE_PATH || "/").replace(/\/+$/, "") || "/";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasePath}>
      <AuthProvider><AppV2 /></AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
