import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import PdfReader from './components/pdfReader'
import './App.css'

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

function App() {
  const [instruments, setInstruments] = useState([]);
  
  useEffect(() => {
    getInstruments();
  }, []);
  
  async function getInstruments() {
    const { data } = await supabase.from("instruments").select();
    setInstruments(data);
  }
  return <PdfReader />
}

export default App