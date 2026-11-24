import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { Pill } from './Pill';

const capture = new URLSearchParams(location.search).get('capture') === '1';
if (capture) document.body.classList.add('capture-pill');

const el = document.getElementById('root');
if (el) createRoot(el).render(<StrictMode><Pill frozen={capture} /></StrictMode>);
