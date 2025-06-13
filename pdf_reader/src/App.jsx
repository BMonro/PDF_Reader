import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import PdfReader from './components/pdfReader';
import './App.css';

// Ініціалізація клієнта Supabase
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function App() {
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    getDocuments();
  }, []);

  async function getDocuments() {
    const { data, error } = await supabase.from("documents").select();
    if (error) {
      console.error("Помилка при отриманні документів:", error);
    } else {
      setDocuments(data);
    }
  }

  return <PdfReader documents={documents} />;
}

export default App;
