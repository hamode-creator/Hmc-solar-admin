import React from "react";
import {createRoot} from "react-dom/client";
import {HmcAdmin} from "./hmc-app";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><HmcAdmin/></React.StrictMode>
);
