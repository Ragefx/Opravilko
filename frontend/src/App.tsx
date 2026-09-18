import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Today from "./pages/Today";
import Upcoming from "./pages/Upcoming";
import ProjectView from "./pages/ProjectView";
import LabelView from "./pages/LabelView";
import FilterView from "./pages/FilterView";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<Layout />}>
        <Route index element={<Navigate to="today" replace />} />
        <Route path="today" element={<Today />} />
        <Route path="upcoming" element={<Upcoming />} />
        <Route path="inbox" element={<ProjectView />} />
        <Route path="project/:id" element={<ProjectView />} />
        <Route path="label/:name" element={<LabelView />} />
        <Route path="filter/:id" element={<FilterView />} />
      </Route>
      <Route path="*" element={<Navigate to="/app/today" replace />} />
    </Routes>
  );
}
