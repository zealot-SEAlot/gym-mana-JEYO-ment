// The two kinds of page: the door tablet's page, which has no account and no sign-in, and the
// signed-in shell with the owner and staff screens (KTD20).
import { Route, Routes } from "react-router";

import { PairPage } from "../door/PairPage.tsx";
import { AppShell } from "./AppShell.tsx";

export function App() {
  return (
    <Routes>
      <Route path="/door" element={<PairPage />} />
      {/* Everything else; the shell picks the screen from the rest of the address */}
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}
