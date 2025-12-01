import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CreateLink from './pages/CreateLink';
import ShlList from './pages/ShlList';
import ShlDetails from './pages/ShlDetails';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreateLink />} />
        <Route path="/links" element={<ShlList />} />
        <Route path="/links/:id" element={<ShlDetails />} />
      </Routes>
    </BrowserRouter>
  );
}
