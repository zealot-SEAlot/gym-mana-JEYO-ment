// The pages that need no sign-in (the door tablet's pairing page, and owner setup and recovery on
// the gym PC), and the signed-in shell with the owner and staff screens around everything else
// (KTD20).
import { Route, Routes } from "react-router";

import { PairPage } from "../door/PairPage.tsx";
import { RecoveryPage, SetupPage } from "../setup/SetupPage.tsx";
import { AppShell } from "./AppShell.tsx";

export function App() {
  return (
    <Routes>
      <Route path="/door" element={<PairPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/recover" element={<RecoveryPage />} />
      {/* Everything else; the shell picks the screen from the rest of the address */}
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}
